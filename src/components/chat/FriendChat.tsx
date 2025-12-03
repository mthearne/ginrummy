import React, { useState, useEffect, useRef } from 'react';
import { ChatService, ChatMessage, ChatConversation } from '../../services/chat';
import { Friend } from '../../services/friends';
import { useAuthStore } from '../../store/auth';

interface FriendChatProps {
  friends: Friend[];
  initialSelectedUserId?: string;
  onUnreadCountChange?: () => void;
}

export function FriendChat({ friends, initialSelectedUserId, onUnreadCountChange }: FriendChatProps) {
  const { user } = useAuthStore();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatMinimized, setChatMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    
    // Refresh conversations every 30 seconds for new messages
    const interval = setInterval(loadConversations, 30000);
    return () => clearInterval(interval);
  }, []);

  // Handle initial selection from notification link
  useEffect(() => {
    if (initialSelectedUserId && friends.length > 0) {
      const friendExists = friends.some(friend => friend.user.id === initialSelectedUserId);
      if (friendExists) {
        setSelectedFriend(initialSelectedUserId);
        markAsRead(initialSelectedUserId);
      }
    }
  }, [initialSelectedUserId, friends]);

  useEffect(() => {
    scrollToBottom();
  }, [conversations, selectedFriend]);

  const loadConversations = async () => {
    try {
      const data = await ChatService.getConversations();
      setConversations(data.conversations);
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!message.trim() || !selectedFriend || sending) return;
    
    try {
      setSending(true);
      const newMessage = await ChatService.sendMessage(selectedFriend, message.trim());
      
      // Update conversations with new message
      setConversations(prev => prev.map(conv => {
        if (conv.friendId === selectedFriend) {
          return {
            ...conv,
            messages: [...conv.messages, newMessage],
            lastMessage: newMessage
          };
        }
        return conv;
      }));
      
      setMessage('');
    } catch (error) {
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const markAsRead = async (friendId: string) => {
    try {
      await ChatService.markAsRead(friendId);
      
      // Optimistically update the UI immediately
      setConversations(prev => prev.map(conv => 
        conv.friendId === friendId ? { ...conv, unreadCount: 0 } : conv
      ));
      
      // Also refresh the conversations from server to ensure consistency
      await loadConversations();
      
      // Notify parent component about unread count change
      if (onUnreadCountChange) {
        onUnreadCountChange();
      }
    } catch (error) {
    }
  };

  const selectFriend = (friendId: string) => {
    setSelectedFriend(friendId);
    markAsRead(friendId);
    // Show chat when selecting a friend
    setChatMinimized(false);
  };

  const selectedConversation = conversations.find(conv => conv.friendId === selectedFriend);
  const totalUnreadCount = conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);

  if (friends.length === 0) {
    return (
      <div className="card">
        <div className="card-body">
          <h2 className="text-xl font-semibold mb-4">Chat</h2>
          <div className="text-center py-8">
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.435l-3.53 1.176a.866.866 0 01-1.096-1.096l1.176-3.53A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
              </svg>
            </div>
            <p className="text-gray-500">Add some friends to start chatting!</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{minHeight: '70vh'}}>
      <div className="card-body">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">
            Chat
            {totalUnreadCount > 0 && (
              <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                {totalUnreadCount}
              </span>
            )}
          </h2>
          {selectedFriend && (
            <button
              onClick={() => {
                setChatMinimized(!chatMinimized);
              }}
              className="btn btn-secondary btn-sm"
              title={chatMinimized ? "Show chat" : "Minimize chat"}
            >
              {chatMinimized ? 'Show Chat' : 'Minimize'}
            </button>
          )}
        </div>

        <div className="flex" style={{height: 'calc(70vh - 120px)'}}>
          {/* Friends List */}
          <div className={`${chatMinimized ? 'w-full' : 'w-2/5'} border-r border-gray-200 overflow-y-auto pr-4 transition-all duration-300`}>
            {loading ? (
              <div className="text-center py-8">
                <div className="loading mx-auto mb-4" />
                <p className="text-gray-500">Loading...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {friends.map((friend) => {
                  const conversation = conversations.find(conv => conv.friendId === friend.user.id);
                  const isSelected = selectedFriend === friend.user.id;
                  
                  return (
                    <button
                      key={friend.user.id}
                      onClick={() => selectFriend(friend.user.id)}
                      className={`relative w-full text-left p-3 rounded-lg transition-colors ${
                        isSelected ? 'bg-blue-50 border-2 border-blue-200' : 'border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {/* Green unread indicator bar */}
                      {conversation && conversation.unreadCount > 0 && !isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500 rounded-l-lg"></div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <div className="font-medium text-sm truncate">{friend.user.username}</div>
                            <div className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0"></div>
                          </div>
                          {conversation?.lastMessage && (
                            <div className="text-xs text-gray-500 truncate">
                              {conversation.lastMessage.senderId === user?.id ? 'You: ' : ''}
                              {conversation.lastMessage.message}
                            </div>
                          )}
                        </div>
                        {conversation && conversation.unreadCount > 0 && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full ml-2 flex-shrink-0">
                            {conversation.unreadCount}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Chat Area */}
          <div className={`${chatMinimized ? 'hidden' : 'flex-1'} flex flex-col pl-4 transition-all duration-300`}>
            {selectedFriend ? (
              <>
                {/* Chat Header */}
                <div className="pb-4 mb-4 border-b border-gray-200">
                  <div className="flex items-center space-x-2">
                    <div className="font-medium text-gray-900">
                      {friends.find(f => f.user.id === selectedFriend)?.user.username}
                    </div>
                    <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span className="text-sm text-gray-500">Online</span>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto space-y-3 mb-4">
                  {selectedConversation?.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-3 py-2 rounded-lg text-sm ${
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
                  )) || []}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message Input */}
                <div className="border-t border-gray-200 pt-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendMessage();
                    }}
                    className="flex space-x-2"
                  >
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={`Message ${friends.find(f => f.user.id === selectedFriend)?.user.username}...`}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      disabled={sending}
                      maxLength={500}
                    />
                    <button
                      type="submit"
                      disabled={!message.trim() || sending}
                      className="btn btn-primary btn-sm px-4"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.435l-3.53 1.176a.866.866 0 01-1.096-1.096l1.176-3.53A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
                  </svg>
                  <p>Select a friend to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}