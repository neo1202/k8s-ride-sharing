import { useEffect, useState, useRef } from 'react';

export interface ChatMessage {
  username: string;
  content: string;
  roomId: string;
  timestamp: string;
}

export const useChat = (roomId: string, username: string) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // 這裡不用刻意先 setMessages([])，因為連線後的 0.1 秒內歷史訊息就會來覆蓋
    // 這樣可以減少一次不必要的 Render
    // 自動判斷：如果是 http 就轉成 ws, https 就轉成 wss
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const apiHost = import.meta.env.VITE_API_URL.replace(/^http(s)?:\/\//, '');
    const wsUrl = `${protocol}//${apiHost}/ws`;

    // 連線
    const ws = new WebSocket(`${wsUrl}?roomId=${roomId}`);
    // const ws = new WebSocket(`ws://localhost:8080/ws?roomId=${roomId}`);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to room:', roomId);
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // --- 關鍵修改：判斷是陣列還是單一物件 ---
        if (Array.isArray(data)) {
          // 情況 A: 收到歷史訊息包 (Array)
          // 直接用這包歷史紀錄「取代」目前的訊息狀態
          setMessages(data as ChatMessage[]);
        } else {
          // 情況 B: 收到單條即時訊息 (Object)
          // 加到陣列尾端
          const message = data as ChatMessage;
          setMessages((prev) => [...prev, message]);
        }

      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected');
      setIsConnected(false);
    };

    return () => {
      ws.close();
      // 離開房間時清空訊息，避免切換瞬間看到殘影
      setMessages([]);
    };
  }, [roomId]);

  const sendMessage = (content: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      const now = new Date();
      const timestamp = now.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      });

      const msg: ChatMessage = { 
        username, 
        content, 
        roomId,
        timestamp
      };
      
      socketRef.current.send(JSON.stringify(msg));
    }
  };

  return { messages, sendMessage, isConnected };
};