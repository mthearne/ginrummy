import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameStore } from '../store/game';
import { useAuthStore } from '../store/auth';
import { useAuthGuard } from '../hooks/useAuthGuard';
import { useSocket } from '../services/socket';
import { Card as CardComponent } from '../components/ui/Card';
import { FriendInvitation } from '../components/FriendInvitation';
import { TurnHistory } from '../components/game/TurnHistory';
import { GameChat } from '../components/GameChat';
import Confetti from '../components/ui/Confetti';
import FlyingAnimal from '../components/ui/FlyingAnimal';
import AIThinkingOverlay from '../components/game/AIThinkingOverlay';
import { MoveType, GamePhase, Card, Meld, GameState } from '@gin-rummy/common';
import { RoundResultsModal } from '../components/RoundResults/RoundResultsModal';
import { gamesAPI } from '../services/api';

export default function Game() {
  const params = useParams<{ gameId: string }>();
  const gameId = params?.gameId;
  const router = useRouter();
  const { user } = useAuthGuard();
  const { 
    gameState, 
    waitingState,
    selectedCards, 
    isConnected, 
    gameError,
    isSubmittingMove,
    canMakeMove,
    selectCard,
    deselectCard,
    clearSelection,
    setGameError,
    getMyPlayer,
    getOpponent
  } = useGameStore();
  
  const socket = useSocket();
  const [lastGamePhase, setLastGamePhase] = useState<string | null>(null);
  const [roundNotification, setRoundNotification] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showFlyingAnimal, setShowFlyingAnimal] = useState(false);
  const [showRoundResults, setShowRoundResults] = useState(false);
  const [roundResultsDismissed, setRoundResultsDismissed] = useState(false);
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [lastCurrentPlayerId, setLastCurrentPlayerId] = useState<string | null>(null);
  const [roundResultsData, setRoundResultsData] = useState<{
    knockerPlayerId: string;
    knockerMelds: Meld[];
    layOffs: Array<{ cards: Card[]; targetMeld: Meld }>;
  } | null>(null);

  useEffect(() => {
    console.log(`[NAV DEBUG] Game page effect - gameId: ${gameId}, user: ${user?.username}`);
    if (!gameId) {
      console.log(`[NAV DEBUG] Missing gameId, redirecting to lobby`);
      router.push('/lobby');
      return;
    }
    if (!user) {
      console.log(`[NAV DEBUG] User not authenticated, useAuthGuard will handle redirect`);
      return;
    }

    // 1) Scope/reset store to this game (prevents cross-game contamination)
    useGameStore.getState().setCurrentGame(String(gameId));
    
    // 2) Always load/join, even if we think we have state (prevents stale carryover)
    console.log(`[NAV DEBUG] Loading game state via REST API: ${gameId}`);
    socket.joinGame(String(gameId));

    return () => {
      // Clean reset on unmount so lobby shows no stale state
      console.log(`[NAV DEBUG] Component unmounting for game: ${gameId}, resetting game state`);
      socket.leaveGame(String(gameId));
      useGameStore.getState().resetGame();
    };
  }, [gameId, user, socket]);

  // Game loading is now handled in the main useEffect above
  // This useEffect is removed to prevent duplicate loading and race conditions


  // Show round results when game is in layoff or round_over phase (e.g., after refresh)
  useEffect(() => {
    if (gameState && (gameState.phase === 'layoff' || gameState.phase === 'round_over') && !showRoundResults && !roundResultsDismissed) {
      const myPlayer = getMyPlayer();
      const opponent = getOpponent();
      
      if (myPlayer && opponent) {
        console.log(`Game in ${gameState.phase} phase, showing round results modal`);
        
        // Determine knocker based on game state
        const myDeadwood = myPlayer.deadwood || 0;
        const opponentDeadwood = opponent.deadwood || 0;
        
        let knockerPlayerId: string;
        let knockerMelds: Meld[];
        
        // Determine knocker based on who has melds or lower deadwood
        if (myPlayer.melds && myPlayer.melds.length > 0 && myDeadwood <= 10) {
          knockerPlayerId = myPlayer.id;
          knockerMelds = myPlayer.melds;
        } else if (opponent.melds && opponent.melds.length > 0 && opponentDeadwood <= 10) {
          knockerPlayerId = opponent.id;
          knockerMelds = opponent.melds;
        } else {
          // Fallback: whoever has lower deadwood
          knockerPlayerId = myDeadwood <= opponentDeadwood ? myPlayer.id : opponent.id;
          knockerMelds = knockerPlayerId === myPlayer.id ? (myPlayer.melds || []) : (opponent.melds || []);
        }
        
        setRoundResultsData({
          knockerPlayerId,
          knockerMelds,
          layOffs: [], // Will be calculated dynamically by the modal
        });
        setShowRoundResults(true);
      }
    }
  }, [gameState, showRoundResults, roundResultsDismissed, getMyPlayer, getOpponent]);

  // Reset round results dismissed flag when new round starts
  useEffect(() => {
    if (gameState && gameState.phase === 'upcard_decision' && roundResultsDismissed) {
      console.log('New round started, resetting round results dismissed flag');
      setRoundResultsDismissed(false);
    }
  }, [gameState?.phase, roundResultsDismissed]);

  // Track phase changes to show AI actions and celebrations
  useEffect(() => {
    if (gameState && lastGamePhase && gameState.phase !== lastGamePhase) {
      // Trigger celebrations for round completion (or final round if game over)
      if ((gameState.phase === 'layoff' || gameState.phase === 'round_over' || gameState.phase === 'game_over') && 
          lastGamePhase !== 'layoff' && lastGamePhase !== 'round_over' && lastGamePhase !== 'game_over') {
        // For now, create mock round results data since backend isn't populating it yet
        // In a real implementation, this would come from the game state
        const myPlayer = getMyPlayer();
        const opponent = getOpponent();
        
        if (myPlayer && opponent) {
          // Use actual game state data for round results
          console.log('Round over - setting up results with real game state data:', {
            myPlayer: { id: myPlayer.id, deadwood: myPlayer.deadwood, melds: myPlayer.melds?.length },
            opponent: { id: opponent.id, deadwood: opponent.deadwood, melds: opponent.melds?.length }
          });
          
          // The knocker should be determined by the backend, but for now use available data
          // Look for who has the lower deadwood or who has melds to determine knocker
          const myDeadwood = myPlayer.deadwood || 0;
          const opponentDeadwood = opponent.deadwood || 0;
          
          let knockerPlayerId: string;
          let knockerMelds: Meld[];
          
          // Determine knocker based on who has melds or lower deadwood
          if (myPlayer.melds && myPlayer.melds.length > 0 && myDeadwood <= 10) {
            knockerPlayerId = myPlayer.id;
            knockerMelds = myPlayer.melds;
          } else if (opponent.melds && opponent.melds.length > 0 && opponentDeadwood <= 10) {
            knockerPlayerId = opponent.id;
            knockerMelds = opponent.melds;
          } else {
            // Fallback: whoever has lower deadwood
            knockerPlayerId = myDeadwood <= opponentDeadwood ? myPlayer.id : opponent.id;
            knockerMelds = knockerPlayerId === myPlayer.id ? (myPlayer.melds || []) : (opponent.melds || []);
          }
          
          setRoundResultsData({
            knockerPlayerId,
            knockerMelds,
            layOffs: [] // Will be calculated by the modal based on available data
          });
          setShowRoundResults(true);
        }
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
        
        // Add extra celebration for game over
        if (gameState.phase === 'game_over') {
          setShowFlyingAnimal(true);
          setTimeout(() => setShowFlyingAnimal(false), 4000);
        }
      }
      

    }
    setLastGamePhase(gameState?.phase || null);
  }, [gameState?.phase, lastGamePhase, gameState?.vsAI, gameState?.currentPlayerId, user?.id]);

  // Track round transitions
  useEffect(() => {
    if (gameState && gameState.phase === GamePhase.UpcardDecision && lastGamePhase && lastGamePhase !== GamePhase.UpcardDecision) {
      // New round started
      setRoundNotification('New round started! Cards have been dealt.');
      const timer = setTimeout(() => {
        setRoundNotification(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.phase, lastGamePhase]);

  // Initialize hand order when hand changes
  useEffect(() => {
    const myPlayer = getMyPlayer();
    if (myPlayer?.hand) {
      const currentCardIds = myPlayer.hand.map((card: Card) => card.id);
      
      if (!handOrder.length) {
        // First time initialization
        console.log('Initial hand order setup:', currentCardIds);
        setHandOrder(currentCardIds);
      } else {
        // Check for new cards and add them to the end while preserving existing order
        const existingCards = handOrder.filter((cardId: string) => currentCardIds.includes(cardId));
        const newCards = currentCardIds.filter((cardId: string) => !handOrder.includes(cardId));
        
        if (newCards.length > 0 || existingCards.length !== handOrder.length) {
          const newOrder = [...existingCards, ...newCards];
          console.log('Adding new cards to end of hand:', newCards, 'New order:', newOrder);
          setHandOrder(newOrder);
        }
      }
    }
  }, [gameState?.players, handOrder.length]);

  // Detect opponent actions (current player changes) and trigger fast refresh
  useEffect(() => {
    if (gameState?.currentPlayerId && lastCurrentPlayerId && 
        gameState.currentPlayerId !== lastCurrentPlayerId) {
      
      const myPlayer = getMyPlayer();
      const isNowMyTurn = gameState.currentPlayerId === myPlayer?.id;
      const wasMyTurn = lastCurrentPlayerId === myPlayer?.id;
      
      // If it's now my turn (opponent just moved) or I just moved, trigger fast refresh
      if (isNowMyTurn && !wasMyTurn) {
        console.log('🚀 Opponent action detected - triggering fast refresh');
        if (socket && gameId) {
          socket.joinGame(gameId); // Immediate refresh
        }
      }
    }
    
    // Update tracking
    if (gameState?.currentPlayerId) {
      setLastCurrentPlayerId(gameState.currentPlayerId);
    }
  }, [gameState?.currentPlayerId, lastCurrentPlayerId, gameId, socket, getMyPlayer]);


  const handleCardClick = (cardId: string) => {
    if (selectedCards.includes(cardId)) {
      // Deselect the clicked card
      deselectCard(cardId);
    } else {
      // Clear any existing selection and select only this card
      clearSelection();
      selectCard(cardId);
    }
  };

  const handleDragStart = (e: React.DragEvent, cardId: string) => {
    setDraggedCard(cardId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const draggedCardId = draggedCard; // Use state instead of dataTransfer
    
    if (draggedCardId) {
      const currentIndex = handOrder.indexOf(draggedCardId);
      if (currentIndex !== -1 && currentIndex !== dropIndex) {
        const newOrder = [...handOrder];
        newOrder.splice(currentIndex, 1);
        newOrder.splice(dropIndex, 0, draggedCardId);
        setHandOrder(newOrder);
        console.log('Reordered cards:', newOrder);
      }
    }
    
    setDraggedCard(null);
    setDragOverIndex(null);
  };


  const handleDrawStock = () => {
    if (!gameId || !user) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.DrawStock,
      playerId: myPlayer.id,
      gameId: gameId,
    });
  };

  const handleDrawDiscard = () => {
    if (!gameId || !user || !gameState?.discardPile?.length) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.DrawDiscard,
      playerId: myPlayer.id,
      gameId: gameId,
    });
  };

  const handleDiscard = () => {
    if (!gameId || !user || selectedCards.length !== 1) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.Discard,
      playerId: myPlayer.id,
      cardId: selectedCards[0],
      gameId: gameId,
    });
    clearSelection();
  };

  const handleKnock = () => {
    if (!gameId || !user || selectedCards.length !== 1) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.Knock,
      playerId: myPlayer.id,
      cardId: selectedCards[0],
      melds: myPlayer?.melds || [],
      gameId: gameId,
    });
    clearSelection();
  };

  const handleGin = () => {
    if (!gameId || !user || selectedCards.length !== 1) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.Gin,
      playerId: myPlayer.id,
      cardId: selectedCards[0],
      melds: myPlayer?.melds || [],
      gameId: gameId,
    });
    clearSelection();
  };

  const handleTakeUpcard = () => {
    if (!gameId || !user) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.TakeUpcard,
      playerId: myPlayer.id,
      gameId: gameId,
    });
  };

  const handlePassUpcard = () => {
    if (!gameId || !user) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.PassUpcard,
      playerId: myPlayer.id,
      gameId: gameId,
    });
  };

  const handleStartNewRound = () => {
    console.log('handleStartNewRound called', {
      gameId,
      userId: user?.id,
      socketConnected: socket?.isConnected()
    });
    
    if (!gameId || !user) {
      console.error('Missing gameId or user for starting new round', { gameId, user: user?.id });
      return;
    }
    
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) {
      console.error('No player found for starting new round');
      return;
    }
    
    console.log('Sending StartNewRound move', {
      type: MoveType.StartNewRound,
      playerId: myPlayer.id,
      gameId: gameId,
    });
    
    socket.makeMove({
      type: MoveType.StartNewRound,
      playerId: myPlayer.id,
      gameId: gameId,
    });
  };

  const handleCloseRoundResults = () => {
    setShowRoundResults(false);
    setRoundResultsData(null);
    setRoundResultsDismissed(true);
  };

  const handleContinueAfterRoundResults = () => {
    console.log('Continue after round results clicked', {
      gameState: gameState?.phase,
      gameOver: gameState?.gameOver,
      roundScores: gameState?.roundScores
    });
    
    handleCloseRoundResults();
    
    // Start new round if game isn't over (handle both layoff and round_over phases)
    if (gameState && (gameState.phase === 'layoff' || gameState.phase === 'round_over') && !gameState.gameOver) {
      console.log('Starting new round...');
      handleStartNewRound();
    } else if (gameState?.gameOver || gameState?.phase === 'game_over') {
      console.log('Game is over, not starting new round');
      // Game over - let the regular game over UI take over
    } else {
      console.log('Conditions not met for new round:', {
        hasGameState: !!gameState,
        phase: gameState?.phase,
        gameOver: gameState?.gameOver
      });
      // Fallback: try to start new round anyway
      handleStartNewRound();
    }
  };


  // Debug logging before waiting screen check
  console.log('🔍 Game State Debug:', {
    hasWaitingState: !!waitingState,
    hasGameState: !!gameState,
    gameStatus: gameState?.status,
    playersLength: gameState?.players?.length,
    shouldShowWaiting: !!(waitingState || (gameState && gameState.status === 'WAITING' && gameState.players && gameState.players.length >= 1))
  });

  // Show waiting screen for PvP games (either waiting for second player OR waiting for ready status)
  if (waitingState || (gameState && gameState.status === 'WAITING' && gameState.players && gameState.players.length >= 1)) {
    console.log('✅ Entering waiting screen mode');
    
    const currentGameState = gameState || null;
    const players = currentGameState?.players || [];
    const myPlayer = getMyPlayer();
    const opponent = getOpponent();
    const hasSecondPlayer = players.length === 2;
    const myReadyStatus = myPlayer?.isReady || false;
    const opponentReadyStatus = opponent?.isReady || false;
    const bothPlayersReady = hasSecondPlayer && myReadyStatus && opponentReadyStatus;
    
    // Debug logging
    const otherPlayer = players.find(p => p.id !== user?.id && p.id !== 'waiting-for-player');
    console.log('🔍 Waiting Screen Debug:', {
      playersCount: players.length,
      players: players.map(p => ({ id: p.id, username: p.username, isReady: p.isReady })),
      hasWaitingPlayer: players.some(p => p.id === 'waiting-for-player'),
      shouldShowInvite: gameId && (players.length < 2 || players.some(p => p.id === 'waiting-for-player')),
      gameId: gameId,
      gameStatus: currentGameState?.status,
      vsAI: currentGameState?.vsAI,
      myPlayer: myPlayer ? { id: myPlayer.id, username: myPlayer.username } : null,
      opponent: opponent ? { id: opponent.id, username: opponent.username } : null,
      otherPlayer: otherPlayer ? { id: otherPlayer.id, username: otherPlayer.username } : null,
      user: user ? { id: user.id, username: user.username } : null,
      hasSecondPlayer,
      opponentFallbackChain: {
        opponentUsername: opponent?.username,
        otherPlayerUsername: otherPlayer?.username,
        finalResult: hasSecondPlayer 
          ? (opponent?.username || otherPlayer?.username || 'Opponent')
          : 'Waiting...'
      }
    });

    const handleMarkReady = async () => {
      if (!gameId || !user || myReadyStatus || isMarkingReady) return;
      
      setIsMarkingReady(true);
      
      // Generate UUID using browser crypto API or fallback
      const requestId = window.crypto?.randomUUID?.() || 
                       'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                         const r = Math.random() * 16 | 0;
                         const v = c == 'x' ? r : (r & 0x3 | 0x8);
                         return v.toString(16);
                       });
      
      const expectedVersion = useGameStore.getState().getCurrentStreamVersion();
      
      try {
        console.log('🚦 Marking ready with:', { requestId, expectedVersion, gameId });
        
        const response = await gamesAPI.markPlayerReady(gameId, requestId, expectedVersion);
        console.log('✅ Marked ready successfully:', response.data);
        
        // The socket service will handle the state updates
        if (response.data.gameStarted) {
          console.log('🎮 Game started, waiting for state update...');
        }
      } catch (error) {
        console.error('❌ Failed to mark ready:', error);
        
        // Handle version conflict errors
        if (error.response?.status === 409) {
          console.log('🔄 Version conflict, refreshing game state...');
          
          // Check if it's a version mismatch
          if (error.response?.data?.code === 'STATE_VERSION_MISMATCH') {
            const serverVersion = error.response.data.serverVersion;
            const clientVersion = expectedVersion;
            console.log(`📊 Version mismatch - client: ${clientVersion}, server: ${serverVersion}`);
            
            // Update to server version
            useGameStore.getState().setStreamVersion(serverVersion);
            
            // Trigger a refresh of the game state
            const socket = useSocket();
            if (socket && gameId) {
              socket.joinGame(gameId);
            }
          } else {
            // For other 409 errors, just refresh the game state
            console.log('📊 409 error without version info, refreshing game state');
            const socket = useSocket();
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
                console.log('🔍 Friend Invitation Render Check:', { shouldShow, gameId: !!gameId, playersLength: players.length, hasWaitingPlayer: players.some(p => p.id === 'waiting-for-player') });
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
  }

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center">
        <div className="text-center">
          <div className="loading mx-auto mb-4" style={{ width: '32px', height: '32px' }} />
          <p className="text-gray-600">Loading game...</p>
        </div>
      </div>
    );
  }

  const myPlayer = getMyPlayer();
  const opponent = getOpponent();
  const isMyTurn = gameState.currentPlayerId === myPlayer?.id;

  // Helper function to get user-friendly phase text
  const getPhaseDisplayText = (phase: string): string => {
    switch (phase) {
      case 'upcard_decision':
        return 'Deciding on upcard';
      case 'draw':
        return 'Drawing a card';
      case 'discard':
        return 'Discarding a card';
      case 'round_over':
        return 'Round complete';
      case 'game_over':
        return 'Game finished';
      default:
        return phase;
    }
  };

  // Helper function to get meld info for a card
  const getCardMeldInfo = (cardId: string, melds: any[]) => {
    for (const meld of melds || []) {
      const cardInMeld = meld.cards?.find((c: any) => c.id === cardId);
      if (cardInMeld) {
        return { isInMeld: true, meldType: meld.type };
      }
    }
    return { isInMeld: false, meldType: undefined };
  };

  // Helper function to calculate deadwood after discarding a card
  const getDeadwoodAfterDiscard = (cardId: string): number => {
    if (!myPlayer?.hand || !cardId) return myPlayer?.deadwood || 0;
    
    // Simulate hand without the selected card
    const handWithoutCard = myPlayer.hand.filter((card: Card) => card.id !== cardId);
    
    // For now, use current melds calculation - this could be enhanced to recalculate optimal melds
    const meldsWithoutCard = myPlayer.melds?.filter((meld: Meld) => 
      !meld.cards.some((card: Card) => card.id === cardId)
    ) || [];
    
    // Calculate deadwood with remaining melds
    const meldedCardIds = new Set(
      meldsWithoutCard.flatMap((meld: Meld) => meld.cards.map((card: Card) => card.id))
    );
    
    const deadwoodCards = handWithoutCard.filter((card: Card) => !meldedCardIds.has(card.id));
    const deadwoodValue = deadwoodCards.reduce((sum: number, card: Card) => {
      const value = card.rank === 'A' ? 1 : 
                   ['J', 'Q', 'K'].includes(card.rank) ? 10 : 
                   parseInt(card.rank) || 0;
      return sum + value;
    }, 0);
    
    return deadwoodValue;
  };

  return (
    <div className="game-area min-h-screen">
      <div className="max-w-6xl mx-auto p-4">
        {/* Connection Status */}
        {!isConnected && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg mb-4">
            Disconnected from server. Reconnecting...
          </div>
        )}

        {/* Game Error */}
        {gameError && (
          <div className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg mb-4">
            {gameError}
            <button 
              onClick={() => setGameError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Round Notification */}
        {roundNotification && (
          <div className="bg-blue-100 border border-blue-300 text-blue-700 px-4 py-2 rounded-lg mb-4">
            🎯 {roundNotification}
          </div>
        )}

        {/* Game Header */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">Gin Rummy</h1>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-600">Phase: {getPhaseDisplayText(gameState.phase || GamePhase.Draw)}</div>
              <div className="text-sm font-medium text-gray-800">
                Match Score: You {myPlayer?.score || 0} - {opponent?.score || 0} {opponent?.username || "AI"}
                {gameState.roundScores && (
                  <span className="text-xs text-green-600 block">
                    Last round: +{gameState.roundScores[user?.id || ''] || 0}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-4 gap-4">
          {/* Game Board */}
          <div className="lg:col-span-3 space-y-4">
            {/* Opponent */}
            <div className="bg-white rounded-lg p-4 relative">
              {/* AI Thinking Overlay */}
              <AIThinkingOverlay />
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{opponent?.username || "Opponent"}</h3>
                      {!isMyTurn && !gameState.gameOver && (
                        <div className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                          <span className="text-xs text-green-600 font-medium">Turn</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  Score: {opponent?.score || 0} | Cards: {opponent?.handSize || 0}
                  {(gameState.phase === 'round_over' || gameState.phase === 'game_over') && (
                    <span> | Deadwood: {opponent?.deadwood || 0}</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {gameState.phase === 'round_over' || gameState.phase === 'game_over' ? (
                  // Show actual cards with meld indicators when round/game is over (same size as player)
                  opponent?.hand?.map((card: Card) => {
                    const meldInfo = getCardMeldInfo(card.id, opponent.melds);
                    return (
                      <CardComponent
                        key={card.id}
                        card={card}
                        className="w-28 h-36"
                        isInMeld={meldInfo.isInMeld}
                        meldType={meldInfo.meldType}
                      />
                    );
                  })
                ) : (
                  // Show smaller card backs during normal gameplay to save space
                  Array.from({ length: opponent?.handSize || 0 }, (_, i) => (
                    <div
                      key={i}
                      className="playing-card back w-16 h-20 flex flex-col items-center justify-center"
                    >
                      <div className="text-white text-[8px] font-bold mb-1">♠ ♥</div>
                      <div className="text-white text-[6px] font-medium px-1 py-0.5 bg-white bg-opacity-20 rounded">
                        GIN RUMMY
                      </div>
                      <div className="text-white text-[8px] font-bold mt-1">♦ ♣</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Center Area */}
            <div className="bg-white rounded-lg p-4">
              {gameState.phase === 'game_over' ? (
                /* Game Over - Show Congratulations */
                <div className="text-center relative">
                  <div className="text-6xl mb-4">🎉</div>
                  <h2 className="text-3xl font-bold mb-6 text-purple-600">
                    Congratulations!
                  </h2>
                  <div className="bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg p-6 mb-6 shadow-lg">
                    <h3 className="text-xl font-semibold mb-4">
                      {gameState.winner === user?.id ? '🏆 You Won!' : '🥈 Good Game!'}
                    </h3>
                    <div className="text-lg space-y-2">
                      <div className={gameState.winner === user?.id ? 'text-green-600 font-bold' : 'text-gray-700'}>
                        <strong>You:</strong> {myPlayer?.score || 0} points
                      </div>
                      <div className={gameState.winner !== user?.id ? 'text-green-600 font-bold' : 'text-gray-700'}>
                        <strong>{opponent?.username || 'Opponent'}:</strong> {opponent?.score || 0} points
                      </div>
                    </div>
                    {gameState.roundScores && (
                      <div className="mt-4 pt-4 border-t border-purple-200">
                        <h4 className="font-medium mb-2 text-sm">Final Round:</h4>
                        <div className="text-sm space-y-1">
                          <div>
                            <strong>You:</strong> +{gameState.roundScores[user?.id || ''] || 0} points
                          </div>
                          <div>
                            <strong>{opponent?.username || 'Opponent'}:</strong> +{gameState.roundScores[opponent?.id || ''] || 0} points
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => router.push('/lobby')}
                    className="btn btn-primary bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 text-lg font-semibold rounded-lg shadow-lg"
                  >
                    Return to Lobby
                  </button>
                </div>
              ) : gameState.phase === 'round_over' ? (
                /* Round Over - Show Results */
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4 text-green-600">
                    🎯 Round Complete!
                  </h3>
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h4 className="font-medium mb-2">Round Results:</h4>
                    {gameState.roundScores && (
                      <div className="text-sm space-y-1">
                        <div>
                          <strong>You:</strong> +{gameState.roundScores[user?.id || ''] || 0} points
                        </div>
                        <div>
                          <strong>{opponent?.username || 'Opponent'}:</strong> +{gameState.roundScores[opponent?.id || ''] || 0} points
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-4">
                    Opponent's cards are now revealed with meld indicators. 
                    Blue rings = Runs, Green rings = Sets
                  </p>
                  <button
                    onClick={handleStartNewRound}
                    className="btn btn-primary"
                  >
                    Start Next Round
                  </button>
                </div>
              ) : gameState.phase === GamePhase.UpcardDecision ? (
                /* Upcard Decision Phase */
                <div className="text-center">
                  <h3 className="text-lg font-semibold mb-4">
                    {isMyTurn ? 'Do you want to take the upcard?' : `${opponent?.username || "Opponent"} is deciding on the upcard`}
                  </h3>
                  <div className="flex justify-center items-center space-x-8 mb-4">
                    <div className="text-center">
                      {gameState.discardPile && gameState.discardPile.length > 0 ? (
                        <CardComponent 
                          card={gameState.discardPile[0]}
                          className="w-28 h-36"
                        />
                      ) : (
                        <div className="w-28 h-36 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                          <span className="text-gray-400 text-sm">UPCARD</span>
                        </div>
                      )}
                      <p className="text-xs text-gray-600 mt-2">Upcard</p>
                    </div>
                  </div>
                  {isMyTurn && (
                    <div className="flex justify-center space-x-4">
                      <button
                        onClick={handleTakeUpcard}
                        className="btn btn-success"
                      >
                        Take Upcard
                      </button>
                      <button
                        onClick={handlePassUpcard}
                        className="btn btn-secondary"
                      >
                        Pass
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Normal Draw/Discard Phase */
                <div className="flex justify-center items-center space-x-8">
                  {/* Stock Pile */}
                  <div className="text-center">
                    <div className="mb-2">
                      <button
                        onClick={handleDrawStock}
                        disabled={!isMyTurn || gameState.phase !== 'draw'}
                        className="playing-card back w-28 h-36 flex flex-col items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-white text-lg font-bold mb-2">♠ ♥</div>
                        <div className="text-white text-sm font-medium px-2 py-1 bg-white bg-opacity-20 rounded">
                          STOCK
                        </div>
                        <div className="text-white text-lg font-bold mt-2">♦ ♣</div>
                      </button>
                    </div>
                    <p className="text-xs text-gray-600">{gameState.stockPileCount} cards</p>
                  </div>

                  {/* Discard Pile */}
                  <div className="text-center">
                    <div className="mb-2">
                      {gameState.discardPile && gameState.discardPile.length > 0 ? (
                        <button
                          onClick={handleDrawDiscard}
                          disabled={!isMyTurn || gameState.phase !== 'draw'}
                          className="disabled:cursor-not-allowed"
                        >
                          <CardComponent 
                            card={gameState.discardPile[0]}
                            className="w-28 h-36"
                          />
                        </button>
                      ) : (
                        <div className="w-28 h-36 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                          <span className="text-gray-400 text-sm">DISCARD</span>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-600">
                      Discard pile ({gameState.discardPile?.length || 0} cards)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* My Hand */}
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">Your Hand ({myPlayer?.hand?.length || 0} cards)</h3>
                  {isMyTurn && !gameState.gameOver && (
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-blue-600 font-medium">Your Turn</span>
                    </div>
                  )}
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={handleDiscard}
                    disabled={!isMyTurn || gameState.phase !== 'discard' || selectedCards.length !== 1}
                    className="btn btn-primary btn-sm disabled:btn-disabled"
                  >
                    {selectedCards.length === 1 ? 'Discard Card' : 'Discard (Select 1 card)'}
                  </button>
                  {(() => {
                    const deadwoodAfterDiscard = selectedCards.length === 1 ? getDeadwoodAfterDiscard(selectedCards[0]) : (myPlayer?.deadwood || 0);
                    const canGin = deadwoodAfterDiscard === 0 && isMyTurn && gameState.phase === GamePhase.Discard;
                    
                    return canGin && (
                      <button
                        onClick={handleGin}
                        disabled={selectedCards.length !== 1}
                        className="btn btn-success btn-sm disabled:btn-disabled"
                      >
                        Gin! (0 deadwood) {selectedCards.length !== 1 && '- Select 1 card'}
                      </button>
                    );
                  })()}
                  {(() => {
                    const deadwoodAfterDiscard = selectedCards.length === 1 ? getDeadwoodAfterDiscard(selectedCards[0]) : (myPlayer?.deadwood || 0);
                    const canKnock = deadwoodAfterDiscard <= 10 && deadwoodAfterDiscard > 0 && isMyTurn && gameState.phase === GamePhase.Discard;
                    
                    return canKnock && (
                      <button
                        onClick={handleKnock}
                        disabled={selectedCards.length !== 1}
                        className="btn btn-warning btn-sm disabled:btn-disabled border-2 border-orange-600"
                      >
                        Knock ({deadwoodAfterDiscard}) {selectedCards.length !== 1 && '- Select 1 card'}
                      </button>
                    );
                  })()}
                  <div className="text-sm text-gray-600">
                    Score: {myPlayer?.score || 0} | Deadwood: <span className={`font-medium ${(myPlayer?.deadwood || 0) <= 10 ? 'text-green-600' : 'text-red-600'}`}>{myPlayer?.deadwood || 0}</span>
                    {selectedCards.length === 1 && (
                      <span className="ml-2">
                        → After discard: <span className={`font-medium ${getDeadwoodAfterDiscard(selectedCards[0]) <= 10 ? 'text-green-600' : 'text-red-600'}`}>
                          {getDeadwoodAfterDiscard(selectedCards[0])}
                        </span>
                      </span>
                    )}
                    {selectedCards.length === 0 && (myPlayer?.deadwood || 0) <= 10 && (
                      <span className="text-green-600 ml-1">✓ Can knock!</span>
                    )}
                  </div>
                </div>
              </div>
              <div 
                className="flex flex-wrap gap-1"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  // Handle drop on container (append to end)
                  if (draggedCard) {
                    const currentIndex = handOrder.indexOf(draggedCard);
                    if (currentIndex !== -1) {
                      const newOrder = [...handOrder];
                      newOrder.splice(currentIndex, 1);
                      newOrder.push(draggedCard);
                      setHandOrder(newOrder);
                      console.log('Dropped on container, moved to end:', newOrder);
                    }
                  }
                  setDraggedCard(null);
                  setDragOverIndex(null);
                }}
              >
                {handOrder.map((cardId, index) => {
                  const card = myPlayer?.hand?.find((c: Card) => c.id === cardId);
                  if (!card) return null;
                  
                  const meldInfo = getCardMeldInfo(card.id, myPlayer.melds);
                  const isNewlyDrawn = card.id === myPlayer.lastDrawnCardId;
                  const isDragging = draggedCard === card.id;
                  const isDraggedOver = dragOverIndex === index;
                  
                  return (
                    <CardComponent
                      key={card.id}
                      card={card}
                      selected={selectedCards.includes(card.id)}
                      onClick={() => handleCardClick(card.id)}
                      className={`w-28 h-36 ${isDragging ? 'opacity-50' : ''}`}
                      isInMeld={meldInfo.isInMeld}
                      meldType={meldInfo.meldType}
                      isNewlyDrawn={isNewlyDrawn}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, card.id)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      isDragOver={isDraggedOver}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Game Info & Chat */}
          <div className="space-y-4">
            {/* Turn History */}
            <TurnHistory />
            
            {/* Game Info */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="font-semibold mb-2">Game Info</h3>
              <div className="text-sm text-gray-700 space-y-1">
                <div><strong>Deadwood:</strong> Unmelded cards</div>
                <div><strong>Gin:</strong> 0 deadwood (bonus points)</div>
                <div><strong>Knock:</strong> ≤10 deadwood to end round</div>
                <div><strong>Melds:</strong> 3+ cards in runs or sets</div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="inline-block w-3 h-3 rounded-full bg-blue-500"></span>
                  <span className="text-xs">Run (R)</span>
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500 ml-2"></span>
                  <span className="text-xs">Set (S)</span>
                </div>
              </div>
            </div>
            
            {/* Chat */}
            {gameState?.vsAI ? (
              <div className="bg-white rounded-lg p-4">
                <h3 className="font-semibold mb-4">Chat</h3>
                <p className="text-gray-500 text-center py-8">Chat not available in AI games</p>
              </div>
            ) : (() => {
              const opponent = getOpponent();
              return opponent ? (
                <GameChat 
                  opponentId={opponent.id} 
                  opponentUsername={opponent.username}
                />
              ) : (
                <div className="bg-white rounded-lg p-4">
                  <h3 className="font-semibold mb-4">Chat</h3>
                  <p className="text-gray-500 text-center py-8">Waiting for opponent...</p>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
      
      {/* Round Results Modal */}
      {showRoundResults && roundResultsData && gameState && gameState.id && (
        <RoundResultsModal
          isOpen={showRoundResults}
          onClose={handleCloseRoundResults}
          gameState={gameState as GameState}
          knockerPlayerId={roundResultsData.knockerPlayerId}
          knockerMelds={roundResultsData.knockerMelds}
          layOffs={roundResultsData.layOffs}
          currentPlayerId={getMyPlayer()?.id}
          onContinue={handleContinueAfterRoundResults}
        />
      )}

      {/* Celebration Effects */}
      <Confetti active={showConfetti} duration={3000} />
      <FlyingAnimal active={showFlyingAnimal} duration={3000} />
      
    </div>
  );
}