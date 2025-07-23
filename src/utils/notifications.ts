import { prisma } from './database';

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