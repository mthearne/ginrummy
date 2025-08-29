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

export function createTurnHistoryEntry(
  move: GameMove,
  gameState: GameState,
  turnNumber: number,
  playerName: string
): TurnHistoryEntry {
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
    turnNumber,
    playerId: move.playerId,
    playerName,
    action,
    description,
    timestamp: new Date().toISOString(),
  };
}

export function getPlayerNameFromGameState(playerId: string, gameState: GameState): string {
  const player = gameState.players?.find(p => p.id === playerId);
  return player?.username || 'Unknown Player';
}