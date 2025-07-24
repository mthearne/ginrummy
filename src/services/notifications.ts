import { api } from './api';

export interface Notification {
  id: string;
  type: 'FRIEND_REQUEST' | 'FRIEND_REQUEST_ACCEPTED' | 'GAME_INVITATION' | 'INVITATION_RESPONSE' | 'GAME_STARTED' | 'GAME_ENDED';
  title: string;
  message: string;
  data?: any;
  createdAt: string;
  read: boolean;
}

export class NotificationService {
  private eventSource: EventSource | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private listeners: Array<(notification: Notification) => void> = [];

  // Start notification polling (SSE disabled for Vercel compatibility)
  connect(token: string) {
    console.log('🔔 [POLLING] Starting notification polling (SSE disabled for serverless compatibility)');
    
    // Note: SSE is disabled because it doesn't work reliably on serverless platforms like Vercel
    // We could implement polling instead, but for now we'll just log the connection attempt
    console.log('🔔 [POLLING] Notification polling would start here - currently disabled');
    
    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
  }

  // Disconnect notification service
  disconnect() {
    if (this.eventSource) {
      console.log('🔔 [POLLING] Disconnecting from notification service');
      this.eventSource.close();
      this.eventSource = null;
    }
    this.reconnectAttempts = 0;
  }

  // Handle incoming notifications
  private handleNotification(notification: Notification) {
    // Notify all listeners
    this.listeners.forEach(listener => {
      try {
        listener(notification);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });

    // Show browser notification if permission granted
    this.showBrowserNotification(notification);
  }

  // Show browser notification
  private async showBrowserNotification(notification: Notification) {
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const browserNotification = new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico', // You can customize this
          badge: '/favicon.ico',
          tag: notification.id, // Prevents duplicate notifications
        });

        // Auto-close after 5 seconds
        setTimeout(() => {
          browserNotification.close();
        }, 5000);

        // Handle notification click
        browserNotification.onclick = () => {
          window.focus();
          this.handleNotificationClick(notification);
          browserNotification.close();
        };
      } catch (error) {
        console.error('Failed to show browser notification:', error);
      }
    }
  }

  // Handle notification click
  private handleNotificationClick(notification: Notification) {
    switch (notification.type) {
      case 'GAME_INVITATION':
        if (notification.data?.gameId) {
          // Navigate to game page or show invitation modal
          window.location.href = `/game/${notification.data.gameId}`;
        }
        break;
      case 'INVITATION_RESPONSE':
        if (notification.data?.gameId) {
          window.location.href = `/game/${notification.data.gameId}`;
        }
        break;
      case 'FRIEND_REQUEST':
        // Navigate to friends page
        window.location.href = '/lobby';
        break;
      default:
        // Navigate to lobby as default
        window.location.href = '/lobby';
    }
  }

  // Handle connection errors (disabled for serverless compatibility)
  private handleConnectionError() {
    console.log('🔔 [POLLING] Connection error handling disabled for serverless compatibility');
    // Note: Reconnection logic disabled to prevent endless retry loops in serverless environments
  }

  // Add notification listener
  addListener(listener: (notification: Notification) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Request browser notification permission
  static async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    }

    return false;
  }

  // REST API methods
  static async getNotifications(): Promise<Notification[]> {
    const response = await api.get('/notifications');
    return response.data.notifications;
  }

  static async markAsRead(notificationId: string): Promise<void> {
    await api.patch('/notifications', { notificationId });
  }
}

// Create singleton instance
export const notificationService = new NotificationService();