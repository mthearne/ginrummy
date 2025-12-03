import { useState, useEffect } from 'react';
import { FriendsService, Friend, FriendRequest } from '../services/friends';
import { useSocket } from '../services/socket';

interface FriendManagerProps {
  onStartChat?: (friendId: string) => void;
}

export function FriendManager({ onStartChat }: FriendManagerProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'friends' | 'requests'>('friends');
  const [searchUsername, setSearchUsername] = useState('');
  const [searching, setSearching] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const socket = useSocket();

  useEffect(() => {
    loadFriends(true);
  }, []);

  // Periodic refresh for friend-related updates (since Socket.IO events are no longer available)
  useEffect(() => {
    if (!socket.isConnected()) return;

    // Poll for friend updates every 15 seconds
    const pollInterval = setInterval(() => {
      loadFriends();
    }, 15000);

    return () => {
      clearInterval(pollInterval);
    };
  }, [socket.isConnected()]);

  const loadFriends = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      const data = await FriendsService.getFriends();
      setFriends(data.friends || []);
      setSentRequests(data.sentRequests || []);
      setReceivedRequests(data.receivedRequests || []);
    } catch (error) {
      // Ensure arrays remain defined even on error
      setFriends([]);
      setSentRequests([]);
      setReceivedRequests([]);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
    }
  };

  const sendFriendRequest = async () => {
    if (!searchUsername.trim()) return;
    
    try {
      setSearching(true);
      await FriendsService.sendFriendRequest(searchUsername.trim());
      setSearchUsername('');
      await loadFriends(); // Refresh to show sent request
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to send friend request');
    } finally {
      setSearching(false);
    }
  };

  const acceptFriendRequest = async (friendshipId: string) => {
    try {
      setActionLoading(friendshipId);
      await FriendsService.acceptFriendRequest(friendshipId);
      await loadFriends();
    } catch (error) {
    } finally {
      setActionLoading(null);
    }
  };

  const declineFriendRequest = async (friendshipId: string) => {
    try {
      setActionLoading(friendshipId);
      await FriendsService.declineFriendRequest(friendshipId);
      await loadFriends();
    } catch (error) {
    } finally {
      setActionLoading(null);
    }
  };

  const removeFriend = async (friendshipId: string) => {
    if (!confirm('Are you sure you want to remove this friend?')) return;
    
    try {
      setActionLoading(friendshipId);
      await FriendsService.removeFriend(friendshipId);
      await loadFriends();
    } catch (error) {
    } finally {
      setActionLoading(null);
    }
  };

  const tabs = [
    { id: 'friends', label: 'Friends', count: friends.length },
    { id: 'requests', label: 'Requests', count: receivedRequests.length },
    { id: 'search', label: 'Add Friends', count: null },
  ] as const;

  return (
    <div className="card">
      <div className="card-body">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Friends</h2>
          {refreshing && (
            <div className="flex items-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 mr-2"></div>
              Refreshing...
            </div>
          )}
        </div>
        
        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-100 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="ml-1 text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="loading mx-auto mb-4" />
            <p className="text-gray-500">Loading...</p>
          </div>
        ) : (
          <>
            {/* Search Tab */}
            {activeTab === 'search' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Find users by username
                  </label>
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={searchUsername}
                      onChange={(e) => setSearchUsername(e.target.value)}
                      placeholder="Enter username..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      onKeyPress={(e) => e.key === 'Enter' && sendFriendRequest()}
                    />
                    <button
                      onClick={sendFriendRequest}
                      disabled={searching || !searchUsername.trim()}
                      className="btn btn-primary"
                    >
                      {searching ? 'Sending...' : 'Send Request'}
                    </button>
                  </div>
                </div>

                {sentRequests.length > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-900 mb-2">Pending Sent Requests</h3>
                    <div className="space-y-2">
                      {sentRequests.map((request) => (
                        <div key={request.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <div className="font-medium">{request.user.username}</div>
                            <div className="text-sm text-gray-500">
                              ELO: {request.user.elo} • {request.user.gamesPlayed} games
                            </div>
                          </div>
                          <span className="text-sm text-yellow-600 font-medium">Pending</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Friends Tab */}
            {activeTab === 'friends' && (
              <div className="space-y-4">
                {friends.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-4">
                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <p className="text-gray-500 mb-2">You don't have any friends yet</p>
                    <button
                      onClick={() => setActiveTab('search')}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Add some friends to get started!
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {friends.map((friend) => (
                      <div key={friend.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-3">
                          {/* Online status indicator */}
                          <div 
                            className={`w-3 h-3 rounded-full ${friend.user.isOnline ? 'bg-green-400' : 'bg-gray-400'}`}
                            title={friend.user.isOnline ? 'Online' : 'Offline'}
                          ></div>
                          <div>
                            <div className="font-medium">{friend.user.username}</div>
                            <div className="text-sm text-gray-500">
                              ELO: {friend.user.elo} • {friend.user.gamesPlayed} games
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => onStartChat?.(friend.user.id)}
                            className="btn btn-primary btn-sm"
                          >
                            Chat
                          </button>
                          <button
                            onClick={() => removeFriend(friend.id)}
                            disabled={actionLoading === friend.id}
                            className="text-red-600 hover:text-red-800 text-sm font-medium px-2"
                          >
                            {actionLoading === friend.id ? 'Removing...' : 'Remove'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Requests Tab */}
            {activeTab === 'requests' && (
              <div className="space-y-4">
                {receivedRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="text-gray-400 mb-4">
                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-500">No pending friend requests</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {receivedRequests.map((request) => (
                      <div key={request.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg bg-blue-50">
                        <div>
                          <div className="font-medium">{request.user.username}</div>
                          <div className="text-sm text-gray-500">
                            ELO: {request.user.elo} • {request.user.gamesPlayed} games
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => acceptFriendRequest(request.id)}
                            disabled={actionLoading === request.id}
                            className="btn btn-primary btn-sm"
                          >
                            {actionLoading === request.id ? 'Processing...' : 'Accept'}
                          </button>
                          <button
                            onClick={() => declineFriendRequest(request.id)}
                            disabled={actionLoading === request.id}
                            className="btn btn-secondary btn-sm"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}