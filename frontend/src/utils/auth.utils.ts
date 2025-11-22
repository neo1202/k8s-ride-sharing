import type { User } from "../types"; 

export const initializeStateFromStorage = () => {
  try {
    const storedUser = localStorage.getItem("chat_user_info");
    const storedToken = localStorage.getItem("chat_token");

    // 如果兩者都存在，則回傳解析後的狀態
    if (storedUser && storedToken) {
      return {
        user: JSON.parse(storedUser) as User, // 確保型別正確
        token: storedToken,
      };
    }
  } catch (e) {
    console.error("Failed to parse user info", e);
    // 清除錯誤的本地資料
    localStorage.clear();
  }

  // 找不到資料時，回傳預設的 null 狀態
  return { user: null, token: null };
};