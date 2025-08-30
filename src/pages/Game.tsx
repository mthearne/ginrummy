import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGameStore } from '../store/game';
import { useAuthStore } from '../store/auth';
import { useSocket } from '../services/socket';
import { Card as CardComponent } from '../components/ui/Card';
import { FriendInvitation } from '../components/FriendInvitation';
import { TurnHistory } from '../components/game/TurnHistory';
import Confetti from '../components/ui/Confetti';
import FlyingAnimal from '../components/ui/FlyingAnimal';
import AIThinkingOverlay from '../components/game/AIThinkingOverlay';
import { MoveType, GamePhase, Card, Meld } from '@gin-rummy/common';

export default function Game() {
  const params = useParams<{ gameId: string }>();
  const gameId = params?.gameId;
  const router = useRouter();
  const { user } = useAuthStore();
  const { 
    gameState, 
    waitingState,
    selectedCards, 
    chatMessages, 
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
  const [chatMessage, setChatMessage] = useState('');
  const [aiStatus, setAiStatus] = useState<string | null>(null);
  const [lastGamePhase, setLastGamePhase] = useState<string | null>(null);
  const [roundNotification, setRoundNotification] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [handOrder, setHandOrder] = useState<string[]>([]);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showFlyingAnimal, setShowFlyingAnimal] = useState(false);

  useEffect(() => {
    console.log(`[NAV DEBUG] Game page effect - gameId: ${gameId}, user: ${user?.username}`);
    if (!gameId || !user) {
      console.log(`[NAV DEBUG] Missing gameId or user, redirecting to lobby`);
      router.push('/lobby');
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
      useGameStore.getState().resetGame();
    };
  }, [gameId, user, socket]);

  // Game loading is now handled in the main useEffect above
  // This useEffect is removed to prevent duplicate loading and race conditions

  // Track AI status during AI turns
  useEffect(() => {
    const myPlayer = getMyPlayer();
    const aiPlayer = gameState?.players?.find(p => p.id !== myPlayer?.id);
    if (gameState && gameState.vsAI && gameState.currentPlayerId === aiPlayer?.id) {
      // Determine what phase the AI is in and show appropriate thinking message
      let status = '';
      if (gameState.phase === 'upcard_decision') {
        status = 'Thinking about the upcard...';
      } else if (gameState.phase === 'draw') {
        status = 'Deciding what to draw...';
      } else if (gameState.phase === 'discard') {
        status = 'Choosing a card to discard...';
      } else if (gameState.phase === 'round_over') {
        status = 'Preparing next round...';
      } else {
        status = 'Thinking...';
      }
      
      setAiStatus(status);
      
      // Clear AI status after a longer delay to account for thinking time (0.5-4 seconds + processing)
      const timer = setTimeout(() => {
        setAiStatus(null);
      }, 5000);
      
      return () => clearTimeout(timer);
    } else {
      setAiStatus(null);
    }
  }, [gameState?.currentPlayerId, gameState?.phase, gameState?.vsAI]);

  // Track phase changes to show AI actions and celebrations
  useEffect(() => {
    if (gameState && lastGamePhase && gameState.phase !== lastGamePhase) {
      // Trigger celebrations for round completion
      if (gameState.phase === 'round_over' && lastGamePhase !== 'round_over') {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      }
      
      // Trigger celebrations for game completion
      if (gameState.phase === 'game_over' && lastGamePhase !== 'game_over') {
        setShowConfetti(true);
        setShowFlyingAnimal(true);
        setTimeout(() => {
          setShowConfetti(false);
          setShowFlyingAnimal(false);
        }, 4000);
      }

      // AI status tracking for PvE games
      if (gameState.vsAI) {
        const currentPlayer = gameState.players?.find(p => p.id === gameState.currentPlayerId);
        if (currentPlayer && currentPlayer.id !== user?.id) {
          // AI just made a move that changed the phase
          if (lastGamePhase === 'draw' && gameState.phase === 'discard') {
            setAiStatus('Drew a card');
            setTimeout(() => setAiStatus(null), 1500);
          } else if (lastGamePhase === 'discard' && gameState.phase === 'draw') {
            setAiStatus('Discarded a card');
            setTimeout(() => setAiStatus(null), 1500);
          } else if (lastGamePhase === 'upcard_decision' && gameState.phase === 'discard') {
            setAiStatus('Took the upcard');
            setTimeout(() => setAiStatus(null), 1500);
          } else if (lastGamePhase === 'upcard_decision' && gameState.phase === 'draw') {
            setAiStatus('Passed on the upcard');
            setTimeout(() => setAiStatus(null), 1500);
          } else if (lastGamePhase === 'round_over') {
            setAiStatus('Started new round');
            setTimeout(() => setAiStatus(null), 1500);
          }
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
    if (!gameId || !user) return;
    const myPlayer = getMyPlayer();
    if (!myPlayer?.id) return;
    
    socket.makeMove({
      type: MoveType.StartNewRound,
      playerId: myPlayer.id,
      gameId: gameId,
    });
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gameId || !chatMessage.trim()) return;
    
    socket.sendChatMessage(gameId, chatMessage);
    setChatMessage('');
  };

  // Show waiting screen for PvP games waiting for second player
  if (waitingState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-100 to-green-200 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-2xl w-full">
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left side - Game info */}
            <div className="text-center md:text-left">
              <div className="text-6xl mb-4 text-center">⏳</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">Waiting for Opponent</h2>
              <p className="text-gray-600 mb-6">
                Your PvP game has been created! Invite a friend or wait for someone to join from the lobby.
              </p>
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600 mb-2">Game ID:</p>
                <code className="bg-white px-2 py-1 rounded text-sm font-mono border">
                  {waitingState.gameId}
                </code>
              </div>
              <div className="flex items-center justify-center md:justify-start space-x-2 text-gray-500 mb-4">
                <div className="loading" />
                <span className="text-sm">Waiting for player to join...</span>
              </div>
              <button
                onClick={() => router.push('/lobby')}
                className="btn btn-secondary w-full md:w-auto"
              >
                Back to Lobby
              </button>
            </div>

            {/* Right side - Friend invitations */}
            <div>
              <FriendInvitation gameId={waitingState.gameId} />
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
                    {aiStatus && (
                      <div className="text-xs text-blue-600 italic">{aiStatus}</div>
                    )}
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
                          card={gameState.discardPile[gameState.discardPile.length - 1]}
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
                            card={gameState.discardPile[gameState.discardPile.length - 1]}
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
            <div className="bg-white rounded-lg p-4">
              <h3 className="font-semibold mb-4">Chat</h3>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {chatMessages.map((msg) => {
                const myPlayer = getMyPlayer();
                return (
                <div
                  key={msg.id}
                  className={`chat-message ${msg.playerId === myPlayer?.id ? 'own' : 'other'}`}
                >
                  <div className="font-medium text-xs mb-1">{msg.username}</div>
                  <div>{msg.message}</div>
                </div>
                );
              })}
            </div>
            <form onSubmit={handleSendChat} className="flex space-x-2">
              <input
                type="text"
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type a message..."
                className="input text-sm"
                maxLength={200}
              />
              <button type="submit" className="btn btn-primary btn-sm px-3">
                Send
              </button>
            </form>
            </div>
          </div>
        </div>
      </div>
      
      {/* Celebration Effects */}
      <Confetti active={showConfetti} duration={3000} />
      <FlyingAnimal active={showFlyingAnimal} duration={3000} />
      
    </div>
  );
}