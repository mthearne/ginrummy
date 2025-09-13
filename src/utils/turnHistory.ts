import { GameMove, MoveType, GameState } from '@gin-rummy/common';

export interface TurnHistoryEntry {
  id: string;
  turnNumber: number;
  playerId: string;
  playerName: string;
  action: string;
  description: string;
  timestamp: string;
}

// Global turn counter to ensure sequential turn numbers
let globalTurnCounter = 1;

export function createTurnHistoryEntry(
  move: GameMove,
  gameState: GameState,
  turnNumber: number | null,
  playerName: string,
  existingTurnHistoryLength?: number
): TurnHistoryEntry {
  // Calculate turn number based on existing history length if provided
  let finalTurnNumber: number;
  
  if (turnNumber && turnNumber > 0 && turnNumber < 10000) {
    finalTurnNumber = turnNumber;
  } else if (typeof existingTurnHistoryLength === 'number') {
    // Use existing turn history length + 1 for next turn number
    finalTurnNumber = existingTurnHistoryLength + 1;
  } else {
    // Fallback to global counter (unreliable but better than nothing)
    finalTurnNumber = globalTurnCounter++;
  }
  const action = move.type;
  let description = '';

  switch (move.type) {
    case MoveType.PassUpcard:
      description = 'passed on the upcard';
      break;
    case MoveType.TakeUpcard:
      description = 'took the upcard';
      break;
    case MoveType.DrawStock:
      description = 'drew from stock';
      break;
    case MoveType.DrawDiscard:
      description = 'drew from discard pile';
      break;
    case MoveType.Discard:
      if (move.cardId) {
        // Get card name from the move or try to find it in discard pile
        const discardedCard = gameState.discardPile?.[gameState.discardPile.length - 1];
        const cardName = discardedCard ? `${discardedCard.rank} of ${discardedCard.suit}` : 'a card';
        description = `discarded ${cardName}`;
      } else {
        description = 'discarded a card';
      }
      break;
    case MoveType.Knock:
      description = 'knocked to end the round';
      break;
    case MoveType.Gin:
      description = 'went gin!';
      break;
    case MoveType.StartNewRound:
      description = 'started a new round';
      break;
    default:
      description = `made a ${move.type} move`;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    turnNumber: finalTurnNumber,
    playerId: move.playerId,
    playerName,
    action,
    description,
    timestamp: new Date().toISOString(),
  };
}

export function getPlayerNameFromGameState(playerId: string, gameState: GameState): string {
  const player = gameState.players?.find(p => p.id === playerId);
  console.log(`🔍 Turn History - Looking for player ${playerId} in:`, gameState.players?.map(p => ({ id: p.id, username: p.username })));
  console.log(`🔍 Turn History - Found player:`, player);
  return player?.username || 'Unknown Player';
}