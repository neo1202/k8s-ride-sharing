import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
// import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import "./App.css";

// 引入你的 ChatRoom 元件
import { ChatRoom } from "./components/ChatRoom";

// --- 型別定義 ---
interface User {
  name: string;
  picture: string;
  email: string;
  userId: string;
}

interface ChatRoomType {
  id: string;
  name: string;
  isPinned?: boolean; // 用來區分是不是置頂房間 (可以用來給不同的 CSS 樣式)
}

// --- 1. 定義三個永遠置頂的房間 ---
// 這些房間的 ID 是固定的字串，方便後端辨識或做權限控管
const PINNED_ROOMS: ChatRoomType[] = [
  { id: "announcement", name: "📢 公告", isPinned: true },
  { id: "general", name: "💬 留言區", isPinned: true },
  { id: "leaderboard", name: "🏆 積分榜", isPinned: true },
];

function App() {
  const API_URL = import.meta.env.VITE_API_URL;
  const [user, setUser] = useState<User | null>(null);
  const [userRooms, setUserRooms] = useState<ChatRoomType[]>([]);
  const [newRoomName, setNewRoomName] = useState("");
  const [currentRoom, setCurrentRoom] = useState<ChatRoomType | null>(null);
  // 1. 初始化：檢查 LocalStorage 登入狀態 & 撈房間
  useEffect(() => {
    const token = localStorage.getItem("chat_token");
    fetch(`${API_URL}/api/rooms`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setUserRooms(data);
      })
      .catch((err) => console.error("Failed to fetch rooms", err));

    // 檢查登入 (這裡簡化處理：如果有 Token，假設有效) 實務上應該拿 Token 去後端驗證有效性
    const storedToken = localStorage.getItem("chat_token");
    const storedUser = localStorage.getItem("chat_user_info");
    if (storedToken && storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, [API_URL]);
  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      console.log("Google Access Token:", tokenResponse.access_token);

      try {
        // 我們把 Access Token 丟給後端
        // 後端會拿這個 Token 去跟 Google 換取 User Profile
        const response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken: tokenResponse.access_token, // 注意：這裡改名了
          }),
        });

        if (!response.ok) throw new Error("Backend validation failed");

        const data = await response.json();

        // 因為改用 Access Token 換資料，Google 幾乎保證會回傳 picture
        // 但我們還是保留 UI Avatars 當保底
        const userPicture = data.picture
          ? data.picture
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(
              data.name
            )}&background=random`;

        const userInfo = {
          name: data.name,
          picture: userPicture,
          email: data.email,
          userId: data.userId,
        };

        setUser(userInfo);
        localStorage.setItem("chat_token", data.token);
        localStorage.setItem("chat_user_info", JSON.stringify(userInfo));
      } catch (error) {
        console.error("Login failed:", error);
        alert("登入失敗");
      }
    },
    onError: () => console.log("Login Failed"),
  });

  // --- 3. 建立房間邏輯 (ID 遞增) ---
  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    const token = localStorage.getItem("chat_token"); // 從 LocalStorage 拿 Token

    if (!token) {
      alert("請先登入！");
      return;
    }

    const newRoom = {
      id: Date.now().toString(),
      name: newRoomName,
      isPinned: false,
    };

    try {
      // --- 修改這裡：加入 Authorization Header ---
      const res = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // <--- 關鍵！帶上通行證
        },
        body: JSON.stringify(newRoom),
      });

      if (res.ok) {
        setUserRooms([...userRooms, newRoom]);
        setNewRoomName("");
      } else {
        alert("建立失敗，可能權限不足");
      }
    } catch (e) {
      alert(e);
    }
  };

  const enterRoom = (room: ChatRoomType) => {
    setCurrentRoom(room);
  };

  return (
    <div className="App max-w-5xl mx-auto p-4 font-sans text-gray-800">
      <header className="flex justify-between items-center border-b pb-4 mb-6">
        <h1 className="text-2xl font-bold text-blue-600">Micro Chat</h1>
        {user && (
          <div className="flex items-center gap-3">
            <img
              src={user.picture}
              alt={user.name}
              className="w-10 h-10 rounded-full border border-gray-200"
            />
            <span className="font-medium">{user.name}</span>
            <button
              onClick={() => {
                setUser(null);
                setCurrentRoom(null);
              }}
              className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 transition text-sm"
            >
              登出
            </button>
          </div>
        )}
      </header>

      <main>
        {!user ? (
          <div className="flex flex-col items-center mt-20">
            <h2 className="text-xl mb-6 text-gray-600">請先登入以開始聊天</h2>
            <button
              onClick={() => login()}
              className="flex items-center gap-3 bg-white text-gray-700 border border-gray-300 px-6 py-3 rounded-lg font-bold hover:bg-gray-50 hover:shadow transition active:scale-95"
            >
              <img
                src="https://www.svgrepo.com/show/475656/google-color.svg"
                className="w-6 h-6"
                alt="Google"
              />
              使用 Google 帳號登入
            </button>
          </div>
        ) : (
          <>
            {/* 聊天室視窗 (彈出式) */}
            {currentRoom && (
              <ChatRoom
                roomId={currentRoom.id}
                roomName={currentRoom.name}
                username={user.name}
                onClose={() => setCurrentRoom(null)}
              />
            )}

            <div className="chat-lobby space-y-8">
              {/* --- 區塊 A: 置頂官方頻道 --- */}
              <section>
                <h3 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
                  📌 官方頻道
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {PINNED_ROOMS.map((room) => (
                    <div
                      key={room.id}
                      onClick={() => enterRoom(room)}
                      className="bg-linear-to-r from-blue-50 to-indigo-50 border border-blue-100 p-4 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition hover:-translate-y-1 flex items-center justify-between group"
                    >
                      <span className="font-bold text-blue-800 text-lg">
                        {room.name}
                      </span>
                      <span className="text-2xl group-hover:scale-110 transition">
                        ✨
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              <hr className="border-gray-100" />

              {/* --- 區塊 B: 建立新房間 --- */}
              <section className="flex gap-3 bg-gray-50 p-4 rounded-lg items-center">
                <span className="text-gray-500 font-medium">創建新房間：</span>
                <input
                  type="text"
                  placeholder="輸入房間名稱 (例如：週末打球)"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={handleCreateRoom}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition font-medium shadow-sm"
                >
                  ＋ 建立
                </button>
              </section>

              {/* --- 區塊 C: 使用者建立的房間列表 --- */}
              <section>
                <h3 className="text-lg font-bold text-gray-700 mb-3">
                  🌐 社群房間
                </h3>

                {userRooms.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    目前沒有其他房間，建立一個吧！
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {userRooms.map((room) => (
                      <div
                        key={room.id}
                        onClick={() => enterRoom(room)}
                        className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm hover:shadow-md cursor-pointer transition flex justify-between items-center hover:border-blue-300"
                      >
                        <div className="flex items-center gap-3">
                          {/* 顯示房間 ID */}
                          <span className="bg-gray-100 text-gray-500 text-xs px-2 py-1 rounded font-mono">
                            #{room.id}
                          </span>
                          <span className="font-medium text-gray-800">
                            {room.name}
                          </span>
                        </div>
                        <span className="text-gray-400">➡️</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
