package types

import "time"

type Ride struct {
	ID                string `json:"id"`
	DriverID          string `json:"driverId"`
	DriverName        string `json:"driverName"`
	Origin            string `json:"origin"`
	Destination       string `json:"destination"`
	DepartureTime     time.Time `json:"departureTime"` // 改用 time.Time 比較好操作 DB
	MaxPassengers     int    `json:"maxPassengers"`
	CurrentPassengers int    `json:"currentPassengers"`
	Status            string `json:"status"` // open, closed
}

// 訊息 (增加發送者頭貼)
type ChatMessage struct {
	ID            int    `json:"id"`
	RideID        string `json:"rideId"` // 對應 Ride.ID
	SenderID      string `json:"senderId"`
	SenderName    string `json:"senderName"`
	SenderPicture string `json:"senderPicture"` // 從 Users 表 Join 出來
	Content       string `json:"content"`
	Timestamp     string `json:"timestamp"`     // 前端傳來的顯示時間
	CreatedAt     time.Time `json:"createdAt"` // DB 存的實際時間
}

type User struct {
	ID      string `json:"id"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
	Role    string `json:"role"` // passenger 或 driver
}