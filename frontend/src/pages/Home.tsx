import { useState, useEffect } from "react";
// 注意：這裡改成從 hooks 引入
import { useAuth } from "../context/AuthContext";
import { type ChatRoomType, type Ride } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const PINNED_ROOMS: ChatRoomType[] = [
  { id: "announcement", name: "📢 公告", isPinned: true },
  { id: "general", name: "💬 留言區", isPinned: true },
  { id: "leaderboard", name: "🏆 積分榜", isPinned: true },
];

export const Home = () => {
  const { user, token, updateRole } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);

  // 初始化表單，預設 3 人
  const [formData, setFormData] = useState({
    origin: "",
    destination: "",
    time: "",
    maxPassengers: 3,
  });

  const fetchRides = () => {
    fetch(`${API_URL}/api/rides`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setRides(data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetchRides();
  }, []);

  const handleCreateRide = async () => {
    if (!token) return;
    // 檢查必填
    if (
      !formData.origin ||
      !formData.destination ||
      !formData.time ||
      !formData.maxPassengers
    ) {
      alert("請填寫完整資訊");
      return;
    }

    const departureTime = new Date(formData.time).toISOString();
    const newRide = {
      id: Date.now().toString(),
      driverId: user?.userId,
      driverName: user?.name,
      origin: formData.origin,
      destination: formData.destination,
      departureTime,
      // 確保轉成數字傳給後端
      maxPassengers: Number(formData.maxPassengers),
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
        fetchRides();
        // 重置表單
        setFormData({
          origin: "",
          destination: "",
          time: "",
          maxPassengers: 3,
        });
        alert("發布成功！請至「我的旅程」查看");
      }
    } catch (e) {
      alert(e);
    }
  };

  const handleJoinRide = async (rideId: string) => {
    if (!token) return alert("請先登入");

    try {
      const res = await fetch(`${API_URL}/api/rides/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ rideId }), // 傳送 rideId
      });

      if (res.ok) {
        alert("加入成功！請至「我的旅程」查看");
        fetchRides(); // 重新撈取列表，這樣人數 (currentPassengers) 才會變
      } else if (res.status === 409) {
        alert("加入失敗：人數已滿");
      } else {
        alert("加入失敗：請稍後再試");
      }
    } catch (e) {
      console.error(e);
      alert("網路錯誤");
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center mt-20">
        <h2 className="text-2xl text-gray-600 mb-4">請先點擊右上角登入</h2>
        <p className="text-gray-400">登入後即可查看旅程與聊天</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 pb-20">
      {/* 置頂公告 */}
      <section className="mb-8">
        <h3 className="text-lg font-bold text-gray-700 mb-3 flex items-center gap-2">
          📌 官方頻道
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {PINNED_ROOMS.map((room) => (
            <div
              key={room.id}
              // 這裡如果你也不想讓它在大廳彈出，可以先把 onClick 拿掉，或者導向到專屬頁面
              // onClick={() => alert("請至儀表板查看")}
              className="bg-linear-to-r from-indigo-50 to-blue-50 border border-indigo-100 p-4 rounded-xl shadow-sm cursor-pointer transition hover:-translate-y-1 flex items-center justify-between group"
            >
              <span className="font-bold text-indigo-800 text-lg">
                {room.name}
              </span>
              <span className="text-2xl">✨</span>
            </div>
          ))}
        </div>
      </section>

      <hr className="border-gray-200 my-8" />

      {/* 角色切換 */}
      <div className="flex justify-center mb-8">
        <div className="bg-gray-100 p-1 rounded-lg flex gap-2 shadow-inner">
          <button
            onClick={() => updateRole("passenger")}
            className={`px-6 py-2 rounded-md font-medium transition ${
              user.role === "passenger"
                ? "bg-white shadow text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            我是乘客
          </button>
          <button
            onClick={() => updateRole("driver")}
            className={`px-6 py-2 rounded-md font-medium transition ${
              user.role === "driver"
                ? "bg-white shadow text-green-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            我是司機
          </button>
        </div>
      </div>

      {/* 建立表單 (Driver Only) */}
      {user.role === "driver" && (
        <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-green-100 ring-1 ring-green-50">
          <h2 className="text-lg font-bold mb-4 text-green-800 flex items-center gap-2">
            🚗 發布新旅程
          </h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-gray-500 mb-1 block">起點</label>
              <input
                className="w-full border border-gray-300 p-2 rounded bg-gray-50"
                value={formData.origin}
                onChange={(e) =>
                  setFormData({ ...formData, origin: e.target.value })
                }
              />
            </div>
            <span className="pb-3 text-gray-400">➜</span>
            <div className="flex-1 min-w-[150px]">
              <label className="text-xs text-gray-500 mb-1 block">終點</label>
              <input
                className="w-full border border-gray-300 p-2 rounded bg-gray-50"
                value={formData.destination}
                onChange={(e) =>
                  setFormData({ ...formData, destination: e.target.value })
                }
              />
            </div>
            <div className="w-[180px]">
              <label className="text-xs text-gray-500 mb-1 block">
                出發時間
              </label>
              <input
                type="datetime-local"
                className="w-full border border-gray-300 p-2 rounded bg-gray-50"
                value={formData.time}
                onChange={(e) =>
                  setFormData({ ...formData, time: e.target.value })
                }
              />
            </div>

            {/* [新增] 人數設定 */}
            <div className="w-[80px]">
              <label className="text-xs text-gray-500 mb-1 block">人數</label>
              <input
                type="number"
                min="1"
                max="8"
                className="w-full border border-gray-300 p-2 rounded bg-gray-50 text-center"
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
              className="bg-green-600 text-white px-6 py-2.5 rounded hover:bg-green-700 shadow-md font-bold"
            >
              發布
            </button>
          </div>
        </div>
      )}

      {/* 旅程列表 */}
      <section>
        <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
          🌐 即將出發的旅程{" "}
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
            {rides.length}
          </span>
        </h3>
        <div className="grid gap-4">
          {rides.map((ride) => (
            <div
              key={ride.id}
              className="bg-white p-5 rounded-xl shadow-sm flex justify-between items-center border border-gray-100 hover:border-blue-300 transition group"
            >
              <div>
                <div className="font-bold text-xl text-gray-800 mb-1 flex items-center gap-2">
                  {ride.origin} <span className="text-gray-300 text-sm">➜</span>{" "}
                  {ride.destination}
                </div>
                <div className="text-sm text-gray-500 flex items-center gap-4">
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                    🕒 {new Date(ride.departureTime).toLocaleString()}
                  </span>
                  <span>🚗 {ride.driverName}</span>
                  {/* 顯示人數 */}
                  <span className="text-gray-400">
                    👤 {ride.currentPassengers} / {ride.maxPassengers} 人
                  </span>
                </div>
              </div>

              {/* 按鈕邏輯修正：不給直接進入聊天室 */}
              {user.role === "driver" && ride.driverId === user.userId ? (
                <span className="text-sm font-bold text-green-600 bg-green-50 px-4 py-2 rounded-lg border border-green-100">
                  ✅ 我的旅程
                </span>
              ) : (
                <button
                  onClick={() => handleJoinRide(ride.id)}
                  className="px-5 py-2 rounded-lg font-bold shadow-sm transition bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                >
                  + 加入旅程
                </button>
              )}
            </div>
          ))}
          {rides.length === 0 && (
            <div className="text-center py-10 text-gray-400 border-2 border-dashed rounded-xl">
              目前沒有旅程，司機快來發布吧！
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
