import React, { useState, useEffect, useRef } from 'react';
import { ChatService, ChatMessage } from '../services/chat';
import { useAuthStore } from '../store/auth';

interface GameChatProps {
  opponentId: string;
  opponentUsername: string;
}

export function GameChat({ opponentId, opponentUsername }: GameChatProps) {
  const { user } = useAuthStore();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (opponentId) {
      loadMessages();
      markAsRead();
      
      // Refresh messages every 5 seconds for real-time chat
      const interval = setInterval(loadMessages, 5000);
      return () => clearInterval(interval);
    }
  }, [opponentId]);

  useEffect(() => {
    // Only auto-scroll when messages change and we're not on initial load
    if (messages.length > 0 && !loading) {
      // Small delay to ensure DOM is updated
      setTimeout(scrollToBottom, 100);
    }
  }, [messages, loading]);

  const loadMessages = async () => {
    if (!opponentId) return;
    
    try {
      const chatMessages = await ChatService.getMessages(opponentId, 50, 0);
      setMessages(chatMessages);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    // Use the direct container reference for more controlled scrolling
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    } else if (messagesEndRef.current) {
      // Fallback: use scrollIntoView but prevent page scrolling
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'auto', // Use 'auto' instead of 'smooth' to prevent page scrolling
        block: 'nearest',
        inline: 'nearest'
      });
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !opponentId || sending) return;
    
    try {
      setSending(true);
      const newMessage = await ChatService.sendMessage(opponentId, message.trim());
      
      // Add new message to the list
      setMessages(prev => [...prev, newMessage]);
      setMessage('');
      
      // Force reload messages to ensure consistency
      setTimeout(loadMessages, 1000);
      
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      alert(`Failed to send message: ${errorMessage}`);
    } finally {
      setSending(false);
    }
  };

  const markAsRead = async () => {
    if (!opponentId) return;
    
    try {
      await ChatService.markAsRead(opponentId);
    } catch (error) {
    }
  };


  if (!opponentId) {
    return (
      <div className="bg-white rounded-lg p-4">
        <h3 className="font-semibold mb-4">Chat</h3>
        <div className="text-center py-8">
          <p className="text-gray-500">Waiting for opponent...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg p-4 w-full overflow-hidden" style={{ minHeight: '400px' }}>
      <div className="flex flex-col h-full w-full">
        {/* Chat Header */}
        <div className="pb-4 mb-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <h3 className="font-semibold">Chat with {opponentUsername}</h3>
            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
            <span className="text-sm text-gray-500">Online</span>
          </div>
        </div>

        {/* Messages */}
        <div 
          ref={messagesContainerRef}
          className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2" 
          style={{ maxHeight: '250px', overflowAnchor: 'none' }}
        >
          {loading ? (
            <div className="text-center py-4">
              <div className="loading mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Loading messages...</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                      msg.senderId === user?.id
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    <div>{msg.message}</div>
                    <div
                      className={`text-xs mt-1 ${
                        msg.senderId === user?.id ? 'text-blue-100' : 'text-gray-500'
                      }`}
                    >
                      {new Date(msg.sentAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Message Input */}
        <div className="border-t border-gray-200 pt-4 w-full">
          <div className="flex gap-2 w-full">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Message ${opponentUsername}...`}
              className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              disabled={sending}
              maxLength={500}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && !sending && message.trim()) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!message.trim() || sending}
              className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap"
            >
              {sending ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}