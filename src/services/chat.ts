import { api } from './api';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderUsername: string;
  receiverId: string;
  receiverUsername: string;
  message: string;
  sentAt: string;
  readAt?: string;
}

export interface ChatConversation {
  friendId: string;
  friendUsername: string;
  friendElo: number;
  lastMessage?: ChatMessage;
  unreadCount: number;
  messages: ChatMessage[];
}

export interface ChatResponse {
  conversations: ChatConversation[];
}

export class ChatService {
  static async getConversations(): Promise<ChatResponse> {
    const response = await api.get('/chat/conversations');
    return response.data;
  }

  static async getMessages(friendId: string, limit: number = 50, offset: number = 0): Promise<ChatMessage[]> {
    const response = await api.get(`/chat/messages/${friendId}`, {
      params: { limit, offset }
    });
    return response.data;
  }

  static async sendMessage(friendId: string, message: string): Promise<ChatMessage> {
    const response = await api.post('/chat/send', {
      receiverId: friendId,
      message
    });
    return response.data;
  }

  static async markAsRead(friendId: string): Promise<void> {
    await api.post(`/chat/read/${friendId}`);
  }
}