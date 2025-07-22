import { Card, GameMove, MoveType, GamePhase, Meld } from '../types/game.js';
import { isValidSet, isValidRun } from './cards.js';

/**
 * Validate if a move is legal in the current game state
 */
export function isValidMove(
  move: GameMove,
  currentPhase: GamePhase,
  currentPlayerId: string,
  playerHand: Card[],
  discardPile: Card[]
): { valid: boolean; error?: string } {
  // Check if it's the player's turn
  if (move.playerId !== currentPlayerId) {
    return { valid: false, error: 'Not your turn' };
  }

  switch (move.type) {
    case MoveType.TakeUpcard:
      return validateTakeUpcard(currentPhase, discardPile);
    
    case MoveType.PassUpcard:
      return validatePassUpcard(currentPhase);
    
    case MoveType.DrawStock:
      return validateDrawStock(currentPhase);
    
    case MoveType.DrawDiscard:
      return validateDrawDiscard(currentPhase, discardPile);
    
    case MoveType.Discard:
      return validateDiscard(move, currentPhase, playerHand);
    
    case MoveType.Knock:
      return validateKnock(move, currentPhase, playerHand);
    
    case MoveType.Gin:
      return validateGin(move, currentPhase, playerHand);
    
    case MoveType.StartNewRound:
      return validateStartNewRound(currentPhase);
    
    default:
      return { valid: false, error: 'Invalid move type' };
  }
}

function validateTakeUpcard(
  currentPhase: GamePhase,
  discardPile: Card[]
): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.UpcardDecision) {
    return { valid: false, error: 'Can only take upcard during upcard decision phase' };
  }
  if (discardPile.length === 0) {
    return { valid: false, error: 'No upcard available' };
  }
  return { valid: true };
}

function validatePassUpcard(currentPhase: GamePhase): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.UpcardDecision) {
    return { valid: false, error: 'Can only pass upcard during upcard decision phase' };
  }
  return { valid: true };
}

function validateDrawStock(currentPhase: GamePhase): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.Draw) {
    return { valid: false, error: 'Can only draw during draw phase' };
  }
  return { valid: true };
}

function validateDrawDiscard(
  currentPhase: GamePhase,
  discardPile: Card[]
): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.Draw) {
    return { valid: false, error: 'Can only draw during draw phase' };
  }
  if (discardPile.length === 0) {
    return { valid: false, error: 'Discard pile is empty' };
  }
  return { valid: true };
}

function validateDiscard(
  move: GameMove,
  currentPhase: GamePhase,
  playerHand: Card[]
): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.Discard) {
    return { valid: false, error: 'Can only discard during discard phase' };
  }
  
  if (!move.cardId) {
    return { valid: false, error: 'Card ID required for discard' };
  }
  
  const hasCard = playerHand.some(card => card.id === move.cardId);
  if (!hasCard) {
    return { valid: false, error: 'Card not in hand' };
  }
  
  return { valid: true };
}

function validateKnock(
  move: GameMove,
  currentPhase: GamePhase,
  playerHand: Card[]
): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.Discard) {
    return { valid: false, error: 'Can only knock during discard phase' };
  }
  
  if (!move.melds || !move.cardId) {
    return { valid: false, error: 'Melds and discard card required for knock' };
  }
  
  // Validate melds
  const meldValidation = validateMelds(move.melds, playerHand);
  if (!meldValidation.valid) {
    return meldValidation;
  }
  
  // Calculate deadwood after discarding
  const handAfterDiscard = playerHand.filter(card => card.id !== move.cardId);
  const meldedCardIds = new Set(
    move.melds.flatMap(meld => meld.cards.map(card => card.id))
  );
  const deadwoodCards = handAfterDiscard.filter(card => !meldedCardIds.has(card.id));
  const deadwood = deadwoodCards.reduce((sum, card) => {
    // Simple deadwood calculation - would use getCardValue in real implementation
    return sum + getSimpleCardValue(card);
  }, 0);
  
  if (deadwood > 10) {
    return { valid: false, error: 'Cannot knock with more than 10 deadwood' };
  }
  
  return { valid: true };
}

function validateGin(
  move: GameMove,
  currentPhase: GamePhase,
  playerHand: Card[]
): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.Discard) {
    return { valid: false, error: 'Can only gin during discard phase' };
  }
  
  if (!move.melds || !move.cardId) {
    return { valid: false, error: 'Melds and discard card required for gin' };
  }
  
  // Validate melds
  const meldValidation = validateMelds(move.melds, playerHand);
  if (!meldValidation.valid) {
    return meldValidation;
  }
  
  // Check if all remaining cards are melded (gin)
  const handAfterDiscard = playerHand.filter(card => card.id !== move.cardId);
  const meldedCardIds = new Set(
    move.melds.flatMap(meld => meld.cards.map(card => card.id))
  );
  const unmeldedCards = handAfterDiscard.filter(card => !meldedCardIds.has(card.id));
  
  if (unmeldedCards.length > 0) {
    return { valid: false, error: 'Cannot gin with unmelded cards' };
  }
  
  return { valid: true };
}

function validateStartNewRound(currentPhase: GamePhase): { valid: boolean; error?: string } {
  if (currentPhase !== GamePhase.RoundOver) {
    return { valid: false, error: 'Can only start new round when current round is over' };
  }
  return { valid: true };
}

/**
 * Validate that melds are legal and use cards from the hand
 */
export function validateMelds(
  melds: Meld[],
  playerHand: Card[]
): { valid: boolean; error?: string } {
  const handCardIds = new Set(playerHand.map(card => card.id));
  const usedCardIds = new Set<string>();
  
  for (const meld of melds) {
    // Check minimum meld size
    if (meld.cards.length < 3) {
      return { valid: false, error: 'Melds must contain at least 3 cards' };
    }
    
    // Check that all cards are in hand
    for (const card of meld.cards) {
      if (!handCardIds.has(card.id)) {
        return { valid: false, error: 'Meld contains card not in hand' };
      }
      
      // Check for duplicate card usage
      if (usedCardIds.has(card.id)) {
        return { valid: false, error: 'Card used in multiple melds' };
      }
      usedCardIds.add(card.id);
    }
    
    // Validate meld type
    if (meld.type === 'set' && !isValidSet(meld.cards)) {
      return { valid: false, error: 'Invalid set' };
    }
    
    if (meld.type === 'run' && !isValidRun(meld.cards)) {
      return { valid: false, error: 'Invalid run' };
    }
  }
  
  return { valid: true };
}

/**
 * Simplified card value calculation for validation
 */
function getSimpleCardValue(card: Card): number {
  switch (card.rank) {
    case 'A':
      return 1;
    case '2':
      return 2;
    case '3':
      return 3;
    case '4':
      return 4;
    case '5':
      return 5;
    case '6':
      return 6;
    case '7':
      return 7;
    case '8':
      return 8;
    case '9':
      return 9;
    case '10':
    case 'J':
    case 'Q':
    case 'K':
      return 10;
    default:
      return 0;
  }
}

/**
 * Validate game creation parameters
 */
export function validateGameCreation(params: {
  vsAI?: boolean;
  isPrivate?: boolean;
  maxPlayers?: number;
}): { valid: boolean; error?: string } {
  const { maxPlayers = 2 } = params;
  
  if (maxPlayers !== 2) {
    return { valid: false, error: 'Gin Rummy only supports 2 players' };
  }
  
  return { valid: true };
}

/**
 * Validate chat message
 */
export function validateChatMessage(message: string): { valid: boolean; error?: string } {
  if (!message || message.trim().length === 0) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  
  if (message.length > 200) {
    return { valid: false, error: 'Message too long (max 200 characters)' };
  }
  
  // Basic profanity filter - in production you'd use a proper library
  const profanityWords = ['spam', 'hack', 'cheat']; // Simplified list
  const lowerMessage = message.toLowerCase();
  
  for (const word of profanityWords) {
    if (lowerMessage.includes(word)) {
      return { valid: false, error: 'Message contains inappropriate content' };
    }
  }
  
  return { valid: true };
}