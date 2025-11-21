# Tiltfile

load('ext://restart_process', 'docker_build_with_restart')

# ==========================================
# 1. 載入所有的 K8s YAML
# ==========================================
# 把所有需要的 yaml 都在這裡一次載入，這是最不容易出錯的寫法
k8s_yaml([
    # 基礎設施
    'deploy/k8s/nginx-ingress-install.yaml', # <--- 改成讀取本地檔案！
    'deploy/k8s/configmap.yaml',
    'deploy/k8s/postgres.yaml',
    'deploy/k8s/redis.yaml',
    'deploy/k8s/ingress.yaml',
    
    # 微服務
    'deploy/k8s/auth.yaml',
    'deploy/k8s/chat.yaml',
    'deploy/k8s/frontend.yaml', # 確保這裡有載入
])

# ==========================================
# 2. 設定基礎設施資源 (Port Forwarding & Labels)
# ==========================================

# API Gateway (Nginx)
k8s_resource('ingress-nginx-controller', 
    port_forwards='8000:80',
    new_name='api-gateway', 
    labels=['infra'],
)

# 資料庫
k8s_resource('postgres', labels=['db'])
k8s_resource('redis', labels=['db'])

# ==========================================
# 3. 設定微服務 (Build & Live Update)
# ==========================================

# Auth Service
docker_build_with_restart(
    'auth-image', 'services/auth',
    dockerfile='services/auth/Dockerfile',
    entrypoint=['go', 'run', 'main.go'],
    live_update=[sync('services/auth', '/app')]
)
k8s_resource('auth-service', labels=['backend'])

# Chat Service
docker_build_with_restart(
    'chat-image', 'services/chat',
    dockerfile='services/chat/Dockerfile',
    entrypoint=['go', 'run', 'main.go'],
    live_update=[sync('services/chat', '/app')]
)
k8s_resource('chat-service', labels=['backend'])

# Frontend
docker_build('frontend-image', 'frontend',
    dockerfile='frontend/Dockerfile',
    live_update=[
        sync('frontend/src', '/app/src'),
        sync('frontend/public', '/app/public'),
    ]
)
k8s_resource('frontend', port_forwards='5173:5173', labels=['frontend'])