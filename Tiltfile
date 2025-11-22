# Tiltfile

load('ext://restart_process', 'docker_build_with_restart')

# ==========================================
# 1. 載入基礎設施 (Nginx, DB)
# ==========================================
k8s_yaml([
    'deploy/k8s/secret.yaml',
    'deploy/k8s/nginx-ingress-install.yaml', # 確保你已經刪除了 Webhook/Job
    'deploy/k8s/ingress.yaml',
    'deploy/k8s/configmap.yaml',
    'deploy/k8s/postgres.yaml',
    'deploy/k8s/redis.yaml',
])

# 設定 API Gateway 資源
k8s_resource('ingress-nginx-controller', 
    port_forwards='8000:80',
    new_name='api-gateway', 
    labels=['infra'],
    # 這裡不用設 objects，讓 Tilt 自動抓
)

k8s_resource('postgres', labels=['db'])
k8s_resource('redis', labels=['db'])

# ==========================================
# 2. 載入微服務 (Services)
# ==========================================
k8s_yaml([
    'deploy/k8s/auth.yaml',
    'deploy/k8s/chat.yaml',
    'deploy/k8s/frontend.yaml',
])

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
