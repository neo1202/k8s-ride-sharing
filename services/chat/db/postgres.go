package db

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
	"github.com/neo1202/k8s-ride-sharing/services/chat/types"
)

var DB *sql.DB

func Init() {
	// 讀取 K8s Secret 注入的密碼
	pgPwd := os.Getenv("POSTGRES_PASSWORD")
	if pgPwd == "" {
		pgPwd = "password"
	} // 本地開發預設值

	connStr := fmt.Sprintf("host=postgres port=5432 user=user password=%s dbname=chat_db sslmode=disable", pgPwd)
	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Failed to connect to DB:", err)
	}

	createTables()
}

func createTables() {
	// 1. Users 表 (雖然 Auth Service 也會寫，但這裡建表防呆)
	DB.Exec(`CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL,
		name TEXT,
		picture TEXT,
		role TEXT DEFAULT 'passenger'
	)`)

	// 2. Rides 表 (旅程)
	DB.Exec(`CREATE TABLE IF NOT EXISTS rides (
		id TEXT PRIMARY KEY,
		driver_id TEXT NOT NULL REFERENCES users(id),
		driver_name TEXT,
		origin TEXT NOT NULL,
		destination TEXT NOT NULL,
		departure_time TIMESTAMP NOT NULL,
		max_passengers INT NOT NULL,
		status TEXT DEFAULT 'open'
	)`)

	// 3. 乘客名單 (Many-to-Many)
	// 紀錄誰加入了哪個旅程
	DB.Exec(`CREATE TABLE IF NOT EXISTS ride_participants (
		ride_id TEXT NOT NULL REFERENCES rides(id),
		passenger_id TEXT NOT NULL REFERENCES users(id),
		joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (ride_id, passenger_id)
	)`)

	// 4. 訊息表
	DB.Exec(`CREATE TABLE IF NOT EXISTS messages (
		id SERIAL PRIMARY KEY,
		ride_id TEXT NOT NULL REFERENCES rides(id),
		sender_id TEXT NOT NULL REFERENCES users(id),
		content TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
	)`)

	log.Println("Database tables initialized.")
}

// --- 業務邏輯函式 ---

// 建立旅程
func CreateRide(ride types.Ride) error {
	_, err := DB.Exec(`
		INSERT INTO rides (id, driver_id, driver_name, origin, destination, departure_time, max_passengers)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		ride.ID, ride.DriverID, ride.DriverName, ride.Origin, ride.Destination, ride.DepartureTime, ride.MaxPassengers,
	)
	return err
}

func GetRides() ([]types.Ride, error) {
	// 1. 修改 SQL: 明確選取 driver_id, status 等所有欄位
	// COALESCE 是為了防止資料庫有 NULL 導致 Go 崩潰
	rows, err := DB.Query(`
		SELECT 
			r.id, 
			r.driver_id,
			COALESCE(r.driver_name, 'Unknown'), 
			r.origin, 
			r.destination, 
			r.departure_time, 
			r.max_passengers,
			COALESCE(r.status, 'open'),
			(SELECT COUNT(*) FROM ride_participants p WHERE p.ride_id = r.id) as current_passengers
		FROM rides r
		ORDER BY r.departure_time DESC
	`)
	if err != nil {
		log.Printf("Query Failed: %v", err)
		return nil, err
	}
	defer rows.Close()

	// 初始化 slice，確保沒資料時回傳 [] 而不是 null
	rides := make([]types.Ride, 0)

	for rows.Next() {
		var r types.Ride
		// 2. 這裡的 Scan 順序必須跟上面的 SELECT 嚴格一致
		if err := rows.Scan(
			&r.ID,
			&r.DriverID, // 補上
			&r.DriverName,
			&r.Origin,
			&r.Destination,
			&r.DepartureTime,
			&r.MaxPassengers,
			&r.Status,
			&r.CurrentPassengers,
		); err != nil {
			log.Printf("Row Scan Failed: %v", err) // 如果有錯，Tilt Log 會看到
			continue
		}
		rides = append(rides, r)
	}

	// 檢查遍歷過程中是否有錯
	if err = rows.Err(); err != nil {
		log.Printf("Rows Iteration Error: %v", err)
		return nil, err
	}

	log.Printf("Successfully fetched %d rides", len(rides))
	return rides, nil
}

// 儲存訊息
func SaveMessage(rideID, senderID, content string) error {
	_, err := DB.Exec(`INSERT INTO messages (ride_id, sender_id, content) VALUES ($1, $2, $3)`, rideID, senderID, content)
	return err
}

func GetUserInfo(userID string) (types.User, error) {
	var u types.User
	// 我們只 scan 三個欄位，其他的 (Email, Role) 留空字串沒關係
	// 因為聊天室只需要名字和照片
	err := DB.QueryRow("SELECT id, name, picture FROM users WHERE id = $1", userID).Scan(&u.ID, &u.Name, &u.Picture)
	return u, err
}
// 取得「我參與的」或「我駕駛的」旅程
func GetMyRides(userID string) ([]types.Ride, error) {
	// 邏輯：我是司機 OR 我在乘客名單裡
	rows, err := DB.Query(`
		SELECT DISTINCT 
			r.id, r.driver_id, COALESCE(r.driver_name, 'Unknown'), r.origin, r.destination, 
			r.departure_time, r.max_passengers, COALESCE(r.status, 'open'),
			(SELECT COUNT(*) FROM ride_participants p2 WHERE p2.ride_id = r.id) as current_passengers
		FROM rides r
		LEFT JOIN ride_participants p ON r.id = p.ride_id
		WHERE r.driver_id = $1 OR p.passenger_id = $1
		ORDER BY r.departure_time DESC
	`, userID)
	if err != nil { return nil, err }
	defer rows.Close()

	rides := make([]types.Ride, 0)
	for rows.Next() {
		var r types.Ride
		if err := rows.Scan(&r.ID, &r.DriverID, &r.DriverName, &r.Origin, &r.Destination, &r.DepartureTime, &r.MaxPassengers, &r.Status, &r.CurrentPassengers); err != nil {
			continue
		}
		rides = append(rides, r)
	}
	return rides, nil
}
func JoinRide(rideID, passengerID string) error {
	// 1. 檢查旅程是否存在以及人數是否已滿
	var maxPassengers, currentPassengers int
	err := DB.QueryRow(`
		SELECT max_passengers,
		(SELECT COUNT(*) FROM ride_participants WHERE ride_id = $1)
		FROM rides WHERE id = $1
	`, rideID).Scan(&maxPassengers, &currentPassengers)

	if err != nil {
		return fmt.Errorf("ride not found or db error: %v", err)
	}

	if currentPassengers >= maxPassengers {
		return fmt.Errorf("ride is full")
	}

	// 2. 寫入關聯表 (使用 ON CONFLICT 避免重複加入報錯)
	_, err = DB.Exec(`
		INSERT INTO ride_participants (ride_id, passenger_id)
		VALUES ($1, $2)
		ON CONFLICT (ride_id, passenger_id) DO NOTHING
	`, rideID, passengerID)

	return err
}