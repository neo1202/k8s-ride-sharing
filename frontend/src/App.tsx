import { useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google"; // Use CredentialResponse from @react-oauth/google
import { jwtDecode } from "jwt-decode";
import "./App.css";

interface User {
  name: string;
  picture: string;
  email: string;
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
  const handleLoginSuccess = (credentialResponse: CredentialResponse) => {
    if (credentialResponse.credential) {
      const decoded = jwtDecode<User>(credentialResponse.credential);
      console.log("Login Success:", decoded);
      setUser(decoded);
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