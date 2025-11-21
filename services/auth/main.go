package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"google.golang.org/api/idtoken"
)

// 定義 JWT 的密鑰 (正式環境應該從環境變數讀取)
var jwtKey = []byte("my_secret_key_12345")
// 定義 JWT 內容結構
type Claims struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	jwt.RegisteredClaims
}

// 定義前端傳過來的資料結構, 這是從google那邊得到的原始的認證字串沒有解密過
type LoginRequest struct {
	IDToken string `json:"idToken"`
}

type LoginResponse struct {
	Message string `json:"message"`
	UserID  string `json:"userId"`
	Email   string `json:"email"`
	Name    string `json:"name"`   
	Picture string `json:"picture"`
	Token   string `json:"token"` // 後端發的通行證
}



func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 允許前端 localhost:5173 呼叫
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID") // 這是你的 Google Client ID (跟前端那個一樣)
	if googleClientID == "" {
        log.Println("Error: GOOGLE_CLIENT_ID is not set")
        http.Error(w, "Server configuration error", http.StatusInternalServerError) // 之後可刪除
        return
    }
	if r.Method == http.MethodOptions { // 遇到有人要preflight, 先跟他說沒問題
        w.WriteHeader(http.StatusOK)
        return
    }
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// 1. 解析前端傳來的 JSON
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 2. 呼叫 Google 驗證這個 Token 是不是真的
	ctx := context.Background()
	payload, err := idtoken.Validate(ctx, req.IDToken, googleClientID)
	if err != nil {
		log.Printf("Token validation failed: %v", err)
		http.Error(w, "Invalid Google Token", http.StatusUnauthorized)
		return
	}
	claimsJSON, _ := json.MarshalIndent(payload.Claims, "", "  ")
	log.Printf(" Google Token Claims Decoded:\n%s\n", string(claimsJSON))
	// 3. 驗證成功！取得使用者資訊
	// payload.Claims 裡面有 email, name, picture 等等
	name, _ := payload.Claims["name"].(string)
	picture, _ := payload.Claims["picture"].(string)
	email, _ := payload.Claims["email"].(string)
	userID := payload.Subject
	expirationTime := time.Now().Add(7 * 24 * time.Hour) // 7天後過期
	claims := &Claims{
		UserID: userID,
		Email:  email,
		Name:   name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expirationTime),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	
	log.Printf("User logged in: %s (%s)", email, userID)

	// 4. 回傳結果給前端
	resp := LoginResponse{
		Message: "Login Successful via Auth Service!",
		Token:   tokenString,
		UserID:  userID,
		Email:   email,
		Name:    name,    
		Picture: picture, 
	}
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/auth/login", loginHandler)

	fmt.Println("Auth Service running on :8081")
	// 注意：Auth Service 我們在 k8s yaml 裡設定是 8081 port
	if err := http.ListenAndServe(":8081", nil); err != nil {
		log.Fatal(err)
	}
}