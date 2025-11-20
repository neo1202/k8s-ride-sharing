package main

import (
	"context"
	"fmt"
	"log"
	"net/http"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client
var ctx = context.Background()

// enableCORS 是一個 Middleware，用來允許前端跨域存取
func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 允許任何來源 (開發階段方便，正式上線要改)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		// 處理 Preflight請求 (瀏覽器會先問一次 OPTIONS)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

func helloHandler(w http.ResponseWriter, r *http.Request) {
	// 測試：每次有人存取首頁，就去 Redis 增加計數器
	count, err := rdb.Incr(ctx, "visit_count").Result()
	if err != nil {
		http.Error(w, "Redis error: "+err.Error(), http.StatusInternalServerError)
		return
	}

	msg := fmt.Sprintf(`{"message": "Hello! You are visitor number %d"}`, count)
	fmt.Fprint(w, msg)
}

func initRedis() {
	// 連線到 K8s 裡的 Redis Service
	// Addr: "redis:6379" -> 這裡的 "redis" 就是 k8s service name
	rdb = redis.NewClient(&redis.Options{
		Addr:     "redis:6379",
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	// 測試連線
	pong, err := rdb.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Could not connect to Redis: %v", err)
	}
	fmt.Println("Connected to Redis:", pong)
}

func main() {
	initRedis()

	http.HandleFunc("/api/hello", enableCORS(helloHandler))

	fmt.Println("Chat Service starting on :8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}
