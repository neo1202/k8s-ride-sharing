import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { ChatRoom } from '../components/ChatRoom';
import type { Ride } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const MyRides = () => {
  const { token, user } = useAuth();
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeRide, setActiveRide] = useState<Ride | null>(null);

  // 撈取「我的旅程」
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/rides/mine`, {
        headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => { if (Array.isArray(data)) setMyRides(data); });
  }, [token]);

  // 產生月曆格子
  const daysInMonth = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  });

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">📅 我的行程表</h2>
      
      {/* 月曆 Header */}
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => setCurrentDate(d => new Date(d.setMonth(d.getMonth() - 1)))} className="p-2 bg-gray-100 rounded hover:bg-gray-200">◀</button>
        <span className="text-xl font-bold">{format(currentDate, 'yyyy MMMM')}</span>
        <button onClick={() => setCurrentDate(d => new Date(d.setMonth(d.getMonth() + 1)))} className="p-2 bg-gray-100 rounded hover:bg-gray-200">▶</button>
      </div>

      {/* 月曆 Grid */}
      <div className="grid grid-cols-7 gap-2 mb-10">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center font-bold text-gray-400 py-2">{d}</div>
        ))}
        
        {/* 簡單補空白格 (可選) */}
        {Array.from({ length: startOfMonth(currentDate).getDay() }).map((_, i) => <div key={`empty-${i}`} />)}

        {daysInMonth.map(day => {
            // 找出這一天的旅程
            const ridesToday = myRides.filter(r => isSameDay(parseISO(r.departureTime), day));
            
            return (
                <div key={day.toString()} className="min-h-[100px] border rounded-lg p-2 bg-white hover:shadow-md transition">
                    <div className="text-right text-sm text-gray-400 mb-1">{format(day, 'd')}</div>
                    <div className="space-y-1">
                        {ridesToday.map(ride => (
                            <div 
                                key={ride.id} 
                                onClick={() => setActiveRide(ride)}
                                className={`text-xs p-1.5 rounded cursor-pointer truncate font-medium border-l-4 ${
                                    ride.driverId === user?.userId 
                                    ? 'bg-green-50 border-green-500 text-green-700' // 我是司機
                                    : 'bg-blue-50 border-blue-500 text-blue-700'    // 我是乘客
                                }`}
                            >
                                {format(parseISO(ride.departureTime), 'HH:mm')} {ride.destination}
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