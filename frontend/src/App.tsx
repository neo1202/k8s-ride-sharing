import { useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google"; // Use CredentialResponse from @react-oauth/google
// import { jwtDecode } from "jwt-decode"; // 後端解析所以就不用了
import "./App.css";

interface User {
    name: string;
    picture: string; // 一串網址
    email: string;
    userId: string;
}

interface ChatRoom {
    id: string;
    name: string;
}

function App() {
    const [user, setUser] = useState<User | null>(null);
    const [rooms, setRooms] = useState<ChatRoom[]>([
        { id: "1", name: "一般閒聊" },
        { id: "2", name: "技術討論" },
    ]);
    const [newRoomName, setNewRoomName] = useState("");

    // Use CredentialResponse from @react-oauth/google
    const handleLoginSuccess = async (credentialResponse: CredentialResponse) => {
        if (!credentialResponse.credential) {
            console.log("No credential received");
            return;
        }
        const googleToken = credentialResponse.credential;
        try {
            // 發送 POST 請求給 Auth Service (Go) 這裡是打 8081 port，也就是 Auth Service
            const response = await fetch("http://localhost:8081/auth/login", {
                method: "POST",
                headers: {
                "Content-Type": "application/json",
                },
                body: JSON.stringify({
                idToken: googleToken, // 把 Google 給的這張票，轉交給後端驗證
                }),
            });

            if (!response.ok) {
                throw new Error("Backend validation failed");
            }

            // 2. 後端驗證成功，回傳使用者資料
            const data = await response.json();
            console.log("Backend response:", data);
            const userPicture = data.picture 
                ? data.picture 
                : `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random`;
            setUser({
                // name: data.name, 
                name: data.email.split("@")[0], // 暫時用 email 前綴當名字
                email: data.email,
                userId: data.userId,
                picture: userPicture,
            });

            // TODO: 未來這裡會把 data.appToken 存入 localStorage
            // localStorage.setItem("chat_token", data.appToken);

            } catch (error) {
            console.error("Login failed:", error);
            alert("登入失敗，後端驗證不通過！");
        }
    };

  const handleLoginError = () => {
    console.log("Login Failed");
  };

  const handleCreateRoom = () => {
    if (!newRoomName.trim()) return;
    const newRoom: ChatRoom = {
      id: Date.now().toString(),
      name: newRoomName,
    };
    setRooms([...rooms, newRoom]);
    setNewRoomName("");
  };

  const enterRoom = (roomId: string) => {
    alert(`進入聊天室 ID: ${roomId} (之後實作 WebSocket 連線)`);
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>Micro Chat</h1>
        {user && (
          <div className="user-info">
            <img src={user.picture} alt={user.name} className="avatar" />
            <span>{user.name}</span>
            <button onClick={() => setUser(null)} className="logout-btn">
              登出
            </button>
          </div>
        )}
      </header>

      <main>
        {!user ? (
          <div className="login-container">
            <h2>請先登入以開始聊天</h2>
            <GoogleLogin
              onSuccess={handleLoginSuccess}
              onError={handleLoginError}
            />
          </div>
        ) : (
          <div className="chat-lobby">
            <div className="create-room-section">
              <input
                type="text"
                placeholder="輸入新聊天室名稱"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
              />
              <button onClick={handleCreateRoom}>建立聊天室</button>
            </div>

            <div className="room-list">
              <h3>現有聊天室</h3>
              {rooms.map((room) => (
                <div
                  key={room.id}
                  className="room-card"
                  onClick={() => enterRoom(room.id)}
                >
                  <span className="room-name">{room.name}</span>
                  <span className="join-icon">➡️</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
