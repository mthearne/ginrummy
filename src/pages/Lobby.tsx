import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import crypto from 'crypto';
import { useLobbyStore } from '../store/lobby';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { gamesAPI } from '../services/api';
import { formatRelativeTime } from '../utils/helpers';
import { FriendManager } from '../components/FriendManager';
import { FriendChat } from '../components/chat/FriendChat';
import { FriendsService, Friend } from '../services/friends';
import { ChatService } from '../services/chat';
import { GameStatus } from '@gin-rummy/common';

export default function Lobby() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthGuard();
  const { 
    filter, 
    gameView,
    setGames, 
    setMyGames,
    setFilter, 
    setGameView,
    setLoading, 
    setLoadingMyGames,
    getFilteredGames 
  } = useLobbyStore();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [resigning, setResigning] = useState<string | null>(null);
  const [showResignModal, setShowResignModal] = useState(false);
  const [gameToResign, setGameToResign] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [chatView, setChatView] = useState<'friends' | 'chat'>('friends');
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);


  useEffect(() => {
    loadGames();
    loadMyGames();
    loadFriends();
    loadUnreadCount();
    
    // Check if we should open chat from notification
    const chatUserId = searchParams?.get('chat');
    if (chatUserId) {
      setChatView('chat');
      // The FriendChat component will need to handle selecting this user
    }
    
    // Refresh unread count every 30 seconds
    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [searchParams]);

  const loadFriends = async () => {
    try {
      const data = await FriendsService.getFriends();
      setFriends(data.friends || []);
    } catch (error) {
      console.error('Failed to load friends:', error);
      setFriends([]);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const data = await ChatService.getConversations();
      const totalUnread = data.conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
      setTotalUnreadCount(totalUnread);
    } catch (error) {
      console.error('Failed to load unread count:', error);
      setTotalUnreadCount(0);
    }
  };

  const loadGames = async () => {
    setLoading(true);
    try {
      const response = await gamesAPI.listGames({ status: 'WAITING' });
      setGames(response.data.games);
    } catch (error) {
      console.error('Failed to load games:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMyGames = async () => {
    setLoadingMyGames(true);
    try {
      const response = await gamesAPI.getMyGames();
      setMyGames(response.data.games);
    } catch (error) {
      console.error('Failed to load my games:', error);
    } finally {
      setLoadingMyGames(false);
    }
  };

  const refreshCurrentView = () => {
    if (gameView === 'available') {
      loadGames();
    } else {
      loadMyGames();
    }
  };

  const createGame = async (vsAI: boolean) => {
    if (!user) return;
    
    setCreating(true);
    try {
      console.log(`[NAV DEBUG] Creating ${vsAI ? 'AI' : 'PvP'} game...`);
      const response = await gamesAPI.createGame({ 
        vsAI, 
        isPrivate: false,
        maxPlayers: 2 
      });
      
      const gameId = response.data.gameId;
      console.log(`[NAV DEBUG] Game created with ID: ${gameId}`);
      
      // Refresh my games list since we just created a new game
      loadMyGames();
      
      console.log(`[NAV DEBUG] Navigating to: /game/${gameId}`);
      router.push(`/game/${gameId}`);
    } catch (error) {
      console.error('Failed to create game:', error);
    } finally {
      setCreating(false);
    }
  };

  const joinGame = async (gameId: string) => {
    setJoining(gameId);
    try {
      // Generate requestId and use expectedVersion of 0 for join operations
      const requestId = window.crypto?.randomUUID?.() || 
                       'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                         const r = Math.random() * 16 | 0;
                         const v = c == 'x' ? r : (r & 0x3 | 0x8);
                         return v.toString(16);
                       });
      const expectedVersion = 0;
      
      await gamesAPI.joinGame(gameId, requestId, expectedVersion);
      
      // Refresh both lists since joining affects availability and my games
      loadGames();
      loadMyGames();
      
      router.push(`/game/${gameId}`);
    } catch (error) {
      console.error('Failed to join game:', error);
    } finally {
      setJoining(null);
    }
  };

  const rejoinGame = async (gameId: string) => {
    router.push(`/game/${gameId}`);
  };

  const handleResignClick = (gameId: string) => {
    setGameToResign(gameId);
    setShowResignModal(true);
  };

  const confirmResign = async () => {
    if (!gameToResign || resigning) return; // Prevent multiple simultaneous requests

    setResigning(gameToResign);
    setShowResignModal(false);
    
    try {
      await gamesAPI.resignGame(gameToResign);
      
      // Refresh my games list to remove the resigned game
      await loadMyGames();
    } catch (error: any) {
      console.error('Failed to resign from game:', error);
      
      // Handle specific error types
      if (error.response?.status === 429) {
        alert('Too many requests. Please wait a moment before trying again.');
      } else if (error.response?.status === 401) {
        alert('Your session has expired. Please refresh the page and log in again.');
      } else {
        alert('Failed to resign from game. Please try again.');
      }
    } finally {
      setResigning(null);
      setGameToResign(null);
    }
  };

  const cancelResign = () => {
    setShowResignModal(false);
    setGameToResign(null);
  };

  const filteredGames = getFilteredGames();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Game Lobby</h1>
            <p className="text-gray-600">Create a new game, join an existing one, or manage your friends</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Column - Games */}
        <div className="lg:col-span-2 space-y-8">
          {/* Create Game Section */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="card">
              <div className="card-body">
                <h2 className="text-xl font-semibold mb-4">Play vs Human</h2>
                <p className="text-gray-600 mb-4">
                  Challenge another player in real-time multiplayer mode. Your ELO rating will be affected.
                </p>
                <button
                  onClick={() => createGame(false)}
                  disabled={creating}
                  className="w-full btn btn-primary"
                >
                  {creating ? (
                    <div className="flex items-center justify-center">
                      <div className="loading mr-2" />
                      Creating...
                    </div>
                  ) : (
                    'Create PvP Game'
                  )}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-body">
                <h2 className="text-xl font-semibold mb-4">Play vs AI</h2>
                <p className="text-gray-600 mb-4">
                  Practice against our intelligent AI opponent. Perfect for learning and improving your skills.
                </p>
                <button
                  onClick={() => createGame(true)}
                  disabled={creating}
                  className="w-full btn btn-secondary"
                >
                  {creating ? (
                    <div className="flex items-center justify-center">
                      <div className="loading mr-2" />
                      Creating...
                    </div>
                  ) : (
                    'Play vs AI'
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Game List */}
          <div className="card">
            <div className="card-body">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  {gameView === 'available' ? 'Available Games' : 'My Active Games'}
                </h2>
                
                <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 mt-4 sm:mt-0">
                  {/* Game view toggle */}
                  <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                    <button
                      onClick={() => setGameView('available')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        gameView === 'available'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      Available
                    </button>
                    <button
                      onClick={() => setGameView('my-games')}
                      className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                        gameView === 'my-games'
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      My Games
                    </button>
                  </div>
                  
                  {/* Filter buttons */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setFilter('all')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        filter === 'all'
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilter('pvp')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        filter === 'pvp'
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      PvP
                    </button>
                    <button
                      onClick={() => setFilter('pve')}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        filter === 'pve'
                          ? 'bg-primary-100 text-primary-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      vs AI
                    </button>
                  </div>
                </div>
              </div>

              {filteredGames.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-gray-400 mb-4">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <p className="text-gray-500">
                    {gameView === 'available' 
                      ? 'No games available. Create one to get started!' 
                      : 'No active games. Create or join a game to get started!'
                    }
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredGames.map((game) => (
                    <div
                      key={game.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <div className={`w-3 h-3 rounded-full ${
                            game.vsAI ? 'bg-blue-400' : 'bg-green-400'
                          }`} />
                          <span className="font-medium">
                            {game.vsAI ? 'vs AI' : 'PvP'}
                          </span>
                          {gameView === 'my-games' && (
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              game.status === GameStatus.Waiting 
                                ? 'bg-yellow-100 text-yellow-800' 
                                : 'bg-green-100 text-green-800'
                            }`}>
                              {game.status === GameStatus.Waiting ? 'Waiting' : 'Active'}
                            </span>
                          )}
                        </div>
                        
                        <div className="text-sm text-gray-600">
                          Players: {game.playerCount}/{game.maxPlayers}
                        </div>
                        
                        <div className="text-sm text-gray-500">
                          {gameView === 'available' 
                            ? `Created ${formatRelativeTime(game.createdAt)}`
                            : `Updated ${formatRelativeTime((game as any).updatedAt || game.createdAt)}`
                          }
                        </div>
                      </div>

                      {gameView === 'available' ? (
                        <button
                          onClick={() => joinGame(game.id)}
                          disabled={joining === game.id || game.playerCount >= game.maxPlayers}
                          className="btn btn-primary btn-sm"
                        >
                          {joining === game.id ? (
                            <div className="flex items-center">
                              <div className="loading mr-1" />
                              Joining...
                            </div>
                          ) : (
                            'Join Game'
                          )}
                        </button>
                      ) : (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => rejoinGame(game.id)}
                            className="btn btn-secondary btn-sm"
                          >
                            {game.status === GameStatus.Waiting ? 'Return to Lobby' : 'Rejoin Game'}
                          </button>
                          <button
                            onClick={() => handleResignClick(game.id)}
                            disabled={resigning === game.id || resigning !== null}
                            className="btn btn-outline btn-sm text-red-600 border-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {resigning === game.id ? (
                              <div className="flex items-center">
                                <div className="loading mr-1" />
                                Resigning...
                              </div>
                            ) : (
                              'Resign'
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Refresh button */}
              <div className="mt-6 text-center">
                <button
                  onClick={refreshCurrentView}
                  className="btn btn-secondary flex items-center mx-auto"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Friends & Chat */}
        <div className="lg:col-span-1 space-y-6">
          {/* Toggle between Friends and Chat */}
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setChatView('friends')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                chatView === 'friends'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Friends
            </button>
            <button
              onClick={() => setChatView('chat')}
              className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                chatView === 'chat'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Chat
              {totalUnreadCount > 0 && (
                <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">
                  {totalUnreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Content */}
          {chatView === 'friends' ? (
            <FriendManager onStartChat={(friendId) => {
              setChatView('chat');
              // Use router to update URL with chat parameter for auto-selection
              const currentUrl = new URL(window.location.href);
              currentUrl.searchParams.set('chat', friendId);
              window.history.replaceState(null, '', currentUrl.toString());
            }} />
          ) : (
            <FriendChat 
              friends={friends} 
              initialSelectedUserId={searchParams?.get('chat') || undefined}
              onUnreadCountChange={loadUnreadCount}
            />
          )}
        </div>
      </div>

      {/* Resign Confirmation Modal */}
      {showResignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mr-3">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Resign from Game</h3>
            </div>
            
            <p className="text-gray-600 mb-6">
              Are you sure you want to resign from this game? This will end the game immediately and award the victory to your opponent. This action cannot be undone.
            </p>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={cancelResign}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={confirmResign}
                disabled={resigning !== null}
                className="btn btn-outline text-red-600 border-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resigning ? 'Resigning...' : 'Resign Game'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}