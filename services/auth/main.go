package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
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

// // 定義前端傳過來的資料結構, 這是從google那邊得到的原始的認證字串沒有解密過
//
//	type LoginRequest struct {
//		IDToken string `json:"idToken"`
//	}
type LoginRequest struct {
	AccessToken string `json:"accessToken"`
}

// 2. Google UserInfo API 回傳的結構
type GoogleUserInfo struct {
	Sub           string `json:"sub"` // Google ID
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Picture       string `json:"picture"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
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

	googleAPIUrl := "https://www.googleapis.com/oauth2/v3/userinfo"

	// 建立一個請求
	request, _ := http.NewRequest("GET", googleAPIUrl, nil)
	// 把前端給的 Access Token 放在 Header 裡
	request.Header.Set("Authorization", "Bearer "+req.AccessToken)

	// 發送請求
	client := &http.Client{}
	googleResp, err := client.Do(request)
	if err != nil {
		log.Printf("Failed to call Google API: %v", err)
		http.Error(w, "Failed to verify token", http.StatusInternalServerError)
		return
	}
	defer googleResp.Body.Close()

	// 檢查 Google 回應狀態
	if googleResp.StatusCode != http.StatusOK {
		log.Printf("Google API returned status: %d", googleResp.StatusCode)
		http.Error(w, "Invalid Google Token", http.StatusUnauthorized)
		return
	}

	// 解析 Google 回傳的 User Info
	var userInfo GoogleUserInfo
	body, _ := io.ReadAll(googleResp.Body)
	if err := json.Unmarshal(body, &userInfo); err != nil {
		log.Printf("Failed to parse Google response: %v", err)
		http.Error(w, "Internal Error", http.StatusInternalServerError)
		return
	}

	// 4. 驗證成功！發放我們自己的 JWT
	expirationTime := time.Now().Add(7 * 24 * time.Hour)
	claims := &Claims{
		UserID: userInfo.Sub,
		Email:  userInfo.Email,
		Name:   userInfo.Name,
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

	log.Printf("User logged in: %s (%s)", userInfo.Email, userInfo.Sub)

	resp := LoginResponse{
		Message: "Login Successful",
		Token:   tokenString,
		UserID:  userInfo.Sub,
		Email:   userInfo.Email,
		Name:    userInfo.Name,
		Picture: userInfo.Picture, // 這裡會回傳 Google 高清圖
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/auth/login", loginHandler)

	fmt.Println("Auth Service running on :8081")
	http.ListenAndServe(":8081", nil)
}
