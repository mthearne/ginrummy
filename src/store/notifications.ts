import { create } from 'zustand';

export interface AppNotification {
  id: string;
  type: 'friend_request' | 'friend_accepted' | 'game_invitation' | 'invitation_response';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionable: boolean;
  data?: {
    friendshipId?: string;
    invitationId?: string;
    gameId?: string;
    userId?: string;
    username?: string;
  };
}

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  isOpen: boolean;
  
  // Actions
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
  
  // Computed
  getUnreadNotifications: () => AppNotification[];
  getRecentNotifications: (limit?: number) => AppNotification[];
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,

  addNotification: (notificationData) => {
    const notification: AppNotification = {
      ...notificationData,
      id: Math.random().toString(36).substring(2),
      timestamp: new Date(),
      read: false,
    };

    set(state => ({
      notifications: [notification, ...state.notifications].slice(0, 50), // Keep last 50 notifications
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAsRead: (id) => {
    set(state => ({
      notifications: state.notifications.map(n => 
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllAsRead: () => {
    set(state => ({
      notifications: state.notifications.map(n => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  removeNotification: (id) => {
    set(state => {
      const notification = state.notifications.find(n => n.id === id);
      const wasUnread = notification && !notification.read;
      
      return {
        notifications: state.notifications.filter(n => n.id !== id),
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    });
  },

  clearAll: () => {
    set({
      notifications: [],
      unreadCount: 0,
      isOpen: false,
    });
  },

  toggleOpen: () => {
    set(state => ({ isOpen: !state.isOpen }));
  },

  setOpen: (isOpen) => {
    set({ isOpen });
  },

  getUnreadNotifications: () => {
    return get().notifications.filter(n => !n.read);
  },

  getRecentNotifications: (limit = 10) => {
    return get().notifications
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  },
}));