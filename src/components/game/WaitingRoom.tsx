// src/components/game/WaitingRoom.tsx
import React from 'react';
import { useRouter } from 'next/navigation';
import { useGameStore } from '../../store/game';
import { gamesAPI } from '../../services/api';
import { useSocket } from '../../services/socket';
import { FriendInvitation } from '../FriendInvitation';
import { GameState } from '@gin-rummy/common';

interface WaitingRoomProps {
  gameId: string;
  user: any;
  gameState: GameState | null;
  waitingState: any;
  getMyPlayer: () => any;
  getOpponent: () => any;
}

const WaitingRoom: React.FC<WaitingRoomProps> = ({
  gameId,
  user,
  gameState,
  waitingState,
  getMyPlayer,
  getOpponent,
}) => {
  const router = useRouter();
  const socket = useSocket();
  const [isMarkingReady, setIsMarkingReady] = React.useState(false);

  const currentGameState = gameState || null;
  const players = currentGameState?.players || [];
  const myPlayer = getMyPlayer();
  const opponent = getOpponent();
  const hasSecondPlayer = players.length === 2;
  const myReadyStatus = myPlayer?.isReady || false;
  const opponentReadyStatus = opponent?.isReady || false;
  const bothPlayersReady = hasSecondPlayer && myReadyStatus && opponentReadyStatus;
  const otherPlayer = players.find(p => p.id !== user?.id && p.id !== 'waiting-for-player');

  const handleMarkReady = async () => {
    if (!gameId || !user || myReadyStatus || isMarkingReady) {
      return;
    }

    setIsMarkingReady(true);

    const requestId = window.crypto?.randomUUID?.() ||
                     'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                       const r = Math.random() * 16 | 0;
                       const v = c == 'x' ? r : (r & 0x3 | 0x8);
                       return v.toString(16);
                     });

    const expectedVersion = useGameStore.getState().getCurrentStreamVersion();

    try {
      const response = await gamesAPI.markPlayerReady(gameId, requestId, expectedVersion);
      if (response.data.gameStarted) {
      }
    } catch (error) {
      if (error.response?.status === 409) {
        if (error.response?.data?.code === 'STATE_VERSION_MISMATCH') {
          const serverVersion = error.response.data.serverVersion;
          const clientVersion = expectedVersion;
          useGameStore.getState().setStreamVersion(serverVersion);
          if (socket && gameId) {
            socket.joinGame(gameId);
          }
        } else {
          if (socket && gameId) {
            socket.joinGame(gameId);
          }
        }
      }
    } finally {
      setIsMarkingReady(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-6 max-w-3xl w-full">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🎯</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            {hasSecondPlayer ? 'Game Lobby' : 'Waiting for Opponent'}
          </h2>
          <p className="text-gray-600">
            {hasSecondPlayer
              ? 'Both players must click Ready to start the game!'
              : 'Invite a friend or wait for someone to join from the lobby.'
            }
          </p>
        </div>

        {/* Players Status */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Current Player (You) */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">{myPlayer?.username || user?.username || 'Player'}</h3>
                <p className="text-sm text-gray-600">You</p>
              </div>
              <div className="flex items-center space-x-2">
                {hasSecondPlayer ? (
                  <>
                    <span className={`text-sm font-medium ${
                      myReadyStatus ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {myReadyStatus ? '✓ Ready' : 'Not Ready'}
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-green-600">✓ Waiting</span>
                )}
              </div>
            </div>
          </div>

          {/* Opponent */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {hasSecondPlayer
                    ? ((opponent?.username && opponent.username.trim()) || players.find(p => p.id !== user?.id && p.id !== 'waiting-for-player')?.username || 'Opponent')
                    : 'Waiting...'}
                </h3>
                <p className="text-sm text-gray-600">
                  {hasSecondPlayer ? 'Opponent' : 'Open slot'}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                {hasSecondPlayer ? (
                  <span className={`text-sm font-medium ${
                    opponentReadyStatus ? 'text-green-600' : 'text-gray-500'
                  }`}>
                    {opponentReadyStatus ? '✓ Ready' : 'Not Ready'}
                  </span>
                ) : (
                  <div className="flex items-center space-x-1 text-gray-500">
                    <div className="loading w-4 h-4" />
                    <span className="text-sm">Waiting</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="text-center space-y-4">
          {hasSecondPlayer && (
            <div className="space-y-3">
              {!myReadyStatus && (
                <button
                  onClick={handleMarkReady}
                  disabled={isMarkingReady}
                  className={`btn btn-primary text-lg px-8 py-3 transition-all duration-300 ${
                    isMarkingReady
                      ? 'transform scale-95 opacity-75'
                      : 'hover:scale-105 active:scale-95'
                  }`}
                >
                  {isMarkingReady ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Getting Ready...</span>
                    </div>
                  ) : (
                    "I'm Ready!"
                  )}
                </button>
              )}
              
              {myReadyStatus && !opponentReadyStatus && (
                <div className="flex items-center justify-center space-x-2 text-green-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="font-medium">You're ready! Waiting for opponent...</span>
                </div>
              )}

              {bothPlayersReady && (
                <div className="flex items-center justify-center space-x-2 text-blue-600">
                  <div className="loading w-5 h-5" />
                  <span className="font-medium">Both players ready! Starting game...</span>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t">
            {(() => {
              const shouldShow = gameId && (players.length < 2 || players.some(p => p.id === 'waiting-for-player'));
              return shouldShow;
            })() && (
              <div className="mb-4">
                <FriendInvitation gameId={gameId!} />
              </div>
            )}
            
            <button
              onClick={() => router.push('/lobby')}
              className="btn btn-secondary"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaitingRoom;