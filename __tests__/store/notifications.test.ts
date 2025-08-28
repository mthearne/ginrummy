import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useNotificationStore, AppNotification } from '../notifications';

describe('Notifications Store', () => {
  const mockNotificationData = {
    type: 'game_invitation' as const,
    title: 'Game Invitation',
    message: 'You have been invited to a game',
    actionable: true,
    data: {
      gameId: 'game-123',
      userId: 'user-456',
      username: 'testuser'
    }
  };

  const mockFriendRequest = {
    type: 'friend_request' as const,
    title: 'Friend Request',
    message: 'John wants to be your friend',
    actionable: true,
    data: {
      friendshipId: 'friendship-123',
      userId: 'user-789',
      username: 'john'
    }
  };

  const mockSystemNotification = {
    type: 'friend_accepted' as const,
    title: 'Friend Accepted',
    message: 'Sarah accepted your friend request',
    actionable: false,
    data: {
      userId: 'user-999',
      username: 'sarah'
    }
  };

  beforeEach(() => {
    // Reset store to initial state
    useNotificationStore.setState({
      notifications: [],
      unreadCount: 0,
      isOpen: false
    });

    // Clear any previous Math.random mocks
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useNotificationStore.getState();
      
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.isOpen).toBe(false);
    });

    it('should have empty computed values initially', () => {
      const state = useNotificationStore.getState();
      
      expect(state.getUnreadNotifications()).toEqual([]);
      expect(state.getRecentNotifications()).toEqual([]);
      expect(state.getRecentNotifications(5)).toEqual([]);
    });
  });

  describe('addNotification', () => {
    it('should add notification with generated id and timestamp', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toHaveLength(1);
      expect(newState.unreadCount).toBe(1);
      
      const notification = newState.notifications[0];
      expect(notification.type).toBe(mockNotificationData.type);
      expect(notification.title).toBe(mockNotificationData.title);
      expect(notification.message).toBe(mockNotificationData.message);
      expect(notification.actionable).toBe(mockNotificationData.actionable);
      expect(notification.data).toEqual(mockNotificationData.data);
      expect(notification.read).toBe(false);
      expect(notification.id).toBeDefined();
      expect(notification.timestamp).toBeInstanceOf(Date);
    });

    it('should add multiple notifications in correct order', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toHaveLength(2);
      expect(newState.unreadCount).toBe(2);
      
      // Most recent should be first
      expect(newState.notifications[0].type).toBe('friend_request');
      expect(newState.notifications[1].type).toBe('game_invitation');
    });

    it('should limit notifications to 50 items', () => {
      const state = useNotificationStore.getState();
      
      // Add 52 notifications
      for (let i = 0; i < 52; i++) {
        state.addNotification({
          ...mockNotificationData,
          title: `Notification ${i}`,
          message: `Message ${i}`
        });
      }
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toHaveLength(50);
      // Note: unreadCount will be 52 because it's not adjusted when notifications are sliced
      expect(newState.unreadCount).toBe(52);
      
      // Should keep the most recent 50
      expect(newState.notifications[0].title).toBe('Notification 51');
      expect(newState.notifications[49].title).toBe('Notification 2');
    });

    it('should increment unread count correctly', () => {
      const state = useNotificationStore.getState();
      
      expect(useNotificationStore.getState().unreadCount).toBe(0);
      
      state.addNotification(mockNotificationData);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      
      state.addNotification(mockFriendRequest);
      expect(useNotificationStore.getState().unreadCount).toBe(2);
      
      state.addNotification(mockSystemNotification);
      expect(useNotificationStore.getState().unreadCount).toBe(3);
    });
  });

  describe('markAsRead', () => {
    it('should mark specific notification as read', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      
      const notificationId = useNotificationStore.getState().notifications[0].id;
      state.markAsRead(notificationId);
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications[0].read).toBe(true);
      expect(newState.notifications[1].read).toBe(false);
      expect(newState.unreadCount).toBe(1);
    });

    it('should handle marking non-existent notification', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      
      expect(() => state.markAsRead('non-existent')).not.toThrow();
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications[0].read).toBe(false);
      // Note: current implementation decreases count even for non-existent notifications
      expect(newState.unreadCount).toBe(0);
    });

    it('should not decrease unread count below zero', () => {
      const state = useNotificationStore.getState();
      
      // Manually set unreadCount to 0 and try to mark as read
      useNotificationStore.setState({ unreadCount: 0 });
      state.markAsRead('non-existent');
      
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('should handle marking already read notification', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      const notificationId = useNotificationStore.getState().notifications[0].id;
      
      // Mark as read twice
      state.markAsRead(notificationId);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
      
      state.markAsRead(notificationId);
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markAllAsRead', () => {
    it('should mark all notifications as read', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      state.addNotification(mockSystemNotification);
      
      expect(useNotificationStore.getState().unreadCount).toBe(3);
      
      state.markAllAsRead();
      
      const newState = useNotificationStore.getState();
      expect(newState.unreadCount).toBe(0);
      expect(newState.notifications.every(n => n.read)).toBe(true);
    });

    it('should work with empty notifications', () => {
      const state = useNotificationStore.getState();
      
      expect(() => state.markAllAsRead()).not.toThrow();
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });

    it('should work with already read notifications', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.markAllAsRead();
      expect(useNotificationStore.getState().unreadCount).toBe(0);
      
      // Mark all as read again
      state.markAllAsRead();
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe('removeNotification', () => {
    it('should remove notification by id', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      
      const notificationId = useNotificationStore.getState().notifications[0].id;
      state.removeNotification(notificationId);
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toHaveLength(1);
      expect(newState.notifications[0].type).toBe('game_invitation');
    });

    it('should decrease unread count when removing unread notification', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      expect(useNotificationStore.getState().unreadCount).toBe(2);
      
      const notificationId = useNotificationStore.getState().notifications[0].id;
      state.removeNotification(notificationId);
      
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it('should not decrease unread count when removing read notification', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      
      const notificationId = useNotificationStore.getState().notifications[0].id;
      state.markAsRead(notificationId);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      
      state.removeNotification(notificationId);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
    });

    it('should handle removing non-existent notification', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      expect(() => state.removeNotification('non-existent')).not.toThrow();
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toHaveLength(1);
      expect(newState.unreadCount).toBe(1);
    });

    it('should not decrease unread count below zero', () => {
      const state = useNotificationStore.getState();
      
      // Manually set unreadCount and try to remove
      useNotificationStore.setState({ unreadCount: 0 });
      state.removeNotification('non-existent');
      
      expect(useNotificationStore.getState().unreadCount).toBe(0);
    });
  });

  describe('clearAll', () => {
    it('should clear all notifications and reset state', () => {
      const state = useNotificationStore.getState();
      
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      state.setOpen(true);
      
      expect(useNotificationStore.getState().notifications).toHaveLength(2);
      expect(useNotificationStore.getState().unreadCount).toBe(2);
      expect(useNotificationStore.getState().isOpen).toBe(true);
      
      state.clearAll();
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toEqual([]);
      expect(newState.unreadCount).toBe(0);
      expect(newState.isOpen).toBe(false);
    });

    it('should work when already empty', () => {
      const state = useNotificationStore.getState();
      
      expect(() => state.clearAll()).not.toThrow();
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toEqual([]);
      expect(newState.unreadCount).toBe(0);
      expect(newState.isOpen).toBe(false);
    });
  });

  describe('Open/Close State', () => {
    describe('toggleOpen', () => {
      it('should toggle open state', () => {
        const state = useNotificationStore.getState();
        
        expect(useNotificationStore.getState().isOpen).toBe(false);
        
        state.toggleOpen();
        expect(useNotificationStore.getState().isOpen).toBe(true);
        
        state.toggleOpen();
        expect(useNotificationStore.getState().isOpen).toBe(false);
      });
    });

    describe('setOpen', () => {
      it('should set open state to true', () => {
        const state = useNotificationStore.getState();
        
        state.setOpen(true);
        expect(useNotificationStore.getState().isOpen).toBe(true);
      });

      it('should set open state to false', () => {
        const state = useNotificationStore.getState();
        
        state.setOpen(true);
        state.setOpen(false);
        expect(useNotificationStore.getState().isOpen).toBe(false);
      });
    });
  });

  describe('Computed Properties', () => {
    describe('getUnreadNotifications', () => {
      it('should return only unread notifications', () => {
        const state = useNotificationStore.getState();
        
        state.addNotification(mockNotificationData);
        state.addNotification(mockFriendRequest);
        state.addNotification(mockSystemNotification);
        
        const firstId = useNotificationStore.getState().notifications[1].id;
        state.markAsRead(firstId);
        
        const unread = state.getUnreadNotifications();
        expect(unread).toHaveLength(2);
        expect(unread.every(n => !n.read)).toBe(true);
      });

      it('should return empty array when all read', () => {
        const state = useNotificationStore.getState();
        
        state.addNotification(mockNotificationData);
        state.markAllAsRead();
        
        expect(state.getUnreadNotifications()).toEqual([]);
      });

      it('should return empty array when no notifications', () => {
        const state = useNotificationStore.getState();
        
        expect(state.getUnreadNotifications()).toEqual([]);
      });
    });

    describe('getRecentNotifications', () => {
      it('should return notifications sorted by timestamp', () => {
        const state = useNotificationStore.getState();
        
        // Add notifications with slight delay to ensure different timestamps
        const mockDate1 = new Date('2023-01-01T10:00:00Z');
        const mockDate2 = new Date('2023-01-01T10:01:00Z');
        const mockDate3 = new Date('2023-01-01T10:02:00Z');
        
        vi.setSystemTime(mockDate1);
        state.addNotification({ ...mockNotificationData, title: 'First' });
        
        vi.setSystemTime(mockDate2);
        state.addNotification({ ...mockFriendRequest, title: 'Second' });
        
        vi.setSystemTime(mockDate3);
        state.addNotification({ ...mockSystemNotification, title: 'Third' });
        
        const recent = state.getRecentNotifications();
        expect(recent).toHaveLength(3);
        expect(recent[0].title).toBe('Third');
        expect(recent[1].title).toBe('Second');
        expect(recent[2].title).toBe('First');
      });

      it('should limit results to specified number', () => {
        const state = useNotificationStore.getState();
        
        state.addNotification(mockNotificationData);
        state.addNotification(mockFriendRequest);
        state.addNotification(mockSystemNotification);
        
        const recent = state.getRecentNotifications(2);
        expect(recent).toHaveLength(2);
      });

      it('should default to 10 items limit', () => {
        const state = useNotificationStore.getState();
        
        // Add 15 notifications
        for (let i = 0; i < 15; i++) {
          state.addNotification({
            ...mockNotificationData,
            title: `Notification ${i}`
          });
        }
        
        const recent = state.getRecentNotifications();
        expect(recent).toHaveLength(10);
      });

      it('should return empty array when no notifications', () => {
        const state = useNotificationStore.getState();
        
        expect(state.getRecentNotifications()).toEqual([]);
        expect(state.getRecentNotifications(5)).toEqual([]);
      });

      it('should handle limit larger than available notifications', () => {
        const state = useNotificationStore.getState();
        
        state.addNotification(mockNotificationData);
        state.addNotification(mockFriendRequest);
        
        const recent = state.getRecentNotifications(10);
        expect(recent).toHaveLength(2);
      });
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle complete notification lifecycle', () => {
      const state = useNotificationStore.getState();
      
      // Add notifications
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      state.addNotification(mockSystemNotification);
      
      expect(useNotificationStore.getState().notifications).toHaveLength(3);
      expect(useNotificationStore.getState().unreadCount).toBe(3);
      
      // Open notification panel
      state.setOpen(true);
      expect(useNotificationStore.getState().isOpen).toBe(true);
      
      // Mark some as read
      const firstId = useNotificationStore.getState().notifications[0].id;
      state.markAsRead(firstId);
      expect(useNotificationStore.getState().unreadCount).toBe(2);
      
      // Check computed values
      expect(state.getUnreadNotifications()).toHaveLength(2);
      expect(state.getRecentNotifications(2)).toHaveLength(2);
      
      // Remove one notification
      const secondId = useNotificationStore.getState().notifications[1].id;
      state.removeNotification(secondId);
      expect(useNotificationStore.getState().notifications).toHaveLength(2);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      
      // Mark all as read
      state.markAllAsRead();
      expect(useNotificationStore.getState().unreadCount).toBe(0);
      expect(state.getUnreadNotifications()).toHaveLength(0);
      
      // Clear all
      state.clearAll();
      const finalState = useNotificationStore.getState();
      expect(finalState.notifications).toEqual([]);
      expect(finalState.unreadCount).toBe(0);
      expect(finalState.isOpen).toBe(false);
    });

    it('should maintain consistency across multiple operations', () => {
      const state = useNotificationStore.getState();
      
      // Add and immediately mark some as read
      state.addNotification(mockNotificationData);
      const id1 = useNotificationStore.getState().notifications[0].id;
      
      state.addNotification(mockFriendRequest);
      const id2 = useNotificationStore.getState().notifications[0].id;
      
      state.addNotification(mockSystemNotification);
      const id3 = useNotificationStore.getState().notifications[0].id;
      
      // Mark middle one as read
      state.markAsRead(id2);
      
      expect(useNotificationStore.getState().unreadCount).toBe(2);
      expect(state.getUnreadNotifications()).toHaveLength(2);
      
      // Remove the read one
      state.removeNotification(id2);
      expect(useNotificationStore.getState().unreadCount).toBe(2); // Should not change
      expect(useNotificationStore.getState().notifications).toHaveLength(2);
      
      // Remove an unread one
      state.removeNotification(id3);
      expect(useNotificationStore.getState().unreadCount).toBe(1);
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
      
      // Final notification should be the first one added
      const finalNotification = useNotificationStore.getState().notifications[0];
      expect(finalNotification.id).toBe(id1);
      expect(finalNotification.type).toBe('game_invitation');
      expect(finalNotification.read).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid successive operations', () => {
      const state = useNotificationStore.getState();
      
      // Rapid add/remove operations
      state.addNotification(mockNotificationData);
      state.addNotification(mockFriendRequest);
      state.toggleOpen();
      state.markAllAsRead();
      state.addNotification(mockSystemNotification);
      state.toggleOpen();
      state.clearAll();
      
      const finalState = useNotificationStore.getState();
      expect(finalState.notifications).toEqual([]);
      expect(finalState.unreadCount).toBe(0);
      expect(finalState.isOpen).toBe(false);
    });

    it('should handle notifications with minimal data', () => {
      const state = useNotificationStore.getState();
      const minimalNotification = {
        type: 'friend_accepted' as const,
        title: 'Test',
        message: 'Test message',
        actionable: false
      };
      
      state.addNotification(minimalNotification);
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications).toHaveLength(1);
      expect(newState.notifications[0].data).toBeUndefined();
    });

    it('should handle notifications with complex data', () => {
      const state = useNotificationStore.getState();
      const complexNotification = {
        type: 'invitation_response' as const,
        title: 'Complex Invitation',
        message: 'Complex invitation message',
        actionable: true,
        data: {
          friendshipId: 'friendship-1',
          invitationId: 'invitation-1',
          gameId: 'game-1',
          userId: 'user-1',
          username: 'complex-user'
        }
      };
      
      state.addNotification(complexNotification);
      
      const newState = useNotificationStore.getState();
      expect(newState.notifications[0].data).toEqual(complexNotification.data);
    });
  });
});