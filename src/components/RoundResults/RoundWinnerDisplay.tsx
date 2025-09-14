import React, { useState, useEffect } from 'react';
import { GameState } from '../../../packages/common/src/types/game';

interface ScoreData {
  knockerScore: number;
  opponentScore: number;
  knockerDeadwood: number;
  opponentDeadwoodBefore: number;
  opponentDeadwoodAfter: number;
  layOffValue: number;
  isUndercut: boolean;
  isGin: boolean;
}

interface RoundWinnerDisplayProps {
  scoreData: ScoreData;
  knockerName: string;
  opponentName: string;
  gameState: GameState;
  currentPlayerId?: string;
  onContinue: () => void;
  onRefreshGameState?: () => void;
}

export const RoundWinnerDisplay: React.FC<RoundWinnerDisplayProps> = ({
  scoreData,
  knockerName,
  opponentName,
  gameState,
  currentPlayerId,
  onContinue,
  onRefreshGameState,
}) => {
  const [showConfetti, setShowConfetti] = useState(false);
  const [animationPhase, setAnimationPhase] = useState<'enter' | 'celebrate' | 'ready'>('enter');
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [isStartingNewRound, setIsStartingNewRound] = useState(false);

  const winner = scoreData.knockerScore > scoreData.opponentScore ? 'knocker' : 
                 scoreData.opponentScore > scoreData.knockerScore ? 'opponent' : 'tie';

  const winnerName = winner === 'knocker' ? knockerName : winner === 'opponent' ? opponentName : null;

  // Check if game has ended (player reached winning score, typically 100)
  const gameHasEnded = gameState.gameOver || gameState.status === 'FINISHED' || 
    gameState.players.some(player => player.score >= 100);

  // Debug logging for game end detection
  console.log('🏁 Game End Check:', {
    gameOver: gameState.gameOver,
    status: gameState.status,
    playerScores: gameState.players.map(p => ({ id: p.id, username: p.username, score: p.score })),
    gameHasEnded,
    scoreData: scoreData
  });

  useEffect(() => {
    // Animation sequence
    const timer1 = setTimeout(() => {
      setAnimationPhase('celebrate');
      setShowConfetti(true);
    }, 500);
    
    const timer2 = setTimeout(() => {
      setShowConfetti(false);
      setAnimationPhase('ready');
      // Start countdown for next round (only if game hasn't ended)
      if (!gameHasEnded) {
        setCountdownSeconds(10); // 10 second countdown
      }
    }, 3000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [gameHasEnded]);

  // Countdown effect
  useEffect(() => {
    if (countdownSeconds === null) return;

    if (countdownSeconds === 0) {
      // Start new round automatically and close modal immediately
      handleStartNewRound();
      // Close modal right away - don't wait for game state change
      onContinue();
      return;
    }

    const countdownTimer = setTimeout(() => {
      setCountdownSeconds(prev => prev! - 1);
    }, 1000);

    return () => clearTimeout(countdownTimer);
  }, [countdownSeconds]);

  const handleStartNewRound = async () => {
    if (gameHasEnded) {
      onContinue();
      return;
    }

    setIsStartingNewRound(true);
    try {
      // Use existing move API with START_NEW_ROUND type
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`/api/games/${gameState.id}/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          type: 'START_NEW_ROUND',
          playerId: currentPlayerId || 'system'
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start next round');
      }

      console.log('✅ Started next round automatically');
      
      // Trigger game state refresh
      if (onRefreshGameState) {
        onRefreshGameState();
      }
    } catch (error) {
      console.error('❌ Failed to start next round:', error);
      setIsStartingNewRound(false);
    }
  };

  const getWinnerMessage = () => {
    if (scoreData.isGin) {
      return {
        primary: '🎯 GIN VICTORY!',
        secondary: `${knockerName} achieved Gin with zero deadwood!`,
        color: 'text-yellow-500'
      };
    }
    
    if (scoreData.isUndercut) {
      return {
        primary: '⚡ UNDERCUT!',
        secondary: `${opponentName} defended successfully and wins!`,
        color: 'text-purple-500'
      };
    }
    
    if (winner === 'knocker') {
      return {
        primary: '👊 KNOCK VICTORY!',
        secondary: `${knockerName} wins the round!`,
        color: 'text-blue-500'
      };
    }
    
    if (winner === 'opponent') {
      return {
        primary: '🛡️ DEFENSE WINS!',
        secondary: `${opponentName} wins the round!`,
        color: 'text-purple-500'
      };
    }
    
    return {
      primary: '🤝 TIE ROUND!',
      secondary: 'Both players scored equally!',
      color: 'text-gray-500'
    };
  };

  const message = getWinnerMessage();

  return (
    <div className="relative text-center space-y-6 py-8">
      {/* Confetti Effect */}
      {showConfetti && winner !== 'tie' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `-10px`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            >
              {['🎉', '🎊', '⭐', '✨', '🏆'][Math.floor(Math.random() * 5)]}
            </div>
          ))}
        </div>
      )}

      {/* Winner Announcement */}
      <div className={`space-y-4 transition-all duration-1000 ${
        animationPhase === 'enter' ? 'opacity-0 transform scale-75' : 
        animationPhase === 'celebrate' ? 'opacity-100 transform scale-110 animate-pulse' :
        'opacity-100 transform scale-100'
      }`}>
        <div className={`text-4xl font-bold ${message.color} drop-shadow-lg`}>
          {message.primary}
        </div>
        <div className="text-lg text-gray-700">
          {message.secondary}
        </div>
      </div>

      {/* Score Summary */}
      <div className={`bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 space-y-4 transition-all duration-700 ${
        animationPhase === 'ready' ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'
      }`}>
        <h4 className="text-lg font-semibold text-gray-800">Round Summary</h4>
        
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg ${
            scoreData.knockerScore > 0 ? 'bg-green-100 border border-green-200' : 'bg-gray-100'
          }`}>
            <div className="font-medium text-gray-700">{knockerName}</div>
            <div className={`text-2xl font-bold ${
              scoreData.knockerScore > 0 ? 'text-green-600' : 'text-gray-500'
            }`}>
              +{scoreData.knockerScore}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {scoreData.isGin ? 'Gin Bonus' : 'Knock Score'}
            </div>
          </div>

          <div className={`p-4 rounded-lg ${
            scoreData.opponentScore > 0 ? 'bg-green-100 border border-green-200' : 'bg-gray-100'
          }`}>
            <div className="font-medium text-gray-700">{opponentName}</div>
            <div className={`text-2xl font-bold ${
              scoreData.opponentScore > 0 ? 'text-green-600' : 'text-gray-500'
            }`}>
              +{scoreData.opponentScore}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {scoreData.isUndercut ? 'Undercut Bonus' : scoreData.layOffValue > 0 ? 'After Lay-offs' : 'Defense Score'}
            </div>
          </div>
        </div>

        {/* Additional Details */}
        <div className="pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Deadwood:</span>
              <span className="ml-2 font-medium">{scoreData.knockerDeadwood} vs {scoreData.opponentDeadwoodAfter}</span>
            </div>
            {scoreData.layOffValue > 0 && (
              <div>
                <span className="text-gray-600">Laid Off:</span>
                <span className="ml-2 font-medium text-green-600">-{scoreData.layOffValue} points</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Motivational Message */}
      <div className={`text-center space-y-2 transition-all duration-1000 ${
        animationPhase === 'ready' ? 'opacity-100' : 'opacity-0'
      }`}>
        {winner === 'knocker' && scoreData.isGin && (
          <div className="text-yellow-600 font-medium">Perfect hand! Master of Gin Rummy! 🎯</div>
        )}
        {winner === 'opponent' && scoreData.isUndercut && (
          <div className="text-purple-600 font-medium">Excellent defense! Great undercut! ⚡</div>
        )}
        {winner === 'knocker' && !scoreData.isGin && (
          <div className="text-blue-600 font-medium">Well played knock! Strategic victory! 👊</div>
        )}
        {winner === 'opponent' && !scoreData.isUndercut && scoreData.layOffValue > 0 && (
          <div className="text-purple-600 font-medium">Smart lay-offs helped secure the win! 🛡️</div>
        )}
        {winner === 'tie' && (
          <div className="text-gray-600 font-medium">Evenly matched! Both played excellently! 🤝</div>
        )}
      </div>

      {/* Countdown Display - only show if waiting for next round */}
      {!gameHasEnded && countdownSeconds !== null && (
        <div className={`text-center space-y-4 transition-all duration-1000 ${
          animationPhase === 'ready' ? 'opacity-100' : 'opacity-0'
        }`}>
          <div className="flex flex-col items-center space-y-3">
            <h4 className="text-lg font-semibold text-gray-800">Next Round Starting In</h4>
            
            <div className="flex items-center justify-center">
              <div className={`text-7xl font-bold rounded-full w-32 h-32 flex items-center justify-center transition-all duration-300 border-4 ${
                countdownSeconds <= 3 
                  ? 'bg-red-100 text-red-600 border-red-300 animate-pulse scale-110' 
                  : countdownSeconds <= 5
                  ? 'bg-yellow-100 text-yellow-600 border-yellow-300'
                  : 'bg-blue-100 text-blue-600 border-blue-300'
              }`}>
                {countdownSeconds}
              </div>
            </div>
            
            <div className="text-sm text-gray-600">
              {countdownSeconds > 5 ? 'Review your results and get ready...' : 
               countdownSeconds > 1 ? 'Next round starting soon!' : 'Starting now...'}
            </div>
          </div>
        </div>
      )}

      {/* Continue Button */}
      <div className={`pt-4 transition-all duration-1000 ${
        animationPhase === 'ready' ? 'opacity-100 transform scale-100' : 'opacity-0 transform scale-75'
      }`}>
        {/* Only show button for game end or manual override */}
        {gameHasEnded && (
          <button
            onClick={onContinue}
            className="px-8 py-4 font-bold text-white rounded-xl shadow-lg transform transition-all duration-300 hover:scale-105 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
          >
            Return to Lobby
          </button>
        )}
        
        {/* Manual override button for countdown (optional) */}
        {!gameHasEnded && countdownSeconds !== null && countdownSeconds > 1 && (
          <button
            onClick={handleStartNewRound}
            disabled={isStartingNewRound}
            className={`px-6 py-3 font-medium text-white rounded-lg shadow transform transition-all duration-300 hover:scale-105 ${
              isStartingNewRound 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
            }`}
          >
            {isStartingNewRound ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Starting...</span>
              </div>
            ) : (
              'Start Now'
            )}
          </button>
        )}
      </div>
    </div>
  );
};