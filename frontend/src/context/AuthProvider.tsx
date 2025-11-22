// 📂 src/context/AuthProvider.tsx
import { useState, type ReactNode } from "react";
import type { User } from "../types"; 
import { initializeStateFromStorage } from "../utils/auth.utils";
import { AuthContext } from "./AuthContext"; // 引入剛剛上面的 Context

export function AuthProvider({ children }: { children: ReactNode }) {
  // 初始化 State
  const [user, setUser] = useState<User | null>(() => initializeStateFromStorage().user);
  const [token, setToken] = useState<string | null>(() => initializeStateFromStorage().token);

  const login = (userData: User, newToken: string) => {
    setUser(userData);
    setToken(newToken);
    localStorage.setItem("chat_user_info", JSON.stringify(userData));
    localStorage.setItem("chat_token", newToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.clear();
  };

  const updateRole = (role: "driver" | "passenger") => {
    if (user) {
      const updated = { ...user, role };
      setUser(updated);
      localStorage.setItem("chat_user_info", JSON.stringify(updated));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, updateRole }}>
      {children}
    </AuthContext.Provider>
  );
}