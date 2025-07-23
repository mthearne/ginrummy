import { prisma } from './database';

export interface ToastNotification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export interface NotificationData {
  userId: string;
  type: 'FRIEND_REQUEST' | 'FRIEND_REQUEST_ACCEPTED' | 'GAME_INVITATION' | 'INVITATION_RESPONSE' | 'GAME_STARTED' | 'GAME_ENDED';
  title: string;
  message: string;
  data?: any;
  expiresAt?: Date;
}

export async function createNotification(notificationData: NotificationData) {
  try {
    // Save notification to database
    const notification = await prisma.notification.create({
      data: {
        userId: notificationData.userId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || null,
        expiresAt: notificationData.expiresAt || null,
      }
    });

    // Send to active SSE connections
    await sendSSENotification(notificationData.userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      createdAt: notification.createdAt.toISOString(),
      read: notification.read
    });

    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
    throw error;
  }
}

async function sendSSENotification(userId: string, data: any) {
  try {
    // Use the global function set by the SSE route
    const sendNotificationToUser = (global as any).sendNotificationToUser;
    if (sendNotificationToUser) {
      sendNotificationToUser(userId, data);
    } else {
      console.warn('SSE notification function not available - SSE route may not be initialized');
    }
  } catch (error) {
    console.error('Failed to send SSE notification:', error);
  }
}

export async function getUnreadNotifications(userId: string) {
  return await prisma.notification.findMany({
    where: {
      userId,
      read: false,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });
}

export async function markNotificationAsRead(notificationId: string, userId: string) {
  return await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId // Ensure user can only mark their own notifications as read
    },
    data: { read: true }
  });
}

// Simple toast notification service for the ToastNotifications component
class ToastNotificationService {
  private listeners: Array<(notifications: ToastNotification[]) => void> = [];
  private toasts: ToastNotification[] = [];

  subscribe(callback: (notifications: ToastNotification[]) => void) {
    this.listeners.push(callback);
    callback(this.toasts); // Send current toasts immediately
    
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  addToast(toast: Omit<ToastNotification, 'id'>) {
    const newToast: ToastNotification = {
      ...toast,
      id: Math.random().toString(36).substr(2, 9)
    };
    
    this.toasts.push(newToast);
    this.notifyListeners();

    // Auto-remove after 5 seconds
    setTimeout(() => {
      this.removeToast(newToast.id);
    }, 5000);
  }

  removeToast(id: string) {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
    this.notifyListeners();
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.toasts]));
  }
}

export const notificationService = new ToastNotificationService();