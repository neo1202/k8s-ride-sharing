FROM golang:latest

WORKDIR /app

# 這裡我們依賴 Tilt 的 live_update 即可，保持 Dockerfile 簡單
COPY go.mod ./
# COPY go.sum ./ # 如果還沒有 go.sum 先註解掉這行
RUN go mod download

COPY . .

# 這裡不執行 go build，因為 Tilt 會在容器啟動後幫我們做
# 這裡只是為了讓容器有個東西能跑起來不至於立刻 exit
CMD ["go", "run", "main.go"]