import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { type ChatRoomType, type Ride } from "../types";
import { Modal } from "../components/Modal"; // 記得引入 Modal

const API_URL = import.meta.env.VITE_API_URL || "";

const PINNED_ROOMS: ChatRoomType[] = [
  { id: "announcement", name: "📢 Announcements", isPinned: true },
  { id: "roadmap", name: "🚀 Roadmap & Future", isPinned: true }, // [修改] 改名為 Roadmap
  { id: "leaderboard", name: "🏆 Leaderboard", isPinned: true },
];

export const Home = () => {
  const { user, token, updateRole } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);

  // [新增] 控制彈窗的狀態
  const [activeInfoModal, setActiveInfoModal] = useState<string | null>(null);

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
        body: JSON.stringify({ rideId }),
      });

      if (res.ok) {
        alert("Joined successfully! Check 'My Rides'.");
        fetchRides();
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

  // [新增] 彈窗內容渲染邏輯
  const renderInfoContent = () => {
    switch (activeInfoModal) {
      case "announcement":
        return (
          <div className="space-y-4 text-gray-700">
            <p className="text-lg">
              👋 <strong>Welcome to RideShare!</strong>
            </p>
            <p>Here is how it works:</p>
            <ul className="p-4 space-y-2 text-sm list-disc list-inside border border-gray-100 rounded-lg bg-gray-50">
              <li>
                <strong>Drivers</strong> can create new ride schedules in the
                Lobby.
              </li>
              <li>
                <strong>Passengers</strong> can browse and join available rides.
              </li>
              <li>
                Once joined, go to the{" "}
                <span className="font-bold text-blue-600">"My Rides"</span>{" "}
                page.
              </li>
              <li>
                Click on a ride card to enter the{" "}
                <strong>Real-time Chat Room</strong>! 💬
              </li>
            </ul>
          </div>
        );
      case "roadmap":
        return (
          <div className="space-y-4">
            <p className="text-lg">
              🚀 <strong>Future Features & Tech Stack</strong>
            </p>
            <p className="text-sm text-gray-500">
              We are constantly improving. Here is what's coming next:
            </p>
            <ul className="mt-4 space-y-4">
              <li className="flex items-start gap-3">
                <span className="p-2 text-2xl rounded-lg bg-blue-50">📍</span>
                <div>
                  <strong className="block text-gray-800">
                    Real-time Location Tracking
                  </strong>
                  <p className="mt-1 text-xs text-gray-500">
                    Integration with Message Queue (RabbitMQ) & Google Maps API
                    to track driver location.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="p-2 text-2xl rounded-lg bg-purple-50">🤖</span>
                <div>
                  <strong className="block text-gray-800">
                    AI Route Recommendation
                  </strong>
                  <p className="mt-1 text-xs text-gray-500">
                    Smart matching algorithm based on historical data and
                    traffic conditions.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <span className="p-2 text-2xl rounded-lg bg-orange-50">⚡</span>
                <div>
                  <strong className="block text-gray-800">
                    Edge Computing
                  </strong>
                  <p className="mt-1 text-xs text-gray-500">
                    Using Cloudflare Workers & Durable Objects for ultra
                    low-latency state management.
                  </p>
                </div>
              </li>
            </ul>
          </div>
        );
      case "leaderboard":
        return (
          <div className="text-center">
            <div className="mb-4 text-5xl animate-bounce">👑</div>
            <h4 className="mb-6 text-xl font-bold text-gray-800">
              Top Drivers of the Month
            </h4>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 border border-yellow-200 rounded-lg shadow-sm bg-yellow-50">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-lg font-bold text-yellow-600">
                    #1
                  </span>
                  <img
                    src={`https://ui-avatars.com/api/?name=Neo+Wu&background=random`}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="font-bold text-gray-800">Neo Wu</span>
                </div>
                <span className="font-mono font-bold text-blue-600">
                  666 pts
                </span>
              </div>

              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg opacity-75 bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-lg font-bold text-gray-400">
                    #2
                  </span>
                  <img
                    src={`https://ui-avatars.com/api/?name=Alice&background=random`}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="font-bold text-gray-600">Alice Chen</span>
                </div>
                <span className="font-mono font-bold text-blue-600">
                  420 pts
                </span>
              </div>

              <div className="flex items-center justify-between p-3 border border-gray-200 rounded-lg opacity-75 bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-lg font-bold text-orange-700">
                    #3
                  </span>
                  <img
                    src={`https://ui-avatars.com/api/?name=Bob&background=random`}
                    className="w-8 h-8 rounded-full"
                  />
                  <span className="font-bold text-gray-600">Bob Lin</span>
                </div>
                <span className="font-mono font-bold text-blue-600">
                  128 pts
                </span>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center mt-20">
        <h2 className="mb-4 text-2xl text-gray-600">
          Please Login to Continue
        </h2>
        <p className="text-gray-400">
          Access rides and chat features after login.
        </p>
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
              // [修改] 點擊打開 Modal
              onClick={() => setActiveInfoModal(room.id)}
              className="flex items-center justify-between p-4 transition border border-indigo-100 shadow-sm cursor-pointer bg-linear-to-r from-indigo-50 to-blue-50 rounded-xl hover:-translate-y-1 group"
            >
              <span className="text-lg font-bold text-indigo-800">
                {room.name}
              </span>
              <span className="text-2xl transition group-hover:scale-110">
                ✨
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ... (下面的程式碼完全不用動：角色切換、表單、列表) ... */}

      <hr className="my-8 border-gray-200" />
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
              <label className="block mb-1 text-xs text-gray-500">
                Destination
              </label>
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
                  <span className="text-gray-400">
                    👤 {ride.currentPassengers} / {ride.maxPassengers} People
                  </span>
                </div>
              </div>
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

      {/* [新增] 彈窗組件渲染 */}
      <Modal
        isOpen={!!activeInfoModal}
        onClose={() => setActiveInfoModal(null)}
        title={PINNED_ROOMS.find((r) => r.id === activeInfoModal)?.name || ""}
      >
        {renderInfoContent()}
      </Modal>
    </div>
  );
};
