import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import "./App.css";
import { ChatRoom } from "./components/ChatRoom";

const API_URL = import.meta.env.VITE_API_URL;

interface User {
  name: string;
  picture: string;
  email: string;
  userId: string;
  role: "driver" | "passenger"; // 新增 Role
}

interface Ride {
  id: string;
  driverId: string;
  driverName: string;
  origin: string;
  destination: string;
  departureTime: string;
  maxPassengers: number;
  currentPassengers: number;
  status: string;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [currentRide, setCurrentRide] = useState<Ride | null>(null);

  // 建立旅程表單狀態
  const [formData, setFormData] = useState({
    origin: "",
    destination: "",
    time: "",
    maxPassengers: 3,
  });

  // 初始化
  useEffect(() => {
    fetchRides();
    const storedUser = localStorage.getItem("chat_user_info");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchRides = () => {
    fetch(`${API_URL}/api/rides`) // 後端現在回傳的是 Rides
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setRides(data);
      })
      .catch(console.error);
  };

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: tokenResponse.access_token }),
        });
        if (!response.ok) throw new Error("Login failed");
        const data = await response.json();

        const userInfo: User = {
          name: data.name,
          picture: data.picture,
          email: data.email,
          userId: data.userId,
          role: data.role as "driver" | "passenger",
        };

        setUser(userInfo);
        localStorage.setItem("chat_token", data.token);
        localStorage.setItem("chat_user_info", JSON.stringify(userInfo));
      } catch (error) {
        console.error("Login failed:", error);
        alert("登入失敗");
      }
    },
  });

  const handleCreateRide = async () => {
    const token = localStorage.getItem("chat_token");
    if (!token) return;

    // 簡單檢查
    if (!formData.origin || !formData.destination) {
      alert("請輸入起點和終點");
      return;
    }

    // 轉換時間格式 RFC3339
    const departureTime = new Date(formData.time).toISOString();

    const newRide = {
      id: Date.now().toString(), // 暫時用時間當 ID
      driverId: user?.userId,
      driverName: user?.name,
      origin: formData.origin,
      destination: formData.destination,
      departureTime: departureTime,
      maxPassengers: Number(formData.maxPassengers),
      currentPassengers: 0,
      status: "open",
    };

    try {
      const res = await fetch(`${API_URL}/api/rides`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newRide),
      });

      if (res.ok) {
        alert("旅程建立成功！");
        setFormData({
          origin: "",
          destination: "",
          time: "",
          maxPassengers: 3,
        });
        fetchRides();
      } else {
        alert("建立失敗");
      }
    } catch (e) {
      alert(e);
    }
  };

  // 切換角色 (實際應用應該打 API 更新 DB，這裡先做前端切換效果)
  const switchRole = (newRole: "driver" | "passenger") => {
    if (user) {
      const updatedUser = { ...user, role: newRole };
      setUser(updatedUser);
      localStorage.setItem("chat_user_info", JSON.stringify(updatedUser));
      // TODO: 打 API 同步到後端 /api/users/role
    }
  };

  return (
    <div className="App min-h-screen bg-gray-50 text-gray-800 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🚖</span>
            <h1 className="text-xl font-bold text-gray-800 tracking-tight">
              RideShare Chat
            </h1>
          </div>

          {user ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-gray-100 rounded-full pl-1 pr-3 py-1">
                <img
                  src={user.picture}
                  className="w-8 h-8 rounded-full"
                  alt="avatar"
                />
                <span className="text-sm font-medium">{user.name}</span>
              </div>
              <button
                onClick={() => {
                  setUser(null);
                  localStorage.clear();
                }}
                className="text-sm text-gray-500 hover:text-red-500"
              >
                登出
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 mt-6">
        {!user ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="bg-white p-8 rounded-2xl shadow-lg text-center max-w-md w-full">
              <h2 className="text-2xl font-bold mb-2">歡迎加入共乘平台</h2>
              <p className="text-gray-500 mb-8">
                尋找你的下一趟旅程，或是分享你的座位
              </p>
              <button
                onClick={() => login()}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition flex justify-center items-center gap-2"
              >
                <img
                  src="https://www.svgrepo.com/show/475656/google-color.svg"
                  className="w-5 h-5 bg-white rounded-full"
                />
                使用 Google 登入
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 左側：控制面板 */}
            <div className="space-y-6">
              {/* 角色切換 */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                  當前身份
                </h3>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => switchRole("passenger")}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                      user.role === "passenger"
                        ? "bg-white shadow text-blue-600"
                        : "text-gray-500"
                    }`}
                  >
                    我是乘客 🙋‍♂️
                  </button>
                  <button
                    onClick={() => switchRole("driver")}
                    className={`flex-1 py-2 rounded-md text-sm font-medium transition ${
                      user.role === "driver"
                        ? "bg-white shadow text-green-600"
                        : "text-gray-500"
                    }`}
                  >
                    我是司機 🚗
                  </button>
                </div>
              </div>

              {/* 建立旅程 (只有司機可見) */}
              {user.role === "driver" && (
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                  <h3 className="text-lg font-bold mb-4 text-gray-800">
                    開啟新旅程
                  </h3>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <input
                        placeholder="起點 (例如: 內湖)"
                        className="w-1/2 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm"
                        value={formData.origin}
                        onChange={(e) =>
                          setFormData({ ...formData, origin: e.target.value })
                        }
                      />
                      <span className="text-gray-400 pt-2">➜</span>
                      <input
                        placeholder="終點 (例如: 新竹)"
                        className="w-1/2 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm"
                        value={formData.destination}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            destination: e.target.value,
                          })
                        }
                      />
                    </div>
                    <input
                      type="datetime-local"
                      className="w-full bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm text-gray-500"
                      value={formData.time}
                      onChange={(e) =>
                        setFormData({ ...formData, time: e.target.value })
                      }
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-500">最大乘客數</span>
                      <input
                        type="number"
                        min="1"
                        max="6"
                        className="w-16 bg-gray-50 border border-gray-200 rounded px-2 py-1 text-center"
                        value={formData.maxPassengers}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            maxPassengers: parseInt(e.target.value),
                          })
                        }
                      />
                    </div>
                    <button
                      onClick={handleCreateRide}
                      className="w-full bg-green-600 text-white py-2 rounded-lg font-bold hover:bg-green-700 transition mt-2"
                    >
                      發布旅程
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 右側：旅程列表 */}
            <div className="lg:col-span-2">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <span>🛣️</span>
                現有旅程
                <span className="bg-gray-200 text-gray-600 text-xs px-2 py-1 rounded-full">
                  {rides.length}
                </span>
              </h3>

              <div className="grid gap-4">
                {rides.map((ride) => (
                  <div
                    key={ride.id}
                    className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition group"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-lg text-gray-800">
                            {ride.origin}
                          </span>
                          <span className="text-gray-300">➜</span>
                          <span className="font-bold text-lg text-gray-800">
                            {ride.destination}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            📅 {new Date(ride.departureTime).toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1">
                            🚗 {ride.driverName}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setCurrentRide(ride)}
                        className="bg-blue-50 text-blue-600 px-4 py-2 rounded-lg font-bold text-sm group-hover:bg-blue-600 group-hover:text-white transition"
                      >
                        {user.role === "driver" && user.userId === ride.driverId
                          ? "進入聊天室"
                          : "加入旅程"}
                      </button>
                    </div>

                    {/* 進度條 */}
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>乘客</span>
                        <span>
                          {ride.currentPassengers} / {ride.maxPassengers} 人
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{
                            width: `${
                              (ride.currentPassengers / ride.maxPassengers) *
                              100
                            }%`,
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}

                {rides.length === 0 && (
                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-400">
                    目前沒有旅程，司機快來發布吧！
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 聊天室 (彈出視窗) */}
      {currentRide && (
        <ChatRoom
          roomId={currentRide.id}
          roomName={`${currentRide.origin} ➜ ${currentRide.destination}`}
          username={user!.name}
          userId={user!.userId}
          onClose={() => setCurrentRide(null)}
        />
      )}
    </div>
  );
}

export default App;
