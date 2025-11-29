terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    # 加入 Helm Provider
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

  # 這些標籤對 AWS Load Balancer 很重要
  public_subnet_tags = {
    "kubernetes.io/role/elb" = 1
  }
}

# ==========================================
# 2. EKS Cluster (v20 + K8s 1.31)
# ==========================================
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0" # 🔥 使用最新架構

  cluster_name    = "ride-share-cluster"
  cluster_version = "1.31" # 🔥 升級到 1.31

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = true

  # 🔥 解決死結的關鍵：使用 API 授權模式
  authentication_mode = "API_AND_CONFIG_MAP"
  
  # 自動把「執行 Terraform 的人(你)」設為最高管理員
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
  engine_version       = "16" # 搭配 K8s 升級，DB 也用新的
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
# 4. 設定 Provider 連線 (動態取得 EKS 資訊)
# ==========================================
# 用來讓 Terraform 可以操作 K8s 內部資源
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)

  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

# 用來讓 Terraform 安裝 Helm Chart
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
# 5. 自動寫入 K8s 設定 (ConfigMap & Secret)
# ==========================================
resource "kubernetes_config_map" "app_config" {
  metadata {
    name = "app-config"
  }
  data = {
    POSTGRES_HOST    = module.db.db_instance_address
    POSTGRES_USER    = "db_admin"
    GOOGLE_CLIENT_ID = "189871282006-gml6na5q64t9hb35echhcpiu7k3qco4d.apps.googleusercontent.com"
    APP_ENV          = "production"
  }
  depends_on = [module.eks]
}

resource "kubernetes_secret" "app_secret" {
  metadata {
    name = "app-secret"
  }
  data = {
    POSTGRES_PASSWORD = var.db_password
    JWT_SECRET        = var.jwt_secret
  }
  type = "Opaque"
  depends_on = [module.eks]
}

# ==========================================
# 6. 自動安裝 Nginx Ingress (Helm)
# ==========================================
resource "helm_release" "nginx_ingress" {
  name       = "ingress-nginx"
  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  namespace  = "ingress-nginx"
  create_namespace = true

  set {
    name  = "controller.service.type"
    value = "LoadBalancer"
  }
  
  # 確保 EKS 節點都準備好再安裝，避免報錯
  depends_on = [module.eks]
}
# ==========================================
# 8. 安裝 Reloader (自動重啟 Pod 工具)
# ==========================================
resource "helm_release" "reloader" {
  name       = "reloader"
  repository = "https://stakater.github.io/stakater-charts"
  chart      = "reloader"
  namespace  = "kube-system" # 把它裝在系統層級比較乾淨
  create_namespace = true

  set {
    name  = "reloader.watchGlobally"
    value = "false" # 我們只讓它監控有標記的 Deployment，比較省資源
  }

  depends_on = [module.eks]
}

# ==========================================
# Outputs
# ==========================================
output "configure_kubectl" {
  description = "Run this command to configure kubectl"
  value       = "aws eks --region us-east-1 update-kubeconfig --name ride-share-cluster"
}

output "rds_endpoint" {
  value = module.db.db_instance_address
}