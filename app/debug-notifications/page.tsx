'use client';
import { useState, useEffect } from 'react';
import { api } from '../../src/services/api';

export default function DebugNotifications() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDebugData = async () => {
      try {
        const response = await api.get('/debug-notifications');
        setData(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to fetch debug data');
      } finally {
        setLoading(false);
      }
    };

    fetchDebugData();
  }, []);

  const refreshData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get('/debug-notifications');
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch debug data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">🔧 Debug Notifications</h1>
        <div className="loading mx-auto" style={{ width: '32px', height: '32px' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">🔧 Debug Notifications</h1>
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <strong>Error:</strong> {error}
        </div>
        <button
          onClick={refreshData}
          className="mt-4 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">🔧 Debug Notifications</h1>
        <button
          onClick={refreshData}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 text-sm"
        >
          🔄 Refresh
        </button>
      </div>

      <div className="space-y-6">
        {/* Current User */}
        <div className="bg-blue-50 p-4 rounded-lg">
          <h2 className="font-semibold text-blue-900 mb-2">Current User</h2>
          <p className="text-blue-800 font-mono">{data.currentUser}</p>
        </div>

        {/* User Notifications */}
        <div className="bg-green-50 p-4 rounded-lg">
          <h2 className="font-semibold text-green-900 mb-3">Your Notifications ({data.userNotifications?.length || 0})</h2>
          {data.userNotifications && data.userNotifications.length > 0 ? (
            <div className="space-y-2">
              {data.userNotifications.map((notification: any) => (
                <div key={notification.id} className="bg-white p-3 rounded border">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{notification.type}</span>
                      {!notification.read && <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">NEW</span>}
                    </div>
                    <span className="text-xs text-gray-500">{new Date(notification.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1">
                    <div className="font-medium text-sm">{notification.title}</div>
                    <div className="text-sm text-gray-600">{notification.message}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-green-700">No notifications found for your account.</p>
          )}
        </div>

        {/* Recent Notifications (All Users) */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <h2 className="font-semibold text-gray-900 mb-3">Recent Notifications (All Users) ({data.recentNotifications?.length || 0})</h2>
          {data.recentNotifications && data.recentNotifications.length > 0 ? (
            <div className="space-y-2">
              {data.recentNotifications.map((notification: any) => (
                <div key={notification.id} className="bg-white p-3 rounded border">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{notification.username}</span>
                      <span className="ml-2 text-sm bg-gray-200 px-2 py-1 rounded">{notification.type}</span>
                      {!notification.read && <span className="ml-2 text-xs bg-blue-500 text-white px-2 py-1 rounded">NEW</span>}
                    </div>
                    <span className="text-xs text-gray-500">{new Date(notification.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1">
                    <div className="font-medium text-sm">{notification.title}</div>
                    <div className="text-sm text-gray-600">{notification.message}</div>
                  </div>
                  {notification.data && (
                    <div className="mt-2 text-xs bg-gray-100 p-2 rounded">
                      <strong>Data:</strong> {JSON.stringify(notification.data)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-700">No recent notifications found.</p>
          )}
        </div>
      </div>
    </div>
  );
}