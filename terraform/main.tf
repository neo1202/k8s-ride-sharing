terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1" 
}

# 1. 建立 VPC (網路)
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"

  name = "ride-share-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

# 2. 建立 EKS Cluster
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  # [修改] 更新模組版本以支援新版 K8s
  version = "~> 19.21"

  cluster_name    = "ride-share-cluster"
  # [修改] 使用較新的 Kubernetes 版本
  cluster_version = "1.30"

  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = true

  eks_managed_node_groups = {
    one = {
      name = "node-group-1"
      # [修改] t3.medium 是最低限度，如果要更順暢可用 t3.large (但會貴一點)
      instance_types = ["t3.medium"]

      min_size     = 1
      max_size     = 2
      desired_size = 1
    }
  }
}

output "configure_kubectl" {
  description = "Run this command to configure kubectl"
  value       = "aws eks --region us-east-1 update-kubeconfig --name ride-share-cluster"
}