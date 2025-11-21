// frontend/src/components/ChatRoom.tsx
import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';

interface ChatRoomProps {
  roomId: string;
  roomName: string;
  username: string;
  onClose: () => void; // 改名：從 onLeave 變成 onClose 比較直觀
}

export const ChatRoom = ({ roomId, roomName, username, onClose }: ChatRoomProps) => {
  const { messages, sendMessage, isConnected } = useChat(roomId, username);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input);
    setInput('');
  };

  return (
    // 修改這裡：變成固定在右下角的彈出視窗
    <div className="fixed bottom-4 right-4 w-80 h-96 bg-white rounded-t-lg shadow-2xl flex flex-col border border-gray-300 z-50">
      
      {/* Header */}
      <div className="bg-blue-600 text-white p-3 rounded-t-lg flex justify-between items-center cursor-pointer" onClick={onClose}>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
          <span className="font-bold truncate w-40">{roomName}</span>
        </div>
        {/* 關閉按鈕 (X) */}
        <button 
          onClick={(e) => { e.stopPropagation(); onClose(); }} // 防止觸發 Header 點擊
          className="text-white hover:text-gray-200 font-bold"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 bg-gray-50 space-y-3">
        {messages.map((msg, index) => {
          const isMe = msg.username === username;
          return (
            <div key={index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              {/* 名字 (如果是對方才顯示) */}
              {!isMe && <span className="text-xs text-gray-500 ml-1 mb-0.5">{msg.username}</span>}
              
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm break-words relative group ${
                isMe 
                  ? 'bg-blue-500 text-white rounded-br-none' 
                  : 'bg-white text-gray-800 rounded-bl-none border border-gray-200'
              }`}>
                {msg.content}
                
                {/* 時間戳記：顯示在氣泡旁邊或裡面 */}
                <div className={`text-[10px] mt-1 text-right ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                  {msg.timestamp}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 bg-white border-t">
        <div className="flex gap-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="輸入訊息..."
            className="flex-1 border border-gray-300 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!isConnected}
            className="bg-blue-600 text-white rounded-full w-10 h-8 flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-400"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
};