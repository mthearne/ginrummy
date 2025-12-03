import { useState, useEffect, useCallback } from 'react';
import { notificationService, Notification, NotificationService } from '../services/notifications';

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Add new notification to list
  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => {
      // Avoid duplicates
      if (prev.find(n => n.id === notification.id)) {
        return prev;
      }
      return [notification, ...prev];
    });
    
    // Update unread count
    if (!notification.read) {
      setUnreadCount(prev => prev + 1);
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      await NotificationService.markAsRead(notificationId);
      
      setNotifications(prev => 
        prev.map(n => 
          n.id === notificationId ? { ...n, read: true } : n
        )
      );
      
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
    }
  }, []);

  // Clear all notifications
  const clearAll = useCallback(async () => {
    try {
      const result = await NotificationService.clearAll();
      
      setNotifications([]);
      setUnreadCount(0);
      
      return result;
    } catch (error) {
      throw error;
    }
  }, []);

  // Initialize notifications
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        // Request browser notification permission
        await NotificationService.requestNotificationPermission();
        
        // Get token and check if user is authenticated
        const token = localStorage.getItem('accessToken');
        
        if (!token) {
          return;
        }

        try {
          // Test if token is valid by trying to load notifications
          const existingNotifications = await NotificationService.getNotifications();
          setNotifications(existingNotifications);
          setUnreadCount(existingNotifications.filter(n => !n.read).length);
          
          // Token is valid, start notification polling
          notificationService.connect(token);
          setIsConnected(true);
        } catch (authError) {
          // Don't start notification polling if token is invalid
        }
      } catch (error) {
      }
    };

    initializeNotifications();

    // Add listener for new notifications
    const removeListener = notificationService.addListener(addNotification);

    // Cleanup on unmount
    return () => {
      removeListener();
      notificationService.disconnect();
      setIsConnected(false);
    };
  }, [addNotification]);

  // Reconnect when token changes
  useEffect(() => {
    const handleStorageChange = () => {
      const token = localStorage.getItem('accessToken');
      if (token && !isConnected) {
        notificationService.connect(token);
        setIsConnected(true);
      } else if (!token && isConnected) {
        notificationService.disconnect();
        setIsConnected(false);
        setNotifications([]);
        setUnreadCount(0);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [isConnected]);

  return {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    clearAll,
    addNotification
  };
}