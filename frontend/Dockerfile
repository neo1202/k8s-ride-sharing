# 使用 Node.js 環境
FROM node:20-alpine

# 設定工作目錄
WORKDIR /app

# 先複製 package.json 安裝依賴 (利用 Docker Cache 加速)
COPY package*.json ./
RUN npm install

# 複製所有程式碼
COPY . .

# 開放 Vite 的預設 Port
EXPOSE 5173

# 啟動開發伺服器
# 注意：一定要加 --host 0.0.0.0，不然你在瀏覽器會連不上
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]