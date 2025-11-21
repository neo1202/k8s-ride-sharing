package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	// "os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5" // 引入 JWT 套件
	"github.com/gorilla/websocket"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

// --- 全域變數 ---
var rdb *redis.Client
var db *sql.DB
var ctx = context.Background()

// ⚠️ 重要：這個密鑰必須跟 Auth Service 的一模一樣！
// 在正式環境中，這應該透過 ConfigMap/Secret 注入環境變數
var jwtKey = []byte("my_secret_key_12345")

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}
var clients = make(map[*websocket.Conn]string)

// --- 資料結構 ---
type ChatMessage struct {
	Username  string `json:"username"`
	Content   string `json:"content"`
	RoomID    string `json:"roomId"`
	Timestamp string `json:"timestamp"`
	// 資料庫存取時可能需要 UserID，這裡先簡化直接存 Username
}

type ChatRoom struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// JWT Claims 結構 (要跟 Auth Service 一樣)
type Claims struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	jwt.RegisteredClaims
}

// --- 資料庫初始化 ---
func initDB() {
	connStr := "host=postgres port=5432 user=user password=password dbname=chat_db sslmode=disable"
	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to DB:", err)
	}

	// 1. 建立房間表
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS rooms (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL
	)`)
	if err != nil { log.Fatal(err) }

	// 2. 建立訊息表 (新增！)
	// 我們存: id(自動跳號), room_id, sender_name, content, created_at
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS messages (
		id SERIAL PRIMARY KEY,
		room_id TEXT NOT NULL,
		sender_name TEXT NOT NULL,
		content TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil { log.Fatal(err) }

	log.Println("Connected to Postgres and tables ensured.")
}

func initRedis() {
	rdb = redis.NewClient(&redis.Options{Addr: "redis:6379"})
}

// --- Middleware: JWT 驗證 ---
// 這就是保護 API 的守門員
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 1. 從 Header 取得 Token
		// 格式通常是: "Authorization: Bearer <token>"
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing Authorization header", http.StatusUnauthorized)
			return
		}

		// 去掉 "Bearer " 前綴
		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader { // 沒找到 Bearer
			http.Error(w, "Invalid token format", http.StatusUnauthorized)
			return
		}

		// 2. 解析並驗證 Token
		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
			return
		}

		// 3. 驗證成功，放行！
		// (進階做法是可以把 UserID 塞進 r.Context() 傳給下一個 handler，這裡先省略)
		next(w, r)
	}
}

// --- API Handlers ---

func createRoomHandler(w http.ResponseWriter, r *http.Request) {
	var room ChatRoom
	if err := json.NewDecoder(r.Body).Decode(&room); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	_, err := db.Exec("INSERT INTO rooms (id, name) VALUES ($1, $2)", room.ID, room.Name)
	if err != nil {
		http.Error(w, "Failed to create room: "+err.Error(), http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(room)
}

func getRoomsHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query("SELECT id, name FROM rooms")
	if err != nil {
		http.Error(w, "Failed to query rooms", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var rooms []ChatRoom
	for rows.Next() {
		var room ChatRoom
		if err := rows.Scan(&room.ID, &room.Name); err != nil { continue }
		rooms = append(rooms, room)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rooms)
}

// --- WebSocket ---

func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }
	defer ws.Close()

	roomID := r.URL.Query().Get("roomId")
	if roomID == "" { roomID = "general" }

	clients[ws] = roomID
	
	// 讀取歷史紀錄 (Redis Stream - 熱數據)
	streamKey := fmt.Sprintf("stream:%s", roomID)
	var historyMessages []ChatMessage
	streams, err := rdb.XRevRangeN(ctx, streamKey, "+", "-", 50).Result()
	if err == nil {
		for i := len(streams) - 1; i >= 0; i-- {
			msgData := streams[i].Values["data"]
			if jsonStr, ok := msgData.(string); ok {
				var msg ChatMessage
				json.Unmarshal([]byte(jsonStr), &msg)
				historyMessages = append(historyMessages, msg)
			}
		}
		if len(historyMessages) > 0 {
			ws.WriteJSON(historyMessages)
		}
	}

	for {
		var msg ChatMessage
		err := ws.ReadJSON(&msg)
		if err != nil {
			delete(clients, ws)
			break
		}
		msg.RoomID = roomID
		jsonMsg, _ := json.Marshal(msg)

		// A. 寫入 Redis Stream (熱數據)
		rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: streamKey,
			Values: map[string]interface{}{"data": jsonMsg},
		})

		// B. 寫入 Postgres (冷數據 - 永久保存) [NEW!]
		// 我們開一個 goroutine 去寫 DB，避免卡住 WebSocket 的流暢度
		go func(m ChatMessage) {
			_, err := db.Exec(
				"INSERT INTO messages (room_id, sender_name, content, created_at) VALUES ($1, $2, $3, $4)",
				m.RoomID, m.Username, m.Content, time.Now(),
			)
			if err != nil {
				log.Printf("Error saving to DB: %v", err)
			}
		}(msg)

		// C. Pub/Sub (即時廣播)
		rdb.Publish(ctx, "chat_channel", jsonMsg)
	}
}

func handleMessages() {
	pubsub := rdb.Subscribe(ctx, "chat_channel")
	defer pubsub.Close()
	ch := pubsub.Channel()

	for msg := range ch {
		var chatMsg ChatMessage
		if err := json.Unmarshal([]byte(msg.Payload), &chatMsg); err != nil { continue }
		for client, clientRoomID := range clients {
			if clientRoomID == chatMsg.RoomID {
				client.WriteJSON(chatMsg)
			}
		}
	}
}

func main() {
	initRedis()
	initDB() // 建立表格
	go handleMessages()

	http.HandleFunc("/ws", handleConnections)

	// 使用 authMiddleware 保護 API
	// 只有帶正確 Token 的人才能呼叫這個 Handler
	http.HandleFunc("/api/rooms", authMiddleware(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "POST":
			createRoomHandler(w, r)
		case "GET":
			getRoomsHandler(w, r)
		default:
        http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
    	}
	}))

	fmt.Println("Chat Service running on :8080")
	http.ListenAndServe(":8080", nil)
}