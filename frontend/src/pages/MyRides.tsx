import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  parseISO,
  addMonths, 
  subMonths
} from "date-fns";
import { ChatRoom } from "../components/ChatRoom";
import type { Ride } from "../types";

// const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_URL = import.meta.env.VITE_API_URL || '';

export const MyRides = () => {
  const { token, user } = useAuth();
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeRide, setActiveRide] = useState<Ride | null>(null);

  // 撈取「我的旅程」
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/rides/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setMyRides(data);
      });
  }, [token]);

  // 產生月曆格子
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  return (
    <div className="max-w-6xl p-6 mx-auto">
      <h2 className="mb-6 text-2xl font-bold text-gray-800">📅 My Schedule</h2>

      {/* 月曆 Header */}
      <div className="flex items-center justify-between mb-4">
        <button 
            onClick={() => setCurrentDate(prev => subMonths(prev, 1))} 
            className="p-2 bg-gray-100 rounded hover:bg-gray-200"
        >
          ◀
        </button>
        <span className="text-xl font-bold">
          {format(currentDate, "yyyy MMMM")}
        </span>
        <button 
            onClick={() => setCurrentDate(prev => addMonths(prev, 1))} 
            className="p-2 bg-gray-100 rounded hover:bg-gray-200"
        >
          ▶
        </button>
      </div>

      {/* 月曆 Grid */}
      <div className="grid grid-cols-7 gap-2 mb-10">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2 font-bold text-center text-gray-400">
            {d}
          </div>
        ))}

        {/* 簡單補空白格 (可選) */}
        {Array.from({ length: startOfMonth(currentDate).getDay() }).map(
          (_, i) => (
            <div key={`empty-${i}`} />
          )
        )}

        {daysInMonth.map((day) => {
          // 找出這一天的旅程
          const ridesToday = myRides.filter((r) =>
            isSameDay(parseISO(r.departureTime), day)
          );

          return (
            <div
              key={day.toString()}
              className="min-h-[100px] border rounded-lg p-2 bg-white hover:shadow-md transition"
            >
              <div className="mb-1 text-sm text-right text-gray-400">
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {ridesToday.map((ride) => (
                  <div
                    key={ride.id}
                    onClick={() => setActiveRide(ride)}
                    className={`
                                    text-xs p-1.5 rounded mb-1 cursor-pointer border-l-4 shadow-sm hover:opacity-80 transition
                                    flex flex-col gap-0.5 overflow-hidden
                                    ${
                                      ride.driverId === user?.userId
                                        ? "bg-green-50 border-green-500 text-green-800" // 司機樣式
                                        : "bg-blue-50 border-blue-500 text-blue-800" // 乘客樣式
                                    }
                                `}
                  >
                    {/* 第一行：時間 */}
                    <div className="font-bold text-[10px] opacity-75">
                      {format(parseISO(ride.departureTime), "HH:mm")}
                    </div>

                    {/* 第二行：起點 -> 終點 (允許換行) */}
                    <div className="font-medium leading-tight wrap-break-words">
                      <span>{ride.origin}</span>
                      <span className="mx-1 text-gray-400">➜</span>
                      <span>{ride.destination}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* 聊天室 Popup (只在這裡顯示) */}
      {activeRide && user && (
        <ChatRoom
          roomId={activeRide.id}
          roomName={`${activeRide.origin} ➜ ${activeRide.destination}`}
          username={user.name}
          userId={user.userId}
          onClose={() => setActiveRide(null)}
        />
      )}
    </div>
  );
};
