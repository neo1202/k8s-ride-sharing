package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
)

var DB *sql.DB

// User 結構 (為了傳遞參數方便)
type User struct {
	ID      string
	Email   string
	Name    string
	Picture string
	Role    string
}

func Init() {
	// 1. 讀取 Host
	pgHost := os.Getenv("POSTGRES_HOST")
	if pgHost == "" {
		pgHost = "postgres" // 本地預設值
	}

	// 2. 讀取 User
	pgUser := os.Getenv("POSTGRES_USER")
	if pgUser == "" {
		pgUser = "user" // 本地預設值
	}

	// 3. 讀取 Password
	pgPwd := os.Getenv("POSTGRES_PASSWORD")
	if pgPwd == "" {
		pgPwd = "password"
	}

	connStr := fmt.Sprintf("host=%s port=5432 user=%s password=%s dbname=chat_db sslmode=disable", pgHost, pgUser, pgPwd)
	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to DB:", err)
	}

	// 建立 Users 表
	_, err = DB.Exec(`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL,
		name TEXT,
		picture TEXT,
		role TEXT DEFAULT 'passenger'
	)`)
	if err != nil {
		log.Fatal(err)
	}
	log.Println("Auth Service connected to DB.")
}

// UpsertUser: 更新或新增使用者，並回傳最新的 Role
func UpsertUser(user User) (string, error) {
	var role string
	err := DB.QueryRow(`
		INSERT INTO users (id, email, name, picture)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (id) DO UPDATE 
		SET name = EXCLUDED.name, picture = EXCLUDED.picture, email = EXCLUDED.email
		RETURNING role
	`, user.ID, user.Email, user.Name, user.Picture).Scan(&role)

	return role, err
}