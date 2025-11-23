import { useEffect, useState, useRef } from 'react';

// const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_URL = import.meta.env.VITE_API_URL || '';

export interface ChatMessage {
  username: string;
  content: string;
  roomId: string; // 其實是 rideId
  timestamp: string;
  senderPicture?: string; // 新增：後端會補上這欄位
  senderId?: string;      // 新增：方便前端判斷是不是自己
}

export const useChat = (roomId: string, username: string, userId: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 決定協定：如果是 https 網頁就用 wss (安全)，http 就用 ws
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 2. 決定主機 (Host)：
    // 如果有設定 API_URL (環境變數)，就用它去掉 http:// 後的部分。
    // 如果 API_URL 是空的 (我們現在的策略)，就抓「瀏覽器當前的網址 (window.location.host)」。
    let host = '';
    if (API_URL) {
        host = API_URL.replace(/^http(s)?:\/\//, '');
    } else {
        host = window.location.host; 
        // 在 AWS 上，這會自動變成 "xxxx.elb.amazonaws.com"
        // 在本地 (透過 Nginx 訪問)，這會變成 "localhost:8000"
    }
    const wsUrl = `${protocol}//${host}/ws?roomId=${roomId}`;
    console.log("Connecting to WebSocket:", wsUrl); // 除錯用，讓你知道它連去哪

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => setIsConnected(true);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (Array.isArray(data)) {
          setMessages(data);
        } else {
          setMessages((prev) => [...prev, data]);
        }
      } catch (e) { console.error(e); }
    };
    ws.onclose = () => setIsConnected(false);

    return () => ws.close();
  }, [roomId]);

  const sendMessage = (content: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const now = new Date();
      const timestamp = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      
      const msg = { 
        username, 
        content, 
        roomId, 
        timestamp,
        senderId: userId // 帶上 ID，雖然可以從 Token 解，但這樣簡單點
      };
      socketRef.current.send(JSON.stringify(msg));
    }
  };

  return { messages, sendMessage, isConnected };
};