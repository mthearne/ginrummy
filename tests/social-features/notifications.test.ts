import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/utils/database';
import { createNotification } from '../../src/utils/notifications';

describe('Notifications API Tests', () => {
  const API_BASE_URL = process.env.NEXTJS_URL || 'http://localhost:3003';
  
  let testUser1: any;
  let testUser2: any;
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.notification.deleteMany({
      where: {
        user: { username: { startsWith: 'notifytest_' } }
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'notifytest_' } }
    });

    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        username: 'notifytest_user1',
        email: 'notifytest1@test.com',
        password: 'hashedpassword1',
        elo: 1200,
        gamesPlayed: 5
      }
    });

    testUser2 = await prisma.user.create({
      data: {
        username: 'notifytest_user2',
        email: 'notifytest2@test.com',
        password: 'hashedpassword2',
        elo: 1350,
        gamesPlayed: 8
      }
    });

    // Generate tokens
    user1Token = generateAccessToken({ userId: testUser1.id, username: testUser1.username });
    user2Token = generateAccessToken({ userId: testUser2.id, username: testUser2.username });
  });

  beforeEach(async () => {
    // Clean up notifications between tests
    await prisma.notification.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id] }
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.notification.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id] }
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'notifytest_' } }
    });
  });

  describe('GET /api/notifications - Get User Notifications', () => {
    it('should return empty notifications for new user', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.notifications).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET'
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should reject invalid token', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid_token'
        }
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid or expired token');
    });

    it('should return user notifications correctly', async () => {
      // Create test notifications directly in database
      await prisma.notification.createMany({
        data: [
          {
            userId: testUser1.id,
            type: 'FRIEND_REQUEST',
            title: 'Friend Request',
            message: 'Someone wants to be your friend',
            data: JSON.stringify({ requesterId: testUser2.id }),
            read: false
          },
          {
            userId: testUser1.id,
            type: 'GAME_INVITATION',
            title: 'Game Invitation',
            message: 'You have been invited to a game',
            data: JSON.stringify({ gameId: 'test-game-id' }),
            read: false
          }
        ]
      });

      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.notifications).toHaveLength(2);
      expect(data.notifications[0].type).toBeOneOf(['FRIEND_REQUEST', 'GAME_INVITATION']);
      expect(data.notifications[0].read).toBe(false);
      expect(data.notifications[0].title).toBeDefined();
      expect(data.notifications[0].message).toBeDefined();
      expect(data.notifications[0].data).toBeDefined();
      expect(data.notifications[0].createdAt).toBeDefined();
    });

    it('should only return unread notifications', async () => {
      // Create both read and unread notifications
      await prisma.notification.createMany({
        data: [
          {
            userId: testUser1.id,
            type: 'FRIEND_REQUEST',
            title: 'Unread Notification',
            message: 'This is unread',
            data: JSON.stringify({}),
            read: false
          },
          {
            userId: testUser1.id,
            type: 'GAME_INVITATION',
            title: 'Read Notification',
            message: 'This is read',
            data: JSON.stringify({}),
            read: true
          }
        ]
      });

      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.notifications).toHaveLength(1);
      expect(data.notifications[0].title).toBe('Unread Notification');
      expect(data.notifications[0].read).toBe(false);
    });

    it('should not return other users notifications', async () => {
      // Create notification for user2
      await prisma.notification.create({
        data: {
          userId: testUser2.id,
          type: 'FRIEND_REQUEST',
          title: 'User2 Notification',
          message: 'This belongs to user2',
          data: JSON.stringify({}),
          read: false
        }
      });

      // Request with user1 token
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.notifications).toEqual([]);
    });
  });

  describe('PATCH /api/notifications - Mark Notification as Read', () => {
    let testNotification: any;

    beforeEach(async () => {
      // Create a test notification
      testNotification = await prisma.notification.create({
        data: {
          userId: testUser1.id,
          type: 'FRIEND_REQUEST',
          title: 'Test Notification',
          message: 'Test message',
          data: JSON.stringify({}),
          read: false
        }
      });
    });

    it('should mark notification as read successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId: testNotification.id
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Notification marked as read');

      // Verify in database
      const updatedNotification = await prisma.notification.findUnique({
        where: { id: testNotification.id }
      });
      expect(updatedNotification?.read).toBe(true);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId: testNotification.id
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should validate notification ID', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Notification ID is required');
    });

    it('should handle non-existent notification', async () => {
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId: 'non-existent-id'
        })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Notification not found');
    });

    it('should prevent marking other users notifications', async () => {
      // Create notification for user2
      const user2Notification = await prisma.notification.create({
        data: {
          userId: testUser2.id,
          type: 'FRIEND_REQUEST',
          title: 'User2 Notification',
          message: 'This belongs to user2',
          data: JSON.stringify({}),
          read: false
        }
      });

      // Try to mark user2's notification as read with user1 token
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId: user2Notification.id
        })
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('You cannot modify this notification');
    });
  });

  describe('Notification Creation and Management', () => {
    it('should create notifications using utility function', async () => {
      // Test the createNotification utility function
      const notificationData = {
        userId: testUser1.id,
        type: 'FRIEND_REQUEST' as const,
        title: 'New Friend Request',
        message: 'John wants to be your friend',
        data: {
          requesterId: testUser2.id,
          requesterName: 'John'
        }
      };

      await createNotification(notificationData);

      // Verify notification was created in database
      const notification = await prisma.notification.findFirst({
        where: {
          userId: testUser1.id,
          title: 'New Friend Request'
        }
      });

      expect(notification).toBeTruthy();
      expect(notification?.type).toBe('FRIEND_REQUEST');
      expect(notification?.message).toBe('John wants to be your friend');
      expect(notification?.read).toBe(false);
      expect(typeof notification?.data).toBe('object');
    });

    it('should handle notification expiration', async () => {
      // Create notification with expiration
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      
      await createNotification({
        userId: testUser1.id,
        type: 'GAME_INVITATION',
        title: 'Game Invitation',
        message: 'Join a game!',
        data: { gameId: 'test-game' },
        expiresAt
      });

      const notification = await prisma.notification.findFirst({
        where: {
          userId: testUser1.id,
          title: 'Game Invitation'
        }
      });

      expect(notification).toBeTruthy();
      expect(notification?.expiresAt).toBeTruthy();
      expect(notification?.expiresAt?.getTime()).toBeCloseTo(expiresAt.getTime(), -3); // Within 1 second
    });

    it('should handle different notification types', async () => {
      const notificationTypes = [
        {
          type: 'FRIEND_REQUEST' as const,
          title: 'Friend Request',
          message: 'Someone wants to be your friend'
        },
        {
          type: 'GAME_INVITATION' as const,
          title: 'Game Invitation',
          message: 'You have been invited to a game'
        },
        {
          type: 'GAME_UPDATE' as const,
          title: 'Game Update',
          message: 'Your game has been updated'
        }
      ];

      // Create notifications of different types
      for (const notif of notificationTypes) {
        await createNotification({
          userId: testUser1.id,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          data: {}
        });
      }

      // Verify all notifications were created
      const notifications = await prisma.notification.findMany({
        where: { userId: testUser1.id }
      });

      expect(notifications).toHaveLength(3);
      
      const types = notifications.map(n => n.type);
      expect(types).toContain('FRIEND_REQUEST');
      expect(types).toContain('GAME_INVITATION');
      expect(types).toContain('GAME_UPDATE');
    });
  });

  describe('Notification Workflow Integration', () => {
    it('should create notification when friend request is sent', async () => {
      // This would typically happen in the friend request endpoint
      // Here we simulate the notification creation
      await createNotification({
        userId: testUser2.id,
        type: 'FRIEND_REQUEST',
        title: 'Friend Request',
        message: `${testUser1.username} wants to be your friend`,
        data: {
          requesterId: testUser1.id,
          requesterUsername: testUser1.username
        }
      });

      // User2 should see the notification
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.notifications).toHaveLength(1);
      expect(data.notifications[0].type).toBe('FRIEND_REQUEST');
      expect(data.notifications[0].message).toContain(testUser1.username);
    });

    it('should create notification when game invitation is sent', async () => {
      // Simulate game invitation notification
      await createNotification({
        userId: testUser2.id,
        type: 'GAME_INVITATION',
        title: 'Game Invitation',
        message: `${testUser1.username} invited you to join a Gin Rummy game!`,
        data: {
          invitationId: 'test-invitation-id',
          gameId: 'test-game-id',
          senderUsername: testUser1.username,
          senderId: testUser1.id
        },
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });

      // User2 should see the notification
      const response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.notifications).toHaveLength(1);
      expect(data.notifications[0].type).toBe('GAME_INVITATION');
      expect(data.notifications[0].data.invitationId).toBe('test-invitation-id');
      expect(data.notifications[0].data.gameId).toBe('test-game-id');
    });

    it('should handle notification lifecycle correctly', async () => {
      // Create notification
      await createNotification({
        userId: testUser1.id,
        type: 'FRIEND_REQUEST',
        title: 'Test Notification',
        message: 'Test message',
        data: {}
      });

      // Get notifications (should show 1 unread)
      let response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      let data = await response.json();
      expect(data.notifications).toHaveLength(1);
      expect(data.notifications[0].read).toBe(false);
      
      const notificationId = data.notifications[0].id;

      // Mark as read
      const markReadResponse = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          notificationId: notificationId
        })
      });

      expect(markReadResponse.status).toBe(200);

      // Get notifications again (should show 0 unread since API only returns unread)
      response = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      data = await response.json();
      expect(data.notifications).toHaveLength(0); // No unread notifications
    });
  });
});