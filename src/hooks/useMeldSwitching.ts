import { useState, useCallback, useMemo } from 'react';
import { Card, Meld } from '@gin-rummy/common';
import { 
  findAllMeldCombinations, 
  findCardMeldOptions, 
  switchCardMeld,
  calculateDeadwood
} from '@gin-rummy/common';

interface MeldSwitchingState {
  currentMelds: Meld[];
  deadwood: number;
  switchableCards: Set<string>; // Card IDs that can switch melds
}

export function useMeldSwitching(hand: Card[]) {
  const [meldState, setMeldState] = useState<MeldSwitchingState | null>(null);
  
  // Initialize or update meld state when hand changes
  const initializeMelds = useCallback(() => {
    if (hand.length === 0) {
      setMeldState(null);
      return;
    }

    const allCombinations = findAllMeldCombinations(hand);
    
    if (allCombinations.length === 0) {
      setMeldState({
        currentMelds: [],
        deadwood: calculateDeadwood(hand, []),
        switchableCards: new Set()
      });
      return;
    }

    // Find cards that can be part of multiple melds
    const switchableCards = new Set<string>();
    hand.forEach(card => {
      const options = findCardMeldOptions(card, hand);
      if (options.length > 1) {
        switchableCards.add(card.id);
      }
    });

    // Only use optimal melds if we don't have existing player choices
    setMeldState(prevState => {
      // If we have existing melds and the hand hasn't fundamentally changed, preserve them
      if (prevState && prevState.currentMelds.length > 0) {
        // Check if existing melds are still valid for current hand
        const existingCardIds = new Set(prevState.currentMelds.flatMap(meld => meld.cards.map(c => c.id)));
        const currentCardIds = new Set(hand.map(c => c.id));
        const meldsStillValid = Array.from(existingCardIds).every(id => currentCardIds.has(id));
        
        if (meldsStillValid) {
          return {
            currentMelds: prevState.currentMelds,
            deadwood: calculateDeadwood(hand, prevState.currentMelds),
            switchableCards
          };
        }
      }
      
      // Use optimal combination for new hands or when existing melds are invalid
      const optimal = allCombinations[0];
      
      return {
        currentMelds: optimal.melds,
        deadwood: optimal.deadwood,
        switchableCards
      };
    });
  }, [hand]);

  // Switch a card's meld assignment
  const handleSwitchCardMeld = useCallback((cardId: string) => {
    if (!meldState) return;

    const card = hand.find(c => c.id === cardId);
    if (!card) return;

    const options = findCardMeldOptions(card, hand);
    if (options.length <= 1) return;

    // Find current option index
    const currentMeldIndex = meldState.currentMelds.findIndex(meld => 
      meld.cards.some(c => c.id === cardId)
    );
    
    if (currentMeldIndex === -1) return;

    // Find next option (cycle through available options)
    const currentOption = options.find(option => 
      option.meld.type === meldState.currentMelds[currentMeldIndex].type &&
      option.meld.cards.length === meldState.currentMelds[currentMeldIndex].cards.length
    );
    
    if (!currentOption) return;

    const currentOptionIndex = options.indexOf(currentOption);
    const nextOptionIndex = (currentOptionIndex + 1) % options.length;
    const nextOption = options[nextOptionIndex];

    // Apply the switch
    const newMeldResult = switchCardMeld(hand, meldState.currentMelds, cardId, nextOption);
    
    if (newMeldResult) {
      // Recalculate switchable cards for new configuration
      const switchableCards = new Set<string>();
      hand.forEach(c => {
        const cardOptions = findCardMeldOptions(c, hand);
        if (cardOptions.length > 1) {
          switchableCards.add(c.id);
        }
      });

      setMeldState({
        currentMelds: newMeldResult.melds,
        deadwood: newMeldResult.deadwood,
        switchableCards
      });
    }
  }, [hand, meldState]);

  // Get meld information for a specific card
  const getCardMeldInfo = useCallback((cardId: string) => {
    if (!meldState) return null;

    const meld = meldState.currentMelds.find(m => 
      m.cards.some(c => c.id === cardId)
    );

    return meld ? {
      meld,
      canSwitch: meldState.switchableCards.has(cardId)
    } : null;
  }, [meldState]);

  // Export current state
  const currentState = useMemo(() => {
    if (!meldState) return null;
    
    return {
      melds: meldState.currentMelds,
      deadwood: meldState.deadwood,
      canKnock: meldState.deadwood <= 10,
      hasGin: meldState.deadwood === 0
    };
  }, [meldState]);

  return {
    currentState,
    initializeMelds,
    switchCardMeld: handleSwitchCardMeld,
    getCardMeldInfo,
    isCardSwitchable: (cardId: string) => meldState?.switchableCards.has(cardId) || false
  };
}