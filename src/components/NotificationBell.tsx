'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotificationStore, AppNotification } from '../store/notifications';
import { FriendsService } from '../services/friends';
import { formatRelativeTime } from '../utils/helpers';

export function NotificationBell() {
  const router = useRouter();
  const {
    unreadCount,
    isOpen,
    markAsRead,
    markAllAsRead,
    removeNotification,
    toggleOpen,
    setOpen,
    getRecentNotifications
  } = useNotificationStore();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const recentNotifications = getRecentNotifications(10);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [setOpen]);

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
  };

  const handleAcceptFriendRequest = async (notification: AppNotification) => {
    if (!notification.data?.friendshipId) return;
    
    try {
      setActionLoading(notification.id);
      await FriendsService.acceptFriendRequest(notification.data.friendshipId);
      removeNotification(notification.id);
    } catch (error) {
      console.error('Failed to accept friend request:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineFriendRequest = async (notification: AppNotification) => {
    if (!notification.data?.friendshipId) return;
    
    try {
      setActionLoading(notification.id);
      await FriendsService.declineFriendRequest(notification.data.friendshipId);
      removeNotification(notification.id);
    } catch (error) {
      console.error('Failed to decline friend request:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptGameInvitation = async (notification: AppNotification) => {
    if (!notification.data?.invitationId) return;
    
    try {
      setActionLoading(notification.id);
      const result = await FriendsService.acceptInvitation(notification.data.invitationId);
      removeNotification(notification.id);
      // Navigate to the game
      router.push(`/game/${result.gameId}`);
    } catch (error) {
      console.error('Failed to accept game invitation:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineGameInvitation = async (notification: AppNotification) => {
    if (!notification.data?.invitationId) return;
    
    try {
      setActionLoading(notification.id);
      await FriendsService.declineInvitation(notification.data.invitationId);
      removeNotification(notification.id);
    } catch (error) {
      console.error('Failed to decline game invitation:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'friend_request':
        return '👤';
      case 'friend_accepted':
        return '✅';
      case 'game_invitation':
        return '🎮';
      case 'invitation_response':
        return '🎯';
      default:
        return '🔔';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={toggleOpen}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded-lg transition-colors"
        aria-label="Notifications"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {recentNotifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <svg className="w-8 h-8 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2 2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              <div className="py-2">
                {recentNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                      !notification.read ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="text-lg flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <p className="text-sm font-medium text-gray-900">
                            {notification.title}
                          </p>
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatRelativeTime(notification.timestamp.toISOString())}
                        </p>

                        {/* Action buttons for actionable notifications */}
                        {notification.actionable && (
                          <div className="flex space-x-2 mt-2">
                            {notification.type === 'friend_request' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcceptFriendRequest(notification);
                                  }}
                                  disabled={actionLoading === notification.id}
                                  className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50"
                                >
                                  Accept
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeclineFriendRequest(notification);
                                  }}
                                  disabled={actionLoading === notification.id}
                                  className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50"
                                >
                                  Decline
                                </button>
                              </>
                            )}
                            {notification.type === 'game_invitation' && (
                              <>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAcceptGameInvitation(notification);
                                  }}
                                  disabled={actionLoading === notification.id}
                                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                                >
                                  Join Game
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeclineGameInvitation(notification);
                                  }}
                                  disabled={actionLoading === notification.id}
                                  className="px-3 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700 disabled:opacity-50"
                                >
                                  Decline
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}