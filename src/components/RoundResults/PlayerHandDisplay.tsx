import React from 'react';
import { Card, Meld, PlayerState } from '../../../packages/common/src/types/game';
import { Card as CardComponent } from '../ui/Card';
import { calculateDeadwood } from '../../../packages/common/src/utils/scoring';

interface PlayerHandDisplayProps {
  player: PlayerState;
  melds: Meld[];
  phase: 'reveal' | 'layoff' | 'scoring' | 'celebration';
  isKnocker: boolean;
  isAnimating?: boolean;
}

export const PlayerHandDisplay: React.FC<PlayerHandDisplayProps> = ({
  player,
  melds,
  phase,
  isKnocker,
  isAnimating = false,
}) => {
  // Handle legacy data issue where old knock events don't have proper hand/meld data
  // If this is a knocker with empty hand but should have deadwood, create mock data
  const handForDeadwood = player.hand;
  
  let deadwoodCards: Card[] = [];
  let meldsToDisplay = melds;
  
  // Handle the hand properly - we might need to exclude the discarded card
  let handAfterDiscard = handForDeadwood;
  
  if (isKnocker && handForDeadwood.length > 0) {
    // For knocker, use the hand as-is since it should already be after discard
    console.log('🔧 Knocker hand:', handForDeadwood.length, 'cards');
    handAfterDiscard = handForDeadwood;
  } else if (isKnocker && handForDeadwood.length === 0) {
    // Legacy data - knocker has empty hand due to old event format
    console.log('🔧 Legacy data fix: Knocker has empty hand, deadwood:', player.deadwood);
    
    if (player.deadwood === 0) {
      // Knocker went Gin - no deadwood to show
      deadwoodCards = [];
      console.log('🔧 Knocker went Gin - no deadwood cards to display');
    } else {
      // Create mock deadwood cards based on deadwood points
      console.log('🔧 Creating mock deadwood cards for knocker');
      
      const mockDeadwoodValue = player.deadwood;
      const mockCards: Card[] = [];
      
      if (mockDeadwoodValue === 1) {
        // Likely one Ace
        mockCards.push({ id: 'mock_ace', rank: 'A' as Card['rank'], suit: 'spades' as Card['suit'] });
      } else if (mockDeadwoodValue <= 10) {
        // Single card
        const rank = mockDeadwoodValue.toString() as Card['rank'];
        mockCards.push({ id: 'mock_card', rank, suit: 'spades' as Card['suit'] });
      } else {
        // Multiple cards - distribute the value
        let remaining = mockDeadwoodValue;
        let cardCount = 0;
        while (remaining > 0 && cardCount < 10) {
          const cardValue = Math.min(remaining, 10);
          const rank = cardValue === 1 ? 'A' as Card['rank'] : cardValue.toString() as Card['rank'];
          mockCards.push({ id: `mock_card_${cardCount}`, rank, suit: 'spades' as Card['suit'] });
          remaining -= cardValue;
          cardCount++;
        }
      }
      
      deadwoodCards = mockCards;
      console.log(`🔧 Created ${mockCards.length} mock deadwood cards totaling ${mockDeadwoodValue} points`);
    }
  }
  
  if (deadwoodCards.length === 0) {
    // Normal case - calculate deadwood from hand after discard
    deadwoodCards = getDeadwoodCards(handAfterDiscard, melds);
  }
  
  // For meld display, use the provided melds
  const handToDisplay = handForDeadwood;
  
  return (
    <div className="space-y-4">
      {/* Melds Section */}
      {melds.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700">Melds</div>
          <div className="space-y-2">
            {melds.map((meld, index) => (
              <MeldDisplay
                key={index}
                meld={meld}
                phase={phase}
                isKnocker={isKnocker}
                meldIndex={index}
                isAnimating={isAnimating}
              />
            ))}
          </div>
        </div>
      )}

      {/* Deadwood Section */}
      {deadwoodCards.length > 0 && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-gray-700">
            Deadwood ({deadwoodCards.reduce((sum, card) => sum + getCardValue(card), 0)} pts)
          </div>
          <div className="flex flex-wrap gap-1">
            {deadwoodCards.map((card, index) => (
              <div
                key={card.id}
                className={`transform transition-all duration-700 ${
                  isAnimating
                    ? 'translate-y-0 opacity-100' 
                    : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <CardComponent
                  card={card}
                  className="w-16 h-20 border-2 border-red-200"
                />
                <div className="text-xs text-center mt-1 text-red-600">
                  {getCardValue(card)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

interface MeldDisplayProps {
  meld: Meld;
  phase: string;
  isKnocker: boolean;
  meldIndex: number;
  isAnimating?: boolean;
}

const MeldDisplay: React.FC<MeldDisplayProps> = ({
  meld,
  phase,
  isKnocker,
  meldIndex,
  isAnimating = false,
}) => {
  return (
    <div className="relative">
      {/* Meld Type Badge */}
      <div className={`absolute -top-2 -left-2 z-10 px-2 py-1 rounded text-xs font-bold ${
        meld.type === 'set' 
          ? 'bg-blue-100 text-blue-700' 
          : 'bg-green-100 text-green-700'
      }`}>
        {meld.type === 'set' ? 'SET' : 'RUN'}
      </div>

      {/* Cards */}
      <div className={`flex space-x-1 p-3 rounded-lg border-2 ${
        isKnocker 
          ? 'border-blue-200 bg-blue-50' 
          : 'border-purple-200 bg-purple-50'
      } ${
        phase === 'layoff' && isKnocker 
          ? 'ring-2 ring-yellow-300 shadow-lg' 
          : ''
      }`}>
        {meld.cards.map((card, cardIndex) => (
          <div
            key={card.id}
            className={`transform transition-all duration-700 ${
              isAnimating
                ? 'translate-y-0 opacity-100 scale-100' 
                : 'translate-y-4 opacity-0 scale-95'
            }`}
            style={{ 
              transitionDelay: `${(meldIndex * 200) + (cardIndex * 150)}ms` 
            }}
          >
            <CardComponent
              card={card}
              className="w-16 h-20"
            />
          </div>
        ))}
      </div>

      {/* Lay-off Drop Zone (for knocker melds during lay-off phase) */}
      {phase === 'layoff' && isKnocker && (
        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-8 h-8 bg-yellow-200 border-2 border-dashed border-yellow-400 rounded opacity-60 flex items-center justify-center">
          <span className="text-xs">+</span>
        </div>
      )}
    </div>
  );
};

// Helper functions
function getDeadwoodCards(hand: Card[], melds: Meld[]): Card[] {
  const meldedCardIds = new Set(
    melds.flatMap(meld => meld.cards.map(card => card.id))
  );
  return hand.filter(card => !meldedCardIds.has(card.id));
}

function getCardValue(card: Card): number {
  switch (card.rank) {
    case 'A': return 1;
    case '2': return 2;
    case '3': return 3;
    case '4': return 4;
    case '5': return 5;
    case '6': return 6;
    case '7': return 7;
    case '8': return 8;
    case '9': return 9;
    case '10': return 10;
    case 'J': return 10;
    case 'Q': return 10;
    case 'K': return 10;
    default: return 0;
  }
}