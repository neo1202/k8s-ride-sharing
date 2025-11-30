terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# 定義網域名稱 (方便管理)
locals {
  domain_name = "neo1202-k8s-ride-sharing.com"
}

# ==========================================
# 1. 網路層 (VPC)
# ==========================================
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "ride-share-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true

  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
}

# ==========================================
# 2. EKS Cluster (v20 + K8s 1.32)
# ==========================================
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "ride-share-cluster"
  cluster_version = "1.32"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true
  authentication_mode            = "API_AND_CONFIG_MAP"
  
  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    one = {
      name           = "node-group-1"
      instance_types = ["t3.medium"]
      min_size       = 1
      max_size       = 2
      desired_size   = 1
    }
  }
}

# ==========================================
# 3. 資料庫與安全群組
# ==========================================
module "security_group_db" {
  source  = "terraform-aws-modules/security-group/aws"
  version = "~> 5.0"

  name        = "ride-share-db-sg"
  vpc_id      = module.vpc.vpc_id

  ingress_with_cidr_blocks = [
    {
      from_port   = 5432
      to_port     = 5432
      protocol    = "tcp"
      description = "PostgreSQL access from VPC"
      cidr_blocks = module.vpc.vpc_cidr_block
    },
  ]
}

module "db" {
  source  = "terraform-aws-modules/rds/aws"
  version = "~> 6.0"

  identifier = "ride-share-db"

  engine               = "postgres"
  engine_version       = "16"
  family               = "postgres16"
  major_engine_version = "16"
  instance_class       = "db.t3.micro"

  allocated_storage     = 20
  max_allocated_storage = 100

  db_name  = "chat_db"
  username = "db_admin"
  port     = 5432

  password                    = var.db_password
  manage_master_user_password = false

  vpc_security_group_ids = [module.security_group_db.security_group_id]
  subnet_ids             = module.vpc.private_subnets
  create_db_subnet_group = true

  skip_final_snapshot = true
  publicly_accessible = false
}

# ==========================================
# 4. HTTPS 自動化 (ACM + Route53)
# ==========================================

# 讀取你的 Route53 Hosted Zone (必須先手動在 AWS 買好網域)
data "aws_route53_zone" "main" {
  name         = local.domain_name
  private_zone = false
}

# 申請證書
resource "aws_acm_certificate" "cert" {
  domain_name       = local.domain_name
  validation_method = "DNS"
  subject_alternative_names = ["*.${local.domain_name}"]

  lifecycle {
    create_before_destroy = true
  }
}

# 自動建立驗證 DNS 紀錄
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.main.zone_id
}

# 等待驗證通過 (Terraform 會暫停在這裡直到 AWS 說 OK)
resource "aws_acm_certificate_validation" "cert" {
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# ==========================================
# 5. K8s & Helm Provider 設定
# ==========================================
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
    }
  }
}

# ==========================================
# 6. 自動安裝 Nginx (掛載 ACM 憑證)
# ==========================================
resource "helm_release" "nginx_ingress" {
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = "ingress-nginx"
  create_namespace = true

  depends_on = [module.eks]

  set {
    name  = "controller.service.type"
    value = "LoadBalancer"
  }
  # 🔥 [修改] 啟用 NLB (Network Load Balancer) 解決 WebSocket 問題
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-type"
    value = "nlb"
  }
  # 允許跨可用區負載平衡
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-cross-zone-load-balancing-enabled"
    value = "true"
  }
  # 🔥 掛載憑證 (使用剛剛申請到的 ARN)
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-ssl-cert"
    value = aws_acm_certificate_validation.cert.certificate_arn
  }
  
  # 開啟 HTTPS 443 並將後端流量轉為 HTTP
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-backend-protocol"
    value = "http"
  }
  set {
    name  = "controller.service.annotations.service\\.beta\\.kubernetes\\.io/aws-load-balancer-ssl-ports"
    value = "443"
  }
  set {
    name  = "controller.service.ports.https"
    value = "443"
  }
  set {
    name  = "controller.service.targetPorts.https"
    value = "http"
  }
}

# ==========================================
# 7. 自動 DNS 指向 (Route53 -> LB)
# ==========================================

# 抓取 Nginx Load Balancer 的網址 (等待 Helm 跑完)
# data "kubernetes_service" "nginx_service" {
#   metadata {
#     name      = "ingress-nginx-controller"
#     namespace = helm_release.nginx_ingress.namespace
#   }
#   depends_on = [helm_release.nginx_ingress]
# }

# # 設定 A Record Alias 指向 LB
# resource "aws_route53_record" "web" {
#   zone_id = data.aws_route53_zone.main.zone_id
#   name    = local.domain_name
#   type    = "A"

#   alias {
#     name                   = data.kubernetes_service.nginx_service.status.0.load_balancer.0.ingress.0.hostname
#     zone_id                = data.aws_route53_zone.main.zone_id # 嘗試自動抓取，或填入 ELB 的固定 Zone ID
#     evaluate_target_health = true
#   }
# }

# ==========================================
# 8. K8s Config & Secret & Reloader
# ==========================================
resource "kubernetes_config_map" "app_config" {
  metadata { name = "app-config" }
  data = {
    POSTGRES_HOST    = module.db.db_instance_address
    POSTGRES_USER    = "db_admin"
    GOOGLE_CLIENT_ID = "189871282006-gml6na5q64t9hb35echhcpiu7k3qco4d.apps.googleusercontent.com"
    APP_ENV          = "production"
    POSTGRES_SSLMODE = "require"
  }
  depends_on = [module.eks]
}

resource "kubernetes_secret" "app_secret" {
  metadata { name = "app-secret" }
  data = {
    POSTGRES_PASSWORD = var.db_password
    JWT_SECRET        = var.jwt_secret
  }
  type = "Opaque"
  depends_on = [module.eks]
}

resource "helm_release" "reloader" {
  name       = "reloader"
  repository = "https://stakater.github.io/stakater-charts"
  chart      = "reloader"
  namespace  = "kube-system"
  create_namespace = true
  set {
    name  = "reloader.watchGlobally"
    value = "false"
  }
  depends_on = [module.eks]
}

# Outputs
output "configure_kubectl" {
  description = "Run this command to configure kubectl"
  value       = "aws eks --region us-east-1 update-kubeconfig --name ride-share-cluster"
}

output "website_url" {
  description = "Your secure website URL"
  value       = "https://${local.domain_name}"
}