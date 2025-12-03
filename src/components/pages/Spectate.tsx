import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthGuard } from '../../hooks/useAuthGuard';
import { useSocket } from '../../services/socket';
import { Card as CardComponent } from '../ui/Card';
import { TurnHistory } from '../game/TurnHistory';
import { GamePhase, Card, GameState } from '@gin-rummy/common';
import { gameStreamingService } from '../../services/gameStreaming';
import { api } from '../../services/api';

interface SpectatorView extends GameState {
  isSpectating: boolean;
  spectatorId: string;
  playerNames: { [playerId: string]: string };
}

export default function Spectate() {
  const params = useParams<{ gameId: string }>();
  const gameId = params?.gameId;
  const router = useRouter();
  const { user } = useAuthGuard();
  
  const [spectatorView, setSpectatorView] = useState<SpectatorView | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!gameId || !user) return;

    console.log('👁️ Spectator: Initializing spectator view for game', gameId);

    // Load initial spectator view
    loadSpectatorView();

    // Connect to game streaming for real-time updates
    const token = localStorage.getItem('accessToken');
    if (token) {
      gameStreamingService.connect(token, gameId);
      gameStreamingService.setCurrentGame(gameId);
      setIsConnected(true);

      // Listen for game updates
      const unsubscribe = gameStreamingService.addListener((event) => {
        console.log('👁️ Spectator: Received streaming event:', event.type);
        
        if (event.type === 'game_state_updated' && event.data?.gameState) {
          // Update spectator view with new game state
          const updatedState = event.data.gameState;
          setSpectatorView(prev => prev ? { ...prev, ...updatedState } : null);
        }
      });

      return () => {
        unsubscribe();
        gameStreamingService.disconnect();
      };
    }
  }, [gameId, user]);

  const loadSpectatorView = async () => {
    if (!gameId) return;
    
    try {
      setIsLoading(true);
      const response = await api.get(`/games/${gameId}/spectate`);
      
      if (response.data.success) {
        setSpectatorView(response.data.spectatorView);
        setError(null);
      }
    } catch (err: any) {
      console.error('👁️ Spectator: Failed to load spectator view:', err);
      setError(err.response?.data?.error || 'Failed to load game');
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p>Please log in to spectate games.</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto mb-4"></div>
          <h1 className="text-2xl font-bold">Loading Game...</h1>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Error</h1>
          <p className="mb-4">{error}</p>
          <button 
            onClick={() => router.push('/lobby')}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
          >
            Back to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (!spectatorView) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-900 to-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Game Not Available</h1>
        </div>
      </div>
    );
  }

  // Waiting game state
  if (spectatorView.status === 'WAITING') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-900 to-black text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold">👁️ Spectating Game</h1>
            <button 
              onClick={() => router.push('/lobby')}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg"
            >
              Back to Lobby
            </button>
          </div>
          
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Game Waiting for Players</h2>
            <div className="bg-green-800 rounded-lg p-6">
              <p className="text-lg mb-4">
                {spectatorView.vsAI ? 'AI game in progress' : 'Waiting for second player to join'}
              </p>
              <div className="flex justify-center">
                {spectatorView.players.map((player, index) => (
                  <div key={player.id} className="mx-4 p-4 bg-green-700 rounded-lg">
                    <p className="font-semibold">{player.username}</p>
                    <p className="text-sm text-green-200">Player {index + 1}</p>
                  </div>
                ))}
                {!spectatorView.vsAI && spectatorView.players.length < 2 && (
                  <div className="mx-4 p-4 bg-gray-600 rounded-lg border-2 border-dashed border-gray-400">
                    <p className="text-gray-400">Waiting for player...</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentPlayer = spectatorView.players.find(p => p.id === spectatorView.currentPlayerId);
  const player1 = spectatorView.players[0];
  const player2 = spectatorView.players[1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-800 via-green-900 to-black text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <h1 className="text-3xl font-bold">👁️ Spectating Game</h1>
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></div>
              <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
          <button 
            onClick={() => router.push('/lobby')}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg"
          >
            Back to Lobby
          </button>
        </div>

        {/* Game Info */}
        <div className="mb-8 bg-green-800 rounded-lg p-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-green-200">Current Phase</p>
              <p className="text-lg font-semibold capitalize">
                {spectatorView.phase.replace('_', ' ')}
              </p>
            </div>
            <div>
              <p className="text-sm text-green-200">Current Turn</p>
              <p className="text-lg font-semibold">
                {currentPlayer ? spectatorView.playerNames[currentPlayer.id] : 'Unknown'}
              </p>
            </div>
            <div>
              <p className="text-sm text-green-200">Round</p>
              <p className="text-lg font-semibold">{spectatorView.roundNumber || 1}</p>
            </div>
          </div>
        </div>

        {/* Game Table */}
        <div className="relative mb-8">
          {/* Player 1 (Top) */}
          {player1 && (
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2 text-center">
              <div className={`bg-blue-800 rounded-lg p-4 ${spectatorView.currentPlayerId === player1.id ? 'ring-2 ring-yellow-400' : ''}`}>
                <p className="font-semibold">{spectatorView.playerNames[player1.id]}</p>
                <p className="text-sm text-blue-200">Hand: {player1.handSize} cards</p>
                <p className="text-sm text-blue-200">Score: {player1.score}</p>
              </div>
              
              {/* Player 1 Hand (hidden cards) */}
              <div className="flex justify-center mt-2 space-x-1">
                {Array.from({ length: player1.handSize }).map((_, index) => (
                  <div key={index} className="w-12 h-16 bg-blue-900 border border-blue-700 rounded transform rotate-180">
                    <div className="w-full h-full bg-blue-800 rounded border flex items-center justify-center">
                      <span className="text-xs text-blue-400">?</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Center Area */}
          <div className="flex items-center justify-center h-96">
            <div className="bg-green-700 rounded-lg p-8 w-80 h-40 flex items-center justify-between">
              {/* Stock Pile */}
              <div className="text-center">
                <div className="w-16 h-20 bg-blue-900 border border-blue-700 rounded mb-2 flex items-center justify-center">
                  <span className="text-white text-xs">Stock</span>
                </div>
                <p className="text-xs text-green-200">{spectatorView.stockPileCount} cards</p>
              </div>

              {/* Discard Pile */}
              <div className="text-center">
                {spectatorView.discardPile.length > 0 ? (
                  <div className="mb-2">
                    <CardComponent card={spectatorView.discardPile[spectatorView.discardPile.length - 1]} />
                  </div>
                ) : (
                  <div className="w-16 h-20 border-2 border-dashed border-green-500 rounded mb-2 flex items-center justify-center">
                    <span className="text-green-400 text-xs">Discard</span>
                  </div>
                )}
                <p className="text-xs text-green-200">{spectatorView.discardPile.length} cards</p>
              </div>
            </div>
          </div>

          {/* Player 2 (Bottom) */}
          {player2 && (
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-center">
              {/* Player 2 Hand (hidden cards) */}
              <div className="flex justify-center mb-2 space-x-1">
                {Array.from({ length: player2.handSize }).map((_, index) => (
                  <div key={index} className="w-12 h-16 bg-red-900 border border-red-700 rounded">
                    <div className="w-full h-full bg-red-800 rounded border flex items-center justify-center">
                      <span className="text-xs text-red-400">?</span>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className={`bg-red-800 rounded-lg p-4 ${spectatorView.currentPlayerId === player2.id ? 'ring-2 ring-yellow-400' : ''}`}>
                <p className="font-semibold">{spectatorView.playerNames[player2.id]}</p>
                <p className="text-sm text-red-200">Hand: {player2.handSize} cards</p>
                <p className="text-sm text-red-200">Score: {player2.score}</p>
              </div>
            </div>
          )}
        </div>

        {/* Game Over */}
        {spectatorView.gameOver && (
          <div className="mb-8 bg-yellow-800 border border-yellow-600 rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold mb-2">🎉 Game Over!</h2>
            <p className="text-lg">
              Winner: {spectatorView.winner ? spectatorView.playerNames[spectatorView.winner] : 'Unknown'}
            </p>
            {spectatorView.roundScores && (
              <div className="mt-4">
                <p className="font-semibold">Final Scores:</p>
                {Object.entries(spectatorView.roundScores).map(([playerId, score]) => (
                  <p key={playerId} className="text-sm">
                    {spectatorView.playerNames[playerId]}: {score} points
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}