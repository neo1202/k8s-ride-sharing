import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';

interface ChatRoomProps {
  roomId: string;
  roomName: string;
  username: string;
  userId: string; // 新增
  onClose: () => void;
}

export const ChatRoom = ({ roomId, roomName, username, userId, onClose }: ChatRoomProps) => {
  const { messages, sendMessage, isConnected } = useChat(roomId, username, userId);
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
    <div className="fixed bottom-4 right-4 w-96 h-[500px] bg-white rounded-t-xl shadow-2xl flex flex-col border border-gray-300 z-50 font-sans">
      {/* Header */}
      <div className="bg-blue-600 text-white p-4 rounded-t-xl flex justify-between items-center shadow-md cursor-pointer" onClick={onClose}>
        <div className="flex items-center gap-2 overflow-hidden">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} shadow-sm`}></div>
          <span className="font-bold truncate text-lg">{roomName}</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-white/80 hover:text-white font-bold text-xl px-2">✕</button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
        {messages.map((msg, index) => {
          const isMe = msg.senderId === userId || msg.username === username;
          return (
            <div key={index} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              {/* 頭貼 */}
              <div className="shrink-0">
                {msg.senderPicture ? (
                  <img src={msg.senderPicture} className="w-8 h-8 rounded-full border border-gray-200" alt={msg.username} />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-xs text-white">
                    {msg.username[0]}
                  </div>
                )}
              </div>

              <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[70%]`}>
                {/* 名字 */}
                {!isMe && <span className="text-xs text-gray-500 ml-1 mb-1">{msg.username}</span>}
                
                {/* 氣泡 */}
                <div className={`px-4 py-2 text-sm rounded-2xl shadow-sm wrap-break-word relative group ${
                  isMe 
                    ? 'bg-blue-500 text-white rounded-tr-none' 
                    : 'bg-white text-gray-800 rounded-tl-none border border-gray-200'
                }`}>
                  {msg.content}
                </div>
                {/* 時間 */}
                <span className="text-[10px] text-gray-400 mt-1 mx-1">{msg.timestamp}</span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white border-t border-gray-100">
        <div className="flex gap-2 bg-gray-100 rounded-full p-1 pr-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="傳送訊息..."
            className="flex-1 bg-transparent px-4 py-2 text-sm focus:outline-none"
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={!isConnected}
            className="bg-blue-600 text-white rounded-full w-9 h-9 flex items-center justify-center hover:bg-blue-700 disabled:bg-gray-400 transition shadow-sm"
          >
            ➤
          </button>
        </div>
      </div>
    </div>
  );
};