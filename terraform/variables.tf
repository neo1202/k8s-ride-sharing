# 用來「宣告」有哪些變數，但「不賦予」值
variable "db_password" {
  description = "RDS root password"
  type        = string
  sensitive   = true # 標記為敏感，Terraform Log 不會印出來
}

variable "jwt_secret" {
  description = "JWT Secret Key"
  type        = string
  sensitive   = true
}