.PHONY: up down clean-db reset logs

# 啟動 Tilt
up:
	tilt up

# 關閉 Tilt (移除所有資源)
down:
	tilt down

# 🔥 清空資料庫 (核心指令)
# 1. 先刪除 Postgres Deployment (確保沒有人佔用硬碟)
# 2. 刪除 PVC (這就是刪除硬碟資料)
clean-db:
	@echo "🗑️  Stopping Postgres..."
	kubectl delete deployment postgres --ignore-not-found
	@echo "🔥 Deleting Database Volume (PVC)..."
	kubectl delete pvc postgres-pvc --ignore-not-found
	@echo "✅ Database has been wiped clean."

# 🚀 一鍵重置：關閉 -> 刪除資料 -> 啟動
reset: down clean-db up

# 額外好用指令：快速看 Postgres 的 Log (除錯用)
db-logs:
	kubectl logs -l app=postgres -f

# 額外好用指令：進入 DB 下 SQL (除錯用)
db-shell:
	kubectl exec -it $$(kubectl get pod -l app=postgres -o jsonpath="{.items[0].metadata.name}") -- psql -U db_admin -d chat_db
