# Tiltfile
load('ext://restart_process', 'docker_build_with_restart')
# 1. 載入 K8s 設定
k8s_yaml([
    'deploy/k8s/auth.yaml',
    'deploy/k8s/chat.yaml',
    'deploy/k8s/frontend.yaml',
    'deploy/k8s/redis.yaml',
])

# 2. 使用 docker_build_with_restart
docker_build_with_restart(
    'chat-image', 'services/chat',
    dockerfile='services/chat/Dockerfile',
    
    # 關鍵差異 A: 必須指定 entrypoint
    # 這是告訴 Tilt：當服務重啟時，到底要執行哪個指令？
    entrypoint=['go', 'run', 'main.go'],
    
    # 關鍵差異 B: live_update 裡面變乾淨了
    # 不需要再寫 restart_container() 或 restart_process()
    # 因為 docker_build_with_restart 自動會在 sync 結束後幫你重啟
    live_update=[
        sync('services/chat', '/app'),
    ]
)

# 3. 定義 Auth Service
docker_build_with_restart(
    'auth-image', 'services/auth',
    dockerfile='services/auth/Dockerfile',
    entrypoint=['go', 'run', 'main.go'],
    live_update=[
        sync('services/auth', '/app'),
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
    ],
    # 重要：因為 live_update 沒寫到 package.json
    # 所以一旦你改了 package.json，Tilt 就會自動退回到 "重新 build image"
    # 這樣就不用自己在容器裡跑 npm install 了
)

# 5. 設定 Port Forward (方便你在瀏覽器看)
k8s_resource('frontend', port_forwards='5173:5173')
k8s_resource('chat-service', port_forwards='8080:8080')
k8s_resource('auth-service', port_forwards='8081:8081')