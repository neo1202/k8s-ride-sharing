package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	// "os"

	"github.com/gorilla/websocket"
	_ "github.com/lib/pq" // Postgres Driver
	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client
var db *sql.DB
var ctx = context.Background()

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Key: WebSocket 連線, Value: 房間 ID
var clients = make(map[*websocket.Conn]string)

type ChatMessage struct {
	Username  string `json:"username"`
	Content   string `json:"content"`
	RoomID    string `json:"roomId"`
	Timestamp string `json:"timestamp"`
}
type ChatRoom struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
func initDB() {
	// 連線字串：對應 deploy/k8s/postgres.yaml 的設定
	// host=postgres (Service Name), user=user, password=password, dbname=chat_db
	connStr := "host=postgres port=5432 user=user password=password dbname=chat_db sslmode=disable"
	var err error
	db, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to DB:", err)
	}

	// 測試連線 (重試機制，因為 Postgres 啟動比較慢)
	for i := 0; i < 10; i++ {
		if err = db.Ping(); err == nil {
			break
		}
		log.Println("Waiting for Postgres...")
		// time.Sleep(2 * time.Second) // 簡化省略
	}

	// 自動建立 Rooms 表格
	_, err = db.Exec(`CREATE TABLE IF NOT EXISTS rooms (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL
	)`)
	if err != nil {
		log.Fatal("Failed to create table:", err)
	}
	log.Println("Connected to Postgres and table ensured.")
}
func initRedis() {
	// 請確認你的 redis 地址是否正確 (Tilt 內通常是 redis:6379)
	rdb = redis.NewClient(&redis.Options{
		Addr: "redis:6379",
	})
}
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}
func createRoomHandler(w http.ResponseWriter, r *http.Request) {
	var room ChatRoom
	if err := json.NewDecoder(r.Body).Decode(&room); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// 寫入 Postgres
	_, err := db.Exec("INSERT INTO rooms (id, name) VALUES ($1, $2)", room.ID, room.Name)
	if err != nil {
		http.Error(w, "Failed to create room: "+err.Error(), http.StatusInternalServerError)
		return
	}
	
	// 廣播給所有前端說有新房間了 (選用，這裡先回傳成功就好)
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
		if err := rows.Scan(&room.ID, &room.Name); err != nil {
			continue
		}
		rooms = append(rooms, room)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rooms)
}
func handleConnections(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading: %v", err)
		return
	}
	defer ws.Close()

	roomID := r.URL.Query().Get("roomId")
	if roomID == "" {
		roomID = "general"
	}

	clients[ws] = roomID
	log.Printf("Client connected to room: %s", roomID)

	// ==========================================
	// 1. 使用 Redis Stream 讀取歷史訊息
	streamKey := fmt.Sprintf("stream:%s", roomID)

	// 建立一個 Slice 來暫存所有歷史訊息
	var historyMessages []ChatMessage

	streams, err := rdb.XRevRangeN(ctx, streamKey, "+", "-", 50).Result()
	if err == nil {
		// streams 的順序是 [最新, 次新 ... 最舊]
		// 我們要倒著塞進去，變成 [最舊 ... 次新, 最新]
		for i := len(streams) - 1; i >= 0; i-- {
			msgData := streams[i].Values["data"]
			if jsonStr, ok := msgData.(string); ok {
				var msg ChatMessage
				json.Unmarshal([]byte(jsonStr), &msg)
				historyMessages = append(historyMessages, msg)
			}
		}
		
		// --- 關鍵修改 ---
		// 如果有歷史訊息，就「一次性」發送整個陣列給前端
		if len(historyMessages) > 0 {
			ws.WriteJSON(historyMessages)
		}
	} else {
		log.Printf("Error fetching history: %v", err)
	}

	// ==========================================
	// 2. 處理即時訊息
	// ==========================================
	for {
		var msg ChatMessage
		err := ws.ReadJSON(&msg)
		if err != nil {
			log.Printf("Client disconnected: %v", err)
			delete(clients, ws)
			break
		}
		// 強制確保 RoomID 正確
		msg.RoomID = roomID
		jsonMsg, _ := json.Marshal(msg)

		// A. 寫入 Redis Stream (作為歷史紀錄)
		// 這樣可以確保訊息有順序且持久化
		rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: streamKey,
			Values: map[string]interface{}{
				"data": jsonMsg, // 把整包 JSON 存成一個欄位叫 "data"
			},
		})
		// 寫入 Postgres (冷數據 - 永久保存) <--- 這裡新增！
		// 使用 Pub/Sub 做即時廣播 Stream 雖然也能讀，但 Pub/Sub 對於「即時推播」更輕量且延遲更低
		rdb.Publish(ctx, "chat_channel", jsonMsg)
	}
}

// 處理廣播 (這部分跟之前幾乎一樣)
func handleMessages() {
	pubsub := rdb.Subscribe(ctx, "chat_channel")
	defer pubsub.Close()

	ch := pubsub.Channel()

	for msg := range ch {
		var chatMsg ChatMessage
		if err := json.Unmarshal([]byte(msg.Payload), &chatMsg); err != nil {
			continue
		}

		for client, clientRoomID := range clients {
			if clientRoomID == chatMsg.RoomID {
				client.WriteJSON(chatMsg)
			}
		}
	}
}

func main() {
	initRedis()
	initDB()
	go handleMessages()

	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/api/rooms", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "POST":
			createRoomHandler(w, r)
		case "GET":
			getRoomsHandler(w, r)
		default:
        http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
    	}
	})

	fmt.Println("Chat Service running on :8080")
	http.ListenAndServe(":8080", nil)
}