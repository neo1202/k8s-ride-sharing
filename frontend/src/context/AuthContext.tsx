// 📂 src/context/AuthContext.tsx
import { createContext, useContext } from "react";
import type { User } from "../types"; // 確保路徑正確

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (userData: User, token: string) => void;
  logout: () => void;
  updateRole: (role: "driver" | "passenger") => void;
}

// 1. 建立 Context (這裡要 export，因為 Provider 檔案需要用到)
export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 2. 建立 Hook
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}