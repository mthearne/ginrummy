// Simple notification system using browser notifications and visual toasts

export interface ToastNotification {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  duration?: number;
}

class NotificationService {
  private notifications: ToastNotification[] = [];
  private listeners: ((notifications: ToastNotification[]) => void)[] = [];

  // Request browser notification permission
  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  // Show browser notification
  showBrowserNotification(title: string, body: string, icon?: string): void {
    if (Notification.permission === 'granted') {
      new Notification(title, {
        body,
        icon: icon || '/favicon.ico',
      });
    }
  }

  // Show in-app toast notification
  showToast(notification: Omit<ToastNotification, 'id'>): void {
    const toast: ToastNotification = {
      ...notification,
      id: Math.random().toString(36).substring(2),
      duration: notification.duration || 5000,
    };

    this.notifications.push(toast);
    this.notifyListeners();

    // Auto-remove after duration
    setTimeout(() => {
      this.removeToast(toast.id);
    }, toast.duration);
  }

  removeToast(id: string): void {
    this.notifications = this.notifications.filter(n => n.id !== id);
    this.notifyListeners();
  }

  subscribe(listener: (notifications: ToastNotification[]) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.notifications]));
  }

  // Combined notification (browser + toast) - deprecated, use notification bell instead
  notify(title: string, message: string): void {
    // Only show browser notification now, the in-app notification bell handles the rest
    this.showBrowserNotification(title, message);
  }
}

export const notificationService = new NotificationService();

// Request permission on load
if (typeof window !== 'undefined') {
  notificationService.requestPermission();
}