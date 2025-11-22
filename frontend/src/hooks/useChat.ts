import { useEffect, useState, useRef } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
    // setMessages([]);
    // 自動判斷 ws 或 wss
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = API_URL.replace(/^http(s)?:\/\//, '');
    
    const ws = new WebSocket(`${protocol}//${host}/ws?roomId=${roomId}`);
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