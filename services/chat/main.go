package main

import (
	"fmt"
	"log"
	"net/http"
)

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
	fmt.Fprintf(w, `{"message": "Hello from Chat Service inside K8s!"}`)
}


func main() {
	// 設定路由
	http.HandleFunc("/api/hello", enableCORS(helloHandler))

	fmt.Println("Chat Service starting on :8080...")
	// 啟動 Server
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal("ListenAndServe:", err)
	}
}