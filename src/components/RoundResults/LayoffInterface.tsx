import React, { useState, useEffect } from 'react';
import { Card, Meld } from '../../../packages/common/src/types/game';
import { Card as CardComponent } from '../ui/Card';
import { getCardValue } from '../../../packages/common/src/utils/cards';

interface LayoffInterfaceProps {
  opponentHand: Card[];
  opponentMelds: Meld[];
  knockerMelds: Meld[];
  availableLayOffs: Array<{ cards: Card[]; targetMeld: Meld }>;
  onLayOffComplete: (layOffs: Array<{ cards: Card[]; targetMeld: Meld }>) => void;
  onSkip: () => void;
}

interface DraggedCard {
  card: Card;
  sourceType: 'deadwood';
  sourceIndex: number;
}

export const LayoffInterface: React.FC<LayoffInterfaceProps> = ({
  opponentHand,
  opponentMelds,
  knockerMelds,
  availableLayOffs,
  onLayOffComplete,
  onSkip,
}) => {
  const [selectedLayOffs, setSelectedLayOffs] = useState<Array<{ cards: Card[]; targetMeld: Meld }>>([]);
  const [draggedCard, setDraggedCard] = useState<DraggedCard | null>(null);
  const [dropZoneHighlight, setDropZoneHighlight] = useState<string | null>(null);
  const [animationPhase, setAnimationPhase] = useState<'enter' | 'ready' | 'applying'>('enter');
  const [invalidDropAnimation, setInvalidDropAnimation] = useState<string | null>(null);

  // Get deadwood cards (cards not in opponent's melds)
  const meldedCardIds = new Set(opponentMelds.flatMap(meld => meld.cards.map(card => card.id)));
  const deadwoodCards = opponentHand.filter(card => !meldedCardIds.has(card.id));

  // Get available deadwood cards that can be laid off (excluding already selected)
  const selectedCardIds = new Set(selectedLayOffs.flatMap(layOff => layOff.cards.map(card => card.id)));
  const availableDeadwood = deadwoodCards.filter(card => !selectedCardIds.has(card.id));

  useEffect(() => {
    // Animation sequence
    const timer1 = setTimeout(() => setAnimationPhase('ready'), 1000);
    return () => clearTimeout(timer1);
  }, []);

  const handleDragStart = (card: Card, sourceType: 'deadwood', sourceIndex: number) => {
    setDraggedCard({ card, sourceType, sourceIndex });
  };

  const handleDragEnd = () => {
    setDraggedCard(null);
    setDropZoneHighlight(null);
  };

  const handleDragOver = (e: React.DragEvent, meldId: string) => {
    e.preventDefault();
    if (draggedCard && canLayOffOnMeld(draggedCard.card, getMeldById(meldId))) {
      setDropZoneHighlight(meldId);
    }
  };

  const handleDragLeave = () => {
    setDropZoneHighlight(null);
  };

  const handleDrop = (e: React.DragEvent, targetMeldId: string) => {
    e.preventDefault();
    setDropZoneHighlight(null);

    if (!draggedCard) return;

    const targetMeld = getMeldById(targetMeldId);
    if (!targetMeld || !canLayOffOnMeld(draggedCard.card, targetMeld)) {
      // Show invalid drop animation
      setInvalidDropAnimation(targetMeldId);
      setTimeout(() => setInvalidDropAnimation(null), 600);
      return;
    }

    // Add to selected lay-offs
    const existingLayOff = selectedLayOffs.find(layOff => 
      layOff.targetMeld.cards[0].id === targetMeld.cards[0].id
    );

    if (existingLayOff) {
      // Add to existing lay-off
      setSelectedLayOffs(prev => prev.map(layOff =>
        layOff.targetMeld.cards[0].id === targetMeld.cards[0].id
          ? { ...layOff, cards: [...layOff.cards, draggedCard.card] }
          : layOff
      ));
    } else {
      // Create new lay-off
      setSelectedLayOffs(prev => [
        ...prev,
        { cards: [draggedCard.card], targetMeld }
      ]);
    }

    setDraggedCard(null);
  };

  const getMeldById = (meldId: string): Meld | null => {
    return knockerMelds.find(meld => meld.cards[0].id === meldId) || null;
  };

  const canLayOffOnMeld = (card: Card, meld: Meld | null): boolean => {
    if (!meld) return false;
    
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
  };

  const handleRemoveFromLayOff = (card: Card, targetMeld: Meld) => {
    setSelectedLayOffs(prev => 
      prev.map(layOff => 
        layOff.targetMeld.cards[0].id === targetMeld.cards[0].id
          ? { ...layOff, cards: layOff.cards.filter(c => c.id !== card.id) }
          : layOff
      ).filter(layOff => layOff.cards.length > 0)
    );
  };

  const handleApplyLayOffs = () => {
    setAnimationPhase('applying');
    setTimeout(() => onLayOffComplete(selectedLayOffs), 1000);
  };

  const handleSkip = () => {
    onSkip();
  };

  const totalLayOffValue = selectedLayOffs.reduce((total, layOff) => 
    total + layOff.cards.reduce((cardTotal, card) => cardTotal + getCardValue(card), 0), 0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-800">Lay Off Cards</h3>
        <p className="text-sm text-gray-600 mt-1">
          Drag your deadwood cards to the knocker's melds to reduce your score
        </p>
        {selectedLayOffs.length > 0 && (
          <div className="mt-2 text-green-600 font-medium">
            Laying off {totalLayOffValue} points worth of cards
          </div>
        )}
      </div>

      {/* Available Deadwood Cards */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-gray-700">Your Deadwood Cards (Drag to lay off)</div>
        <div className={`flex flex-wrap gap-2 min-h-[80px] p-3 border-2 border-dashed rounded-lg transition-all duration-700 ${
          availableDeadwood.length > 0 ? 'border-orange-300 bg-orange-50' : 'border-gray-300 bg-gray-50'
        } ${
          animationPhase === 'ready' ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'
        }`}>
          {availableDeadwood.length > 0 ? (
            availableDeadwood.map((card, index) => (
              <div
                key={card.id}
                draggable
                onDragStart={() => handleDragStart(card, 'deadwood', index)}
                onDragEnd={handleDragEnd}
                className={`cursor-move transform transition-all duration-300 hover:scale-105 ${
                  draggedCard?.card.id === card.id ? 'opacity-50 scale-95' : ''
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <CardComponent
                  card={card}
                  className="w-16 h-20 border-2 border-red-200"
                />
                <div className="text-xs text-center mt-1 text-red-600">
                  {getCardValue(card)} pts
                </div>
              </div>
            ))
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              {selectedLayOffs.length > 0 ? 'All available cards selected!' : 'No cards available to lay off'}
            </div>
          )}
        </div>
      </div>

      {/* Knocker's Melds (Drop Zones) */}
      <div className="space-y-3">
        <div className="text-sm font-medium text-gray-700">Knocker's Melds</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {knockerMelds.map((meld, index) => {
            const meldId = meld.cards[0].id;
            const isHighlighted = dropZoneHighlight === meldId;
            const layOff = selectedLayOffs.find(lo => lo.targetMeld.cards[0].id === meldId);
            
            return (
              <div
                key={meldId}
                onDragOver={(e) => handleDragOver(e, meldId)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, meldId)}
                className={`relative p-4 border-2 rounded-lg transition-all duration-300 ${
                  isHighlighted
                    ? 'border-yellow-400 bg-yellow-50 shadow-lg scale-105'
                    : 'border-blue-200 bg-blue-50'
                } ${
                  animationPhase === 'ready' ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-4'
                } ${
                  invalidDropAnimation === meldId ? 'animate-pulse bg-red-100 border-red-300' : ''
                }`}
                style={{ transitionDelay: `${index * 200}ms` }}
              >
                {/* Meld Type Badge */}
                <div className={`absolute -top-2 -left-2 z-10 px-2 py-1 rounded text-xs font-bold ${
                  meld.type === 'set' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-green-100 text-green-700'
                }`}>
                  {meld.type === 'set' ? 'SET' : 'RUN'}
                </div>

                {/* Original Meld Cards */}
                <div className="flex space-x-1 mb-2">
                  {meld.cards.map(card => (
                    <CardComponent
                      key={card.id}
                      card={card}
                      className="w-12 h-16"
                    />
                  ))}
                </div>

                {/* Laid Off Cards */}
                {layOff && layOff.cards.length > 0 && (
                  <div className="border-t pt-2">
                    <div className="text-xs text-gray-600 mb-1">Laid off:</div>
                    <div className="flex space-x-1">
                      {layOff.cards.map(card => (
                        <div key={card.id} className="relative group">
                          <CardComponent
                            card={card}
                            className="w-12 h-16 ring-2 ring-green-400"
                          />
                          <button
                            onClick={() => handleRemoveFromLayOff(card, meld)}
                            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Drop Zone Indicator */}
                {isHighlighted && (
                  <div className="absolute inset-0 border-2 border-dashed border-yellow-400 rounded-lg pointer-events-none animate-pulse" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
      <div className={`flex justify-center space-x-4 transition-all duration-500 ${
        animationPhase === 'ready' ? 'opacity-100' : 'opacity-0'
      }`}>
        <button
          onClick={handleApplyLayOffs}
          disabled={animationPhase === 'applying'}
          className={`px-6 py-3 ${
            selectedLayOffs.length > 0 
              ? 'bg-green-600 hover:bg-green-700' 
              : 'bg-blue-600 hover:bg-blue-700'
          } text-white font-medium rounded-lg transition-all duration-300 ${
            animationPhase === 'applying' ? 'animate-pulse scale-105' : ''
          }`}
        >
          {animationPhase === 'applying' ? 'Applying...' : 
           selectedLayOffs.length > 0 ? `Done Laying Off (-${totalLayOffValue} pts)` : 'Done (No Lay-offs)'}
        </button>
        
        <button
          onClick={handleSkip}
          disabled={animationPhase === 'applying'}
          className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  );
};