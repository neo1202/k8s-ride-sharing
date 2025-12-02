import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { AuthProvider } from "./context/AuthProvider";
import { useGoogleLogin } from '@react-oauth/google';
import clsx from 'clsx';
import { Home } from './pages/Home';
import { MyRides } from './pages/MyRides';
import type { User } from './types'; // 引入 types

// const API_URL = import.meta.env.VITE_API_URL;
const API_URL = import.meta.env.VITE_API_URL || '';

// Navbar 元件：負責顯示登入按鈕、登出、切換頁面連結
function Navbar() {
  const { user, logout, login } = useAuth();
  const location = useLocation();

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken: tokenResponse.access_token }),
        });

        if (!response.ok) throw new Error("Login failed");

        const data = await response.json();
        console.log("[Login] Backend Response:", data);
        if (!data.picture) {
            console.warn("⚠️ [Login] Backend returned NO PICTURE string!");
        }
        // 處理頭貼邏輯
        const userPicture = data.picture 
          ? data.picture 
          : `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random`;

        const userInfo: User = {
          name: data.name,
          picture: userPicture,
          email: data.email,
          userId: data.userId,
          role: data.role as 'driver' | 'passenger' // 強制轉型
        };

        // 呼叫 Context 的 login 更新全域狀態
        login(userInfo, data.token);

      } catch (error) {
        console.error("Login error:", error);
        alert("登入失敗");
      }
    },
    onError: () => alert("Google 登入失敗"),
  });

  return (
    <nav className="sticky top-0 z-20 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2 text-2xl font-bold text-blue-600">
            <span>🚖</span> RideShare
        </div>
        {user && (
            <div className="flex gap-2">
                <Link to="/" className={clsx("px-4 py-2 rounded-full text-sm font-medium transition", location.pathname === '/' ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700")}>Lobby</Link>
                <Link to="/my-rides" className={clsx("px-4 py-2 rounded-full text-sm font-medium transition", location.pathname === '/my-rides' ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:text-gray-700")}>My Rides</Link>
            </div>
        )}
      </div>
      
      {user ? (
        <div className="flex items-center gap-3">
            <img src={user.picture} className="border border-gray-200 rounded-full w-9 h-9" alt={user.name} />
            <div className="hidden text-sm text-right md:block">
              <div className="font-bold text-gray-700">{user.name}</div>
              <div className="text-xs text-gray-400 uppercase">{user.role}</div>
            </div>
            <button onClick={logout} className="px-3 py-1 ml-2 text-sm text-red-500 transition rounded hover:bg-red-50">Logout</button>
        </div>
      ) : (
        <button onClick={() => googleLogin()} className="px-5 py-2 text-sm font-bold text-white transition bg-blue-600 rounded-lg shadow hover:bg-blue-700">
          Login with Google
        </button>
      )}
    </nav>
  );
}

// 主程式
function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/my-rides" element={<MyRides />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;