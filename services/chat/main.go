package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	// "time" // 前端產生時間了，後端不需要 time 套件了

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client
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

func initRedis() {
	// 請確認你的 redis 地址是否正確 (Tilt 內通常是 redis:6379)
	rdb = redis.NewClient(&redis.Options{
		Addr: "redis:6379",
	})
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
		// Timestamp 已經由前端產生，後端直接信任並轉發

		jsonMsg, _ := json.Marshal(msg)

		// A. 寫入 Redis Stream (作為歷史紀錄)
		// 這樣可以確保訊息有順序且持久化
		rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: streamKey,
			// MaxLenApprox: 1000, // (選用) 自動限制長度，只留最近 1000 筆，避免無限膨脹
			Values: map[string]interface{}{
				"data": jsonMsg, // 把整包 JSON 存成一個欄位叫 "data"
			},
		})

		// B. 使用 Pub/Sub 做即時廣播
		// Stream 雖然也能讀，但 Pub/Sub 對於「即時推播」更輕量且延遲更低
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
	go handleMessages()

	http.HandleFunc("/ws", handleConnections)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "Chat Service Running (Redis Stream)")
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	fmt.Printf("Chat Service starting on :%s...\n", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatal(err)
	}
}