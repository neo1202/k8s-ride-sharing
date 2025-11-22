package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"

	"github.com/neo1202/k8s-ride-sharing/services/chat/db"
	"github.com/neo1202/k8s-ride-sharing/services/chat/types"
)

// --- 全域變數 ---
var rdb *redis.Client
var ctx = context.Background()

// 讀取 JWT Secret (從 Secret.yaml 注入的環境變數)
var jwtKey = []byte(os.Getenv("JWT_SECRET"))

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Key: WebSocket 連線, Value: 房間 ID
var clients = make(map[*websocket.Conn]string)

// JWT Claims 結構 (用於 Middleware 解析)
type Claims struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}
type JoinRideRequest struct {
	RideID string `json:"rideId"`
}

// --- 初始化 Redis ---
func initRedis() {
	rdb = redis.NewClient(&redis.Options{Addr: "redis:6379"})
}

// --- Middleware: JWT 驗證 ---
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			http.Error(w, "Invalid token format", http.StatusUnauthorized)
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// 可以在這裡把 claims 塞進 r.Context() 供後續使用 (例如取得 DriverID)
		next(w, r)
	}
}

// services/chat/main.go

func createRideHandler(w http.ResponseWriter, r *http.Request) {
	var ride types.Ride

	// 1. 嘗試解析 JSON (如果這裡錯，會回 400)
	if err := json.NewDecoder(r.Body).Decode(&ride); err != nil {
		log.Printf("JSON Decode Error: %v", err) // 加 Log
		http.Error(w, "Invalid body: "+err.Error(), http.StatusBadRequest)
		return
	}

	// 2. [關鍵] 從 JWT Token 解析出 DriverID
	// 因為經過 authMiddleware，我們可以確保 Header 存在且 Token 有效
	authHeader := r.Header.Get("Authorization")
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")

	claims := &Claims{}
	// 這裡不需要再驗證一次簽名(Middleware做過了)，我們直接解析內容
	_, _, err := new(jwt.Parser).ParseUnverified(tokenString, claims)
	if err != nil {
		log.Printf("Token Parse Error: %v", err)
		http.Error(w, "Token Error", http.StatusInternalServerError)
		return
	}

	// 3. 強制覆蓋 DriverID (不信任前端傳來的)
	ride.DriverID = claims.UserID
	ride.DriverName = claims.Name

	// 加個 Log 看看資料對不對
	log.Printf("Creating Ride: ID=%s, Driver=%s, Time=%v", ride.ID, ride.DriverName, ride.DepartureTime)

	// 4. 寫入 DB
	if err := db.CreateRide(ride); err != nil {
		// 這是你遇到 500 的真正原因，把錯誤印出來！
		log.Printf("DB CreateRide Error: %v", err)
		http.Error(w, "Failed to create ride: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(ride)
}

func getRidesHandler(w http.ResponseWriter, r *http.Request) {
	rides, err := db.GetRides()
	if err != nil {
		http.Error(w, "Failed to query rides", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rides)
}
func joinRideHandler(w http.ResponseWriter, r *http.Request) {
	// 1. 解析 Request Body
	var req JoinRideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// 2. 從 JWT 取得 UserID (Passenger)
	authHeader := r.Header.Get("Authorization")
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")
	claims := &Claims{}
	// 這裡可以直接 parse，因為 middleware 已經驗證過簽名了
	jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtKey, nil
	})

	// 3. 呼叫 DB
	if err := db.JoinRide(req.RideID, claims.UserID); err != nil {
		if err.Error() == "ride is full" {
			http.Error(w, "Ride is full", http.StatusConflict)
		} else {
			http.Error(w, "Failed to join ride: "+err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Joined successfully"}`))
}

// --- WebSocket ---

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer ws.Close()

	// 這裡改用 rideId 因為我們現在是 "Ride"
	rideID := r.URL.Query().Get("roomId")
	if rideID == "" {
		rideID = "general"
	}

	clients[ws] = rideID

	// 1. 讀取歷史紀錄 (從 Redis Stream)
	// 這裡簡化：只負責讀取，不負責像上次那樣倒序處理 (你可以之後加上)
	streamKey := fmt.Sprintf("stream:%s", rideID)
	var historyMessages []types.ChatMessage
	streams, err := rdb.XRevRangeN(ctx, streamKey, "+", "-", 50).Result()
	if err == nil {
		for i := len(streams) - 1; i >= 0; i-- {
			msgData := streams[i].Values["data"]
			if jsonStr, ok := msgData.(string); ok {
				var msg types.ChatMessage
				json.Unmarshal([]byte(jsonStr), &msg)
				historyMessages = append(historyMessages, msg)
			}
		}
		if len(historyMessages) > 0 {
			ws.WriteJSON(historyMessages)
		}
	}

	// 2. 處理新訊息
	for {
		var msg types.ChatMessage
		err := ws.ReadJSON(&msg)
		if err != nil {
			delete(clients, ws)
			break
		}

		msg.RideID = rideID // 確保 ID 正確

		// A. 補全發送者資訊 (去 DB 查這個 ID 的名字和頭貼)
		// 假設前端有傳 SenderID
		if msg.SenderID != "" {
			userInfo, err := db.GetUserInfo(msg.SenderID)
			if err == nil {
				msg.SenderName = userInfo.Name
				msg.SenderPicture = userInfo.Picture
			}
		}

		jsonMsg, _ := json.Marshal(msg)

		// B. 寫入 Redis Stream (熱數據)
		rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: streamKey,
			Values: map[string]interface{}{"data": jsonMsg},
		})

		// C. 寫入 Postgres (冷數據 - 使用 db package)
		go func(m types.ChatMessage) {
			if err := db.SaveMessage(m.RideID, m.SenderID, m.Content); err != nil {
				log.Printf("Error saving to DB: %v", err)
			}
		}(msg)

		// D. Pub/Sub (即時廣播)
		rdb.Publish(ctx, "chat_channel", jsonMsg)
	}
}

func handleMessages() {
	pubsub := rdb.Subscribe(ctx, "chat_channel")
	defer pubsub.Close()
	ch := pubsub.Channel()

	for msg := range ch {
		var chatMsg types.ChatMessage
		if err := json.Unmarshal([]byte(msg.Payload), &chatMsg); err != nil {
			continue
		}
		for client, rideID := range clients {
			if rideID == chatMsg.RideID {
				client.WriteJSON(chatMsg)
			}
		}
	}
}
func getMyRidesHandler(w http.ResponseWriter, r *http.Request) {
	// 從 Header 解析 UserID (這段邏輯跟 createRide 一樣，建議抽成 helper)
	authHeader := r.Header.Get("Authorization")
	tokenString := strings.TrimPrefix(authHeader, "Bearer ")
	claims := &Claims{}
	jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) { return jwtKey, nil })
	
	rides, err := db.GetMyRides(claims.UserID)
	if err != nil {
		http.Error(w, "Query failed", http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(rides)
}
func main() {
	initRedis()
	db.Init()

	go handleMessages()

	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/api/rides/mine", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" {
			getMyRidesHandler(w, r)
		}
	}))
	http.HandleFunc("/api/rides/join", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
        if r.Method == "POST" {
            joinRideHandler(w, r)
        } else {
            http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
        }
    }))
	http.HandleFunc("/api/rides", func(w http.ResponseWriter, r *http.Request) {
		// 1. 處理 CORS Preflight (必要！)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// 2.如果是 GET (讀取列表)，直接執行，不需要驗證 Token (公開)
		if r.Method == "GET" {
			getRidesHandler(w, r)
			return
		}

		// 3. 如果是 POST (建立旅程)，才需要驗證 Token
		if r.Method == "POST" {
			authMiddleware(createRideHandler).ServeHTTP(w, r)
			return
		}

		// 其他方法不允許
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
	})

	fmt.Println("Chat Service running on :8080")
	http.ListenAndServe(":8080", nil)
}
