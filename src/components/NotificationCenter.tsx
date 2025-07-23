import { useState } from 'react';
import { useNotifications } from '../hooks/useNotifications';
import { Notification } from '../services/notifications';

export function NotificationCenter() {
  const { notifications, unreadCount, isConnected, markAsRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Handle navigation based on notification type
    switch (notification.type) {
      case 'GAME_INVITATION':
        if (notification.data?.gameId) {
          window.location.href = `/game/${notification.data.gameId}`;
        }
        break;
      case 'INVITATION_RESPONSE':
        if (notification.data?.gameId && notification.data?.response === 'accepted') {
          window.location.href = `/game/${notification.data.gameId}`;
        }
        break;
      case 'FRIEND_REQUEST':
      case 'FRIEND_REQUEST_ACCEPTED':
        // Navigate to lobby/friends section
        const currentPath = window.location.pathname;
        if (currentPath !== '/lobby') {
          window.location.href = '/lobby';
        }
        break;
    }

    setIsOpen(false);
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'GAME_INVITATION':
        return '🎮';
      case 'INVITATION_RESPONSE':
        return '✅';
      case 'FRIEND_REQUEST':
        return '👥';
      case 'FRIEND_REQUEST_ACCEPTED':
        return '🎉';
      case 'GAME_STARTED':
        return '▶️';
      case 'GAME_ENDED':
        return '🏁';
      default:
        return '📬';
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative">
      {/* Notification Bell */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
        title="Notifications"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-5-5V9.09C15 6.34 12.66 4 9.91 4S4.82 6.34 4.82 9.09V12l-5 5h5m10 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}

        {/* Connection Status Indicator */}
        <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-400'}`} title={isConnected ? 'Connected' : 'Disconnected'} />
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="flex items-center mt-1 text-sm text-gray-500">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-gray-400'} mr-2`} />
              {isConnected ? 'Live notifications' : 'Disconnected'}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <div className="text-4xl mb-2">📬</div>
                <p>No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${!notification.read ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''}`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="text-2xl">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {formatTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 bg-gray-50">
              <button className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}