import { api } from './api';

export interface Notification {
  id: string;
  type: 'FRIEND_REQUEST' | 'FRIEND_REQUEST_ACCEPTED' | 'GAME_INVITATION' | 'INVITATION_RESPONSE' | 'GAME_STARTED' | 'GAME_ENDED' | 'CHAT_MESSAGE' | 'PLAYER_JOINED' | 'TURN_NOTIFICATION' | 'OPPONENT_MOVE';
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
  private pollingInterval: NodeJS.Timeout | null = null;
  private lastNotificationCheck = new Date();
  private isPolling = false;
  private isDisabled = false; // Permanently disable after auth failure

  // Start notification polling (fallback for serverless compatibility)
  connect(token: string) {
    // EMERGENCY: Temporarily disable all notification polling to prevent 500 error spam
    console.log('🔔 [POLLING] Notification service temporarily disabled to prevent server overload');
    return;
    
    // Skip notification polling if disabled due to previous auth failure
    if (this.isDisabled) {
      console.log('🔔 [POLLING] Service disabled due to auth failure, skipping notification polling');
      return;
    }
    
    // Skip notification polling entirely if no valid token
    if (!token) {
      console.log('🔔 [POLLING] No token provided, skipping notification polling');
      return;
    }
    
    console.log('🔔 [POLLING] Starting notification polling');
    
    if (this.isPolling) {
      console.log('🔔 [POLLING] Already polling, skipping...');
      return;
    }
    
    this.isPolling = true;
    this.lastNotificationCheck = new Date();
    
    // Start polling every 5 seconds
    this.pollingInterval = setInterval(() => {
      this.pollForNotifications();
    }, 5000);
    
    // Initial poll
    this.pollForNotifications();
    
    // Reset reconnection state
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    
    console.log('🔔 [POLLING] Notification polling started');
  }

  private async pollForNotifications() {
    try {
      const notifications = await NotificationService.getNotifications();
      
      // Reset consecutive error count on success
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      
      // Filter for new notifications since last check
      const newNotifications = notifications.filter(n => 
        new Date(n.createdAt) > this.lastNotificationCheck
      );
      
      if (newNotifications.length > 0) {
        console.log(`🔔 [POLLING] Found ${newNotifications.length} new notifications`);
        
        // Process new notifications
        newNotifications.forEach(notification => {
          this.handleNotification(notification);
        });
        
        // Update last check time
        this.lastNotificationCheck = new Date();
      }
    } catch (error) {
      console.error('🔔 [POLLING] Error polling notifications:', error);
      
      // ALWAYS stop polling on ANY error to prevent spam and permanently disable
      console.warn('🔔 [POLLING] Permanently disabling notification service due to error');
      this.isDisabled = true;
      this.disconnect();
    }
  }

  // Disconnect notification service
  disconnect() {
    if (this.eventSource) {
      console.log('🔔 [POLLING] Disconnecting from notification service');
      this.eventSource.close();
      this.eventSource = null;
    }
    
    if (this.pollingInterval) {
      console.log('🔔 [POLLING] Stopping notification polling');
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    
    this.isPolling = false;
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
      case 'PLAYER_JOINED':
      case 'GAME_STARTED':
      case 'OPPONENT_MOVE':
      case 'TURN_NOTIFICATION':
        // Navigate to the game for PvP notifications
        if (notification.data?.gameId) {
          window.location.href = `/game/${notification.data.gameId}`;
        } else {
          window.location.href = '/lobby';
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