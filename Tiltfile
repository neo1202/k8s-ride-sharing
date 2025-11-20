# Tiltfile
load('ext://restart_process', 'docker_build_with_restart')
# 1. 載入 K8s 設定
k8s_yaml([
    'deploy/k8s/auth.yaml',
    'deploy/k8s/chat.yaml',
    'deploy/k8s/frontend.yaml',
    'deploy/k8s/redis.yaml',
])

# 2. 定義 Chat Service
docker_build('chat-image', 'services/chat', # Image 名稱, Context 路徑
    dockerfile='services/chat/Dockerfile',
    live_update=[
        # 監聽 services/chat 資料夾，同步到容器內的 /app
        sync('services/chat', '/app'),
        # 當 .go 檔案變動，執行 go run (簡單粗暴) 或 go build
        # 這裡示範最簡單的：直接重啟容器讓 CMD ["go", "run", ...] 重新跑
        restart_process() 
    ]
)

# 3. 定義 Auth Service
docker_build('auth-image', 'services/auth',
    dockerfile='services/auth/Dockerfile',
    live_update=[
        sync('services/auth', '/app'),
        restart_process() 
    ]
)

# 4. 定義 Frontend (React/Vite)
docker_build('frontend-image', 'frontend',
    dockerfile='frontend/Dockerfile',
    # 這裡設定：哪些檔案變動時，要做 Live Update
    live_update=[
        # 只有 src 和 public 資料夾變動時，同步進去容器
        # Vite 會自己偵測到檔案變了，然後更新瀏覽器
        sync('frontend/src', '/app/src'),
        sync('frontend/public', '/app/public'),
    ],ㄜ
    # 重要：因為 live_update 沒寫到 package.json
    # 所以一旦你改了 package.json，Tilt 就會自動退回到 "重新 build image"
    # 這樣就不用自己在容器裡跑 npm install 了
)

# 5. 設定 Port Forward (方便你在瀏覽器看)
k8s_resource('frontend', port_forwards='5173:5173')
k8s_resource('chat-service', port_forwards='8080:8080')
k8s_resource('auth-service', port_forwards='8081:8081')