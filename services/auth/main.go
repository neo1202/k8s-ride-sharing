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
	"github.com/neo1202/k8s-ride-sharing/services/auth/db"
)

// 全域變數
var jwtKey []byte // 改成動態讀取

// 定義 JWT 內容結構
type Claims struct {
	UserID string `json:"userId"`
	Email  string `json:"email"`
	Name   string `json:"name"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

type LoginRequest struct {
	AccessToken string `json:"accessToken"`
}

type GoogleUserInfo struct {
	Sub     string `json:"sub"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
	Email   string `json:"email"`
}

type LoginResponse struct {
	Message string `json:"message"`
	UserID  string `json:"userId"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
	Token   string `json:"token"`
	Role    string `json:"role"`
}

func loginHandler(w http.ResponseWriter, r *http.Request) {
	googleClientID := os.Getenv("GOOGLE_CLIENT_ID")
	if googleClientID == "" {
		log.Println("Warning: GOOGLE_CLIENT_ID is not set")
	}

	if r.Method == http.MethodOptions {
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

	// 2. 呼叫 Google API
	googleAPIUrl := "https://www.googleapis.com/oauth2/v3/userinfo"
	request, _ := http.NewRequest("GET", googleAPIUrl, nil)
	request.Header.Set("Authorization", "Bearer "+req.AccessToken)

	client := &http.Client{}
	googleResp, err := client.Do(request)
	if err != nil || googleResp.StatusCode != http.StatusOK {
		log.Printf("Failed to verify Google Token: %v", err)
		http.Error(w, "Failed to verify token", http.StatusUnauthorized)
		return
	}
	defer googleResp.Body.Close()

	var userInfo GoogleUserInfo
	body, _ := io.ReadAll(googleResp.Body)
	if err := json.Unmarshal(body, &userInfo); err != nil {
		log.Printf("Failed to parse Google response: %v", err)
		http.Error(w, "Internal Error", http.StatusInternalServerError)
		return
	}

	role, err := db.UpsertUser(db.User{
		ID:      userInfo.Sub,
		Email:   userInfo.Email,
		Name:    userInfo.Name,
		Picture: userInfo.Picture,
	})

	if err != nil {
		log.Printf("DB Sync Error: %v", err)
		http.Error(w, "Database Error", http.StatusInternalServerError)
		return
	}
	// ==========================================

	// 4. 發放 JWT
	expirationTime := time.Now().Add(7 * 24 * time.Hour)
	claims := &Claims{
		UserID: userInfo.Sub,
		Email:  userInfo.Email,
		Name:   userInfo.Name,
		Role:   role, // 使用從 DB 拿出來的 role
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

	log.Printf("User logged in & saved to DB: %s (%s) Role: %s", userInfo.Email, userInfo.Sub, role)

	resp := LoginResponse{
		Message: "Login Successful",
		Token:   tokenString,
		UserID:  userInfo.Sub,
		Email:   userInfo.Email,
		Name:    userInfo.Name,
		Picture: userInfo.Picture,
		Role:    role,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	// 讀取環境變數中的 JWT_SECRET
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		jwtKey = []byte("my_secret_key_12345") // 本地 fallback
	} else {
		jwtKey = []byte(secret)
	}

	db.Init()

	http.HandleFunc("/auth/login", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		if r.Method == "POST" {
			loginHandler(w, r)
		}
	})

	fmt.Println("Auth Service running on :8081")
	http.ListenAndServe(":8081", nil)
}
