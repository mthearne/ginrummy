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

  // Start SSE connection
  connect(token: string) {
    if (this.eventSource) {
      this.disconnect();
    }

    console.log('🔔 [SSE] Connecting to SSE notification stream...');
    console.log('🔔 [SSE] Token present:', !!token);
    console.log('🔔 [SSE] SSE URL:', `/api/notifications/stream?token=${token ? '[REDACTED]' : 'MISSING'}`);
    
    try {
      // Create EventSource with token as query parameter (since EventSource doesn't support custom headers)
      this.eventSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);

      this.eventSource.onopen = () => {
        console.log('🔔 [SSE] Connection established successfully');
        this.reconnectAttempts = 0;
        this.reconnectDelay = 1000; // Reset delay on successful connection
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types
          if (data.type === 'connected') {
            console.log('🔔 [SSE] Connection confirmed:', data.message);
          } else if (data.type === 'ping') {
            // Keep-alive ping, no action needed
            console.log('🔔 [SSE] Keep-alive ping received');
          } else {
            // It's a notification
            console.log('🔔 [SSE] Received notification:', data);
            this.handleNotification(data);
          }
        } catch (error) {
          console.error('Failed to parse SSE message:', error, event.data);
        }
      };

      this.eventSource.onerror = (error) => {
        console.error('🔔 [SSE] Connection error:', error);
        console.error('🔔 [SSE] EventSource readyState:', this.eventSource?.readyState);
        this.handleConnectionError();
      };

    } catch (error) {
      console.error('🔔 [SSE] Failed to create SSE connection:', error);
      this.handleConnectionError();
    }
  }

  // Disconnect SSE
  disconnect() {
    if (this.eventSource) {
      console.log('Disconnecting from SSE stream');
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

  // Handle connection errors and reconnection
  private handleConnectionError() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms...`);
      
      setTimeout(() => {
        // Get token from localStorage or wherever it's stored
        const token = localStorage.getItem('accessToken');
        if (token) {
          this.connect(token);
        }
      }, this.reconnectDelay);

      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000); // Max 30 seconds
    } else {
      console.error('Max reconnection attempts reached. SSE connection failed.');
    }
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