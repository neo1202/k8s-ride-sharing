import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { type ChatRoomType, type Ride } from "../types";

// const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_URL = import.meta.env.VITE_API_URL || '';

const PINNED_ROOMS: ChatRoomType[] = [
  { id: "announcement", name: "📢 Announcements", isPinned: true },
  { id: "general", name: "💬 General Chat", isPinned: true },
  { id: "leaderboard", name: "🏆 Leaderboard", isPinned: true },
];

export const Home = () => {
  const { user, token, updateRole } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
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
      alert("Please fill in all fields");
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
        alert("Ride created successfully! Check 'My Rides'.");
      }
    } catch (e) {
      alert(e);
    }
  };

  const handleJoinRide = async (rideId: string) => {
    if (!token) return alert("Please login first");

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
        alert("Joined successfully! Check 'My Rides'.");
        fetchRides(); // 重新撈取列表，這樣人數 (currentPassengers) 才會變
      } else if (res.status === 409) {
        alert("Join failed: Ride is full");
      } else {
        alert("Join failed: Please try again later");
      }
    } catch (e) {
      console.error(e);
      alert("Network error");
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center mt-20">
        <h2 className="mb-4 text-2xl text-gray-600">Please Login to Continue</h2>
        <p className="text-gray-400">Access rides and chat features after login.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl p-4 pb-20 mx-auto">
      {/* 置頂公告 */}
      <section className="mb-8">
        <h3 className="flex items-center gap-2 mb-3 text-lg font-bold text-gray-700">
          📌 Official Channels
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PINNED_ROOMS.map((room) => (
            <div
              key={room.id}
              // 這裡如果你也不想讓它在大廳彈出，可以先把 onClick 拿掉，或者導向到專屬頁面
              // onClick={() => alert("請至儀表板查看")}
              className="flex items-center justify-between p-4 transition border border-indigo-100 shadow-sm cursor-pointer bg-linear-to-r from-indigo-50 to-blue-50 rounded-xl hover:-translate-y-1 group"
            >
              <span className="text-lg font-bold text-indigo-800">
                {room.name}
              </span>
              <span className="text-2xl">✨</span>
            </div>
          ))}
        </div>
      </section>

      <hr className="my-8 border-gray-200" />

      {/* 角色切換 */}
      <div className="flex justify-center mb-8">
        <div className="flex gap-2 p-1 bg-gray-100 rounded-lg shadow-inner">
          <button
            onClick={() => updateRole("passenger")}
            className={`px-6 py-2 rounded-md font-medium transition ${
              user.role === "passenger"
                ? "bg-white shadow text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            I'm a passenger
          </button>
          <button
            onClick={() => updateRole("driver")}
            className={`px-6 py-2 rounded-md font-medium transition ${
              user.role === "driver"
                ? "bg-white shadow text-green-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            I'm a driver
          </button>
        </div>
      </div>

      {/* 建立表單 (Driver Only) */}
      {user.role === "driver" && (
        <div className="p-6 mb-8 bg-white border border-green-100 shadow-sm rounded-xl ring-1 ring-green-50">
          <h2 className="flex items-center gap-2 mb-4 text-lg font-bold text-green-800">
            🚗 Create New Ride
          </h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[150px]">
              <label className="block mb-1 text-xs text-gray-500">Origin</label>
              <input
                className="w-full p-2 border border-gray-300 rounded bg-gray-50"
                value={formData.origin}
                onChange={(e) =>
                  setFormData({ ...formData, origin: e.target.value })
                }
              />
            </div>
            <span className="pb-3 text-gray-400">➜</span>
            <div className="flex-1 min-w-[150px]">
              <label className="block mb-1 text-xs text-gray-500">Destination</label>
              <input
                className="w-full p-2 border border-gray-300 rounded bg-gray-50"
                value={formData.destination}
                onChange={(e) =>
                  setFormData({ ...formData, destination: e.target.value })
                }
              />
            </div>
            <div className="w-[180px]">
              <label className="block mb-1 text-xs text-gray-500">
                Departure Time
              </label>
              <input
                type="datetime-local"
                className="w-full p-2 border border-gray-300 rounded bg-gray-50"
                value={formData.time}
                onChange={(e) =>
                  setFormData({ ...formData, time: e.target.value })
                }
              />
            </div>

            {/* [新增] 人數設定 */}
            <div className="w-20">
              <label className="block mb-1 text-xs text-gray-500">Seats</label>
              <input
                type="number"
                min="1"
                max="8"
                className="w-full p-2 text-center border border-gray-300 rounded bg-gray-50"
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
              Publish
            </button>
          </div>
        </div>
      )}

      {/* 旅程列表 */}
      <section>
        <h3 className="flex items-center gap-2 mb-4 text-lg font-bold text-gray-700">
          🌐 Available Rides{" "}
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
            {rides.length}
          </span>
        </h3>
        <div className="grid gap-4">
          {rides.map((ride) => (
            <div
              key={ride.id}
              className="flex items-center justify-between p-5 transition bg-white border border-gray-100 shadow-sm rounded-xl hover:border-blue-300 group"
            >
              <div>
                <div className="flex items-center gap-2 mb-1 text-xl font-bold text-gray-800">
                  {ride.origin} <span className="text-sm text-gray-300">➜</span>{" "}
                  {ride.destination}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                    🕒 {new Date(ride.departureTime).toLocaleString()}
                  </span>
                  <span>🚗 {ride.driverName}</span>
                  {/* 顯示人數 */}
                  <span className="text-gray-400">
                    👤 {ride.currentPassengers} / {ride.maxPassengers} People
                  </span>
                </div>
              </div>

              {/* 按鈕邏輯修正：不給直接進入聊天室 */}
              {user.role === "driver" && ride.driverId === user.userId ? (
                <span className="px-4 py-2 text-sm font-bold text-green-600 border border-green-100 rounded-lg bg-green-50">
                  ✅ My Ride
                </span>
              ) : (
                <button
                  onClick={() => handleJoinRide(ride.id)}
                  className="px-5 py-2 font-bold text-blue-600 transition border border-blue-200 rounded-lg shadow-sm bg-blue-50 hover:bg-blue-100"
                >
                  + Join
                </button>
              )}
            </div>
          ))}
          {rides.length === 0 && (
            <div className="py-10 text-center text-gray-400 border-2 border-dashed rounded-xl">
              No rides available yet. Drivers, create one!
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
