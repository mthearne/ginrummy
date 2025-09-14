import React, { useState, useEffect } from 'react';
import { Card, Meld, GameState } from '../../../packages/common/src/types/game';
import { calculateScoreWithLayOffs, calculateDeadwood } from '../../../packages/common/src/utils/scoring';
import { getCardValue } from '../../../packages/common/src/utils/cards';
import { PlayerHandDisplay } from './PlayerHandDisplay';
import { LayoffInterface } from './LayoffInterface';
import { ScoreCalculator } from './ScoreCalculator';
import { RoundWinnerDisplay } from './RoundWinnerDisplay';

interface RoundResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  gameState: GameState;
  knockerPlayerId: string;
  knockerMelds: Meld[];
  layOffs?: Array<{ cards: Card[]; targetMeld: Meld }>; // Optional - will be calculated dynamically
  currentPlayerId?: string; // ID of the player viewing the modal
  onContinue: () => void;
  onRefreshGameState?: () => void; // Callback to refresh game state
}

type RoundPhase = 'reveal' | 'layoff' | 'scoring' | 'celebration';

export const RoundResultsModal: React.FC<RoundResultsModalProps> = ({
  isOpen,
  onClose,
  gameState,
  knockerPlayerId,
  knockerMelds,
  layOffs: providedLayOffs,
  currentPlayerId,
  onContinue,
  onRefreshGameState,
}) => {
  const [phase, setPhase] = useState<RoundPhase>('reveal');
  const [appliedLayOffs, setAppliedLayOffs] = useState<Array<{ cards: Card[]; targetMeld: Meld }>>([]);
  const [showScoreBreakdown, setShowScoreBreakdown] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  const knocker = gameState.players.find(p => p.id === knockerPlayerId);
  const opponent = gameState.players.find(p => p.id !== knockerPlayerId);

  if (!knocker || !opponent) return null;

  // Check if LayoffInterface should be shown (defending player in PvP game)
  const shouldShowLayoffInterface = phase === 'layoff' && !gameState.vsAI && currentPlayerId && opponent.id === currentPlayerId;

  // Calculate available layoffs dynamically from game state
  const availableLayOffs = React.useMemo(() => {
    if (providedLayOffs) {
      return providedLayOffs; // Use provided layoffs if available
    }
    
    // Calculate available layoffs from opponent's deadwood cards
    return calculateAvailableLayoffs(opponent.hand, opponent.melds || [], knockerMelds);
  }, [opponent.hand, opponent.melds, knockerMelds, providedLayOffs]);

  // Calculate scores with current lay-offs
  // Use the knocker's hand as-is since it should already be after discard
  let scoreData = calculateScoreWithLayOffs(
    knocker.hand,
    knockerMelds,
    opponent.hand,
    opponent.melds,
    appliedLayOffs
  );

  // If the game state has final round scores (from layoff completion), use those instead
  if (gameState.roundScores && (phase === 'celebration' || gameState.phase === 'round_over')) {
    console.log('🎯 Using final round scores from game state:', gameState.roundScores);
    
    const knockerFinalScore = gameState.roundScores.knocker || 0;
    const opponentFinalScore = gameState.roundScores.opponent || 0;
    
    scoreData = {
      ...scoreData,
      knockerScore: knockerFinalScore,
      opponentScore: opponentFinalScore
    };
    
    console.log('🎯 Updated scoreData with final scores:', scoreData);
  }

  useEffect(() => {
    if (isOpen) {
      // Reset state when modal opens
      setPhase('reveal');
      setAppliedLayOffs([]);
      setShowScoreBreakdown(false);
      setIsAnimating(false);

      // Start animation after a brief delay to ensure DOM is ready
      const startAnimation = setTimeout(() => setIsAnimating(true), 100);
      
      // Auto-progress through phases - no AI-specific logic needed
      const timer1 = setTimeout(() => setPhase('layoff'), 2000);
      
      // Fallback timer for AI games - if stuck in layoff phase too long, auto-advance
      const fallbackTimer = gameState.vsAI ? setTimeout(() => {
        console.log('🎭 Modal: Fallback timer triggered - AI took too long, auto-advancing to scoring');
        if (phase === 'layoff') {
          setPhase('scoring');
          setTimeout(() => setShowScoreBreakdown(true), 500);
          setTimeout(() => setPhase('celebration'), 2500);
        }
      }, 5000) : null; // 5 seconds fallback for AI games
      
      return () => {
        clearTimeout(startAnimation);
        clearTimeout(timer1);
        if (fallbackTimer) clearTimeout(fallbackTimer);
      };
    } else {
      // Reset when modal closes
      setIsAnimating(false);
    }
  }, [isOpen]);

  // Auto-advance when game phase changes from layoff to round_over (AI completed layoff decision)
  useEffect(() => {
    console.log('🎭 Modal: Auto-advance check - isOpen:', isOpen, 'gamePhase:', gameState.phase, 'modalPhase:', phase);
    
    if (isOpen && gameState.phase === 'round_over' && phase === 'layoff') {
      console.log('🎭 Modal: Game transitioned to round_over, auto-advancing modal from layoff to scoring');
      
      // Use any layoffs from the game state if available
      if (gameState.lastLayOffs && gameState.lastLayOffs.length > 0) {
        console.log('🎭 Modal: Applying layoffs from game state:', gameState.lastLayOffs);
        setAppliedLayOffs(gameState.lastLayOffs);
      } else {
        console.log('🎭 Modal: No layoffs found in game state');
      }
      
      // Advance to scoring phase
      setPhase('scoring');
      
      // Show score breakdown after a short delay
      setTimeout(() => {
        console.log('🎭 Modal: Showing score breakdown');
        setShowScoreBreakdown(true);
      }, 500);
      
      // Move to celebration after score animation
      setTimeout(() => {
        console.log('🎭 Modal: Moving to celebration phase');
        setPhase('celebration');
      }, 2500);
    }
  }, [gameState.phase, phase, isOpen, gameState.lastLayOffs]);

  // Auto-close modal when new round starts (only when phase changes to active gameplay phases)
  useEffect(() => {
    if (isOpen && (gameState.phase === 'draw' || gameState.phase === 'upcard_decision' || gameState.phase === 'discard')) {
      console.log('🎭 Modal: New round detected (active phase), closing modal');
      onClose();
    }
  }, [gameState.phase, isOpen, onClose]);

  const handleLayOffComplete = async (layOffs: Array<{ cards: Card[]; targetMeld: Meld }>) => {
    console.log('🎭 Modal: Player completed layoffs, sending to API');
    
    try {
      // Call the layoff API endpoint to synchronize both players
      const response = await fetch(`/api/games/${gameState.id}/layoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          layOffs: layOffs
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit layoffs');
      }

      console.log('🎭 Modal: Layoffs submitted successfully');
      
      // Update local state and UI
      setAppliedLayOffs(layOffs);
      setPhase('scoring');
      
      // Refresh game state to get final scores and game over status
      if (onRefreshGameState) {
        console.log('🔄 Refreshing game state after layoff completion');
        onRefreshGameState();
      }
      
      // Show score breakdown after a short delay
      setTimeout(() => setShowScoreBreakdown(true), 500);
      
      // Move to celebration after score animation (with extra delay for refresh)
      setTimeout(() => setPhase('celebration'), 4000);
    } catch (error) {
      console.error('🎭 Modal: Failed to submit layoffs:', error);
      // Still update UI even if API call fails for better UX
      setAppliedLayOffs(layOffs);
      setPhase('scoring');
      
      // Still try to refresh game state
      if (onRefreshGameState) {
        console.log('🔄 Refreshing game state after layoff error (fallback)');
        onRefreshGameState();
      }
      
      setTimeout(() => setShowScoreBreakdown(true), 500);
      setTimeout(() => setPhase('celebration'), 4000);
    }
  };

  const handleSkipLayOff = async () => {
    console.log('🎭 Modal: Player skipped layoffs, sending to API');
    
    try {
      // Call the layoff API endpoint with empty layoffs to synchronize both players
      const response = await fetch(`/api/games/${gameState.id}/layoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          layOffs: []
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to submit skip layoffs');
      }

      console.log('🎭 Modal: Skip layoffs submitted successfully');
      
      // Update local state and UI
      setPhase('scoring');
      setTimeout(() => setShowScoreBreakdown(true), 500);
      setTimeout(() => setPhase('celebration'), 2000);
    } catch (error) {
      console.error('🎭 Modal: Failed to submit skip layoffs:', error);
      // Still update UI even if API call fails for better UX
      setPhase('scoring');
      setTimeout(() => setShowScoreBreakdown(true), 500);
      setTimeout(() => setPhase('celebration'), 2000);
    }
  };

  const handleContinue = () => {
    onClose();
    onContinue();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl max-h-[95vh] w-full overflow-y-auto">
        <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            Round Results
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-xl"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
          {/* Knocker Side */}
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-blue-600">
                {knocker.id === currentPlayerId ? 'You' : knocker.username}
              </h3>
              <div className="text-sm text-gray-600">
                {scoreData.isGin ? '🎯 GIN!' : '👊 KNOCKED'}
              </div>
            </div>
            
            <PlayerHandDisplay
              player={knocker}
              melds={knockerMelds}
              phase={phase}
              isKnocker={true}
              isAnimating={isAnimating}
            />
            
            <div className="text-center text-sm">
              <div className="text-gray-600">Deadwood</div>
              <div className={`text-lg font-bold ${
                scoreData.knockerDeadwood === 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {scoreData.knockerDeadwood} points
              </div>
            </div>
          </div>

          {/* Center - Score Calculator */}
          <div className="flex flex-col justify-center">
            <ScoreCalculator
              scoreData={scoreData}
              showBreakdown={showScoreBreakdown}
              phase={phase}
            />
          </div>

          {/* Opponent Side */}
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-purple-600">
                {opponent.id === currentPlayerId ? 'You' : opponent.username}
              </h3>
              <div className="text-sm text-gray-600">Defending</div>
            </div>
            
            <PlayerHandDisplay
              player={opponent}
              melds={opponent.melds}
              phase={phase}
              isKnocker={false}
              isAnimating={isAnimating}
            />
            
            <div className="text-center text-sm">
              <div className="text-gray-600">Deadwood</div>
              <div className="flex flex-col items-center space-y-1">
                {appliedLayOffs.length > 0 ? (
                  <>
                    <div className="line-through text-gray-400">
                      {scoreData.opponentDeadwoodBefore} points
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      {scoreData.opponentDeadwoodAfter} points
                      <div className="text-xs text-gray-600">
                        (-{scoreData.layOffValue} laid off)
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-lg font-bold text-red-600">
                    {scoreData.opponentDeadwoodBefore} points
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Lay-off Interface - only show to human opponent (defending player), not in AI games */}
        {shouldShowLayoffInterface && (
          <div className="mt-6 border-t pt-4">
            <LayoffInterface
              opponentHand={opponent.hand}
              opponentMelds={opponent.melds}
              knockerMelds={knockerMelds}
              availableLayOffs={availableLayOffs}
              onLayOffComplete={handleLayOffComplete}
              onSkip={handleSkipLayOff}
            />
          </div>
        )}
        
        {/* Status message when not showing lay-off interface */}
        {phase === 'layoff' && !shouldShowLayoffInterface && (
          <div className="mt-6 border-t pt-4 text-center">
            <div className="text-gray-600 mb-4">
              <span>
                {gameState.vsAI 
                  ? `${opponent.username} is considering lay-offs...` 
                  : 'Waiting for opponent to lay off cards...'
                }
              </span>
            </div>
            {/* Debug: Manual skip button for AI games */}
            {gameState.vsAI && (
              <button
                onClick={() => {
                  console.log('🎭 Modal: Manual skip clicked, advancing to scoring');
                  setPhase('scoring');
                  setTimeout(() => setShowScoreBreakdown(true), 500);
                  setTimeout(() => setPhase('celebration'), 2500);
                }}
                className="mt-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm"
              >
                Skip AI Decision (Debug)
              </button>
            )}
          </div>
        )}

        {/* Winner Display */}
        {phase === 'celebration' && (
          <div className="mt-6 border-t pt-4">
            <RoundWinnerDisplay
              scoreData={scoreData}
              knockerName={knocker.username}
              opponentName={opponent.username}
              gameState={gameState}
              currentPlayerId={currentPlayerId}
              onContinue={handleContinue}
              onRefreshGameState={onRefreshGameState}
            />
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

// Helper function to calculate available layoffs dynamically
function calculateAvailableLayoffs(
  opponentHand: Card[], 
  opponentMelds: Meld[], 
  knockerMelds: Meld[]
): Array<{ cards: Card[]; targetMeld: Meld }> {
  const layoffs: Array<{ cards: Card[]; targetMeld: Meld }> = [];
  
  // Get deadwood cards (cards not in opponent's melds)
  const meldedCardIds = new Set(
    opponentMelds.flatMap(meld => meld.cards.map(card => card.id))
  );
  const deadwoodCards = opponentHand.filter(card => !meldedCardIds.has(card.id));
  
  // Try each deadwood card against each knocker meld
  for (const card of deadwoodCards) {
    for (const meld of knockerMelds) {
      if (canLayOffOnMeld(card, meld)) {
        // Check if we already have a layoff for this meld
        const existingLayoff = layoffs.find(lo => 
          lo.targetMeld.cards[0].id === meld.cards[0].id
        );
        
        if (existingLayoff) {
          existingLayoff.cards.push(card);
        } else {
          layoffs.push({
            cards: [card],
            targetMeld: meld
          });
        }
      }
    }
  }
  
  return layoffs;
}

// Helper function to check if a card can be laid off on a specific meld
function canLayOffOnMeld(card: Card, meld: Meld): boolean {
  if (meld.type === 'set') {
    // For sets: card must have same rank as the set
    return card.rank === meld.cards[0].rank;
  } else {
    // For runs: card must extend the sequence and be same suit
    const meldSuit = meld.cards[0].suit;
    if (card.suit !== meldSuit) return false;
    
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const meldRanks = meld.cards.map(c => ranks.indexOf(c.rank)).sort((a, b) => a - b);
    const cardRank = ranks.indexOf(card.rank);
    
    // Card must extend either end of the run (not middle)
    const canExtendLow = cardRank === meldRanks[0] - 1 && cardRank >= 0;
    const canExtendHigh = cardRank === meldRanks[meldRanks.length - 1] + 1 && cardRank < ranks.length;
    
    return canExtendLow || canExtendHigh;
  }
}