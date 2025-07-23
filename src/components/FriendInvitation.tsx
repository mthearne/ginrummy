import { useState, useEffect } from 'react';
import { FriendsService, Friend } from '../services/friends';
import { useSocket } from '../services/socket';

interface FriendInvitationProps {
  gameId: string;
}

export function FriendInvitation({ gameId }: FriendInvitationProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [invitationSent, setInvitationSent] = useState<string[]>([]);
  const socket = useSocket();

  useEffect(() => {
    loadFriends();
  }, []);

  // Listen for friend-related events and refresh friends list
  useEffect(() => {
    if (!socket.isConnected()) return;

    const socketInstance = socket.getSocket();
    if (!socketInstance) return;

    let refreshTimeout: NodeJS.Timeout | null = null;
    
    const handleFriendUpdate = () => {
      console.log('Friend event received in FriendInvitation, scheduling refresh');
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        loadFriends();
      }, 500);
    };

    socketInstance.on('friend_request_accepted', handleFriendUpdate);

    return () => {
      if (refreshTimeout) clearTimeout(refreshTimeout);
      socketInstance.off('friend_request_accepted', handleFriendUpdate);
    };
  }, [socket.isConnected()]);

  const loadFriends = async () => {
    try {
      const data = await FriendsService.getFriends();
      setFriends(data.friends);
    } catch (error) {
      console.error('Failed to load friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendInvitation = async (friendUsername: string) => {
    try {
      console.log('🎮 [INVITE] Sending invitation to:', friendUsername, 'for game:', gameId);
      setSendingTo(friendUsername);
      await FriendsService.sendGameInvitation(gameId, friendUsername, message);
      console.log('🎮 [INVITE] Invitation sent successfully to:', friendUsername);
      setInvitationSent(prev => [...prev, friendUsername]);
    } catch (error: any) {
      console.error('🎮 [INVITE] Failed to send invitation:', error);
      
      // Show user-friendly error message
      const errorMessage = error.response?.data?.error || 'Failed to send invitation';
      alert(errorMessage);
    } finally {
      setSendingTo(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">📱 Invite Friends</h4>
        <div className="loading mx-auto" style={{ width: '24px', height: '24px' }} />
      </div>
    );
  }

  if (friends.length === 0) {
    return (
      <div className="bg-blue-50 rounded-lg p-4">
        <h4 className="font-semibold mb-2">📱 Invite Friends</h4>
        <p className="text-sm text-gray-600 mb-3">
          You don't have any friends yet.
        </p>
        <button
          onClick={() => window.open('/lobby', '_blank')}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          Go to lobby to add friends →
        </button>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 rounded-lg p-4">
      <h4 className="font-semibold mb-3">📱 Invite Friends</h4>
      
      {/* Message input */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Optional message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          maxLength={200}
        />
      </div>

      {/* Friends list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {friends.map((friend) => {
          const hasInvited = invitationSent.includes(friend.user.username);
          const isSending = sendingTo === friend.user.username;
          
          return (
            <div
              key={friend.id}
              className="flex items-center justify-between p-2 bg-white rounded border"
            >
              <div>
                <div className="font-medium text-sm">{friend.user.username}</div>
                <div className="text-xs text-gray-500">
                  ELO: {friend.user.elo} • {friend.user.gamesPlayed} games
                </div>
              </div>
              <button
                onClick={() => sendInvitation(friend.user.username)}
                disabled={isSending || hasInvited}
                className={`px-3 py-1 text-xs font-medium rounded ${
                  hasInvited
                    ? 'bg-green-100 text-green-800 cursor-not-allowed'
                    : isSending
                    ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {hasInvited ? '✓ Invited' : isSending ? 'Sending...' : 'Invite'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}