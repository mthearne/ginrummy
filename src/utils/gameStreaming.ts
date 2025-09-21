import { GameState } from '@gin-rummy/common';
import { ReplayService } from '../services/replay';

export interface GameStreamEvent {
  type: 'game_state_updated' | 'player_state_updated' | 'player_joined' | 'player_left' | 'move_made' | 'turn_changed' | 'game_ended' | 'opponent_thinking' | 'game_connected' | 'ping';
  gameId?: string;
  data?: any;
  message?: string;
}

/**
 * Send a game streaming event to a specific user
 */
export async function sendGameEventToUser(userId: string, event: GameStreamEvent) {
  try {
    console.log('🎮 [STREAMING] Sending game event to user:', userId, 'event:', event.type);
    
    const sendGameEventToUser = (global as any).sendGameEventToUser;
    if (sendGameEventToUser) {
      const result = sendGameEventToUser(userId, event);
      console.log('🎮 [STREAMING] Game event sent successfully, result:', result);
      return result;
    } else {
      console.warn('🎮 [STREAMING] Game streaming function not available - stream route may not be initialized');
      return false;
    }
  } catch (error) {
    console.error('🎮 [STREAMING] Failed to send game streaming event:', error);
    return false;
  }
}

/**
 * Send a game streaming event to all players in a game
 */
export async function sendGameEventToGame(gameId: string, event: GameStreamEvent, playerIds: string[]) {
  try {
    console.log('🎮 [STREAMING] Broadcasting game event to game:', gameId, 'players:', playerIds, 'event:', event.type);
    
    const sendGameEventToGame = (global as any).sendGameEventToGame;
    if (sendGameEventToGame) {
      const result = sendGameEventToGame(gameId, event, playerIds);
      console.log('🎮 [STREAMING] Game event broadcast completed, result:', result);
      return result;
    } else {
      console.warn('🎮 [STREAMING] Game streaming function not available - stream route may not be initialized');
      return 0;
    }
  } catch (error) {
    console.error('🎮 [STREAMING] Failed to broadcast game streaming event:', error);
    return 0;
  }
}

/**
 * Notify players when game state is updated
 */
export async function notifyGameStateUpdated(
  gameId: string,
  options: {
    fullState?: GameState;
    streamVersion?: number;
    playerIds: string[];
  }
) {
  const { fullState, playerIds } = options;
  let state = fullState;
  let effectiveVersion = options.streamVersion;

  if (!state) {
    const rebuild = await ReplayService.rebuildState(gameId);
    state = rebuild.state;
    if (effectiveVersion === undefined) {
      effectiveVersion = rebuild.version;
    }
  }

  if (effectiveVersion === undefined) {
    effectiveVersion = 0;
  }

  await sendGameEventToGame(gameId, {
    type: 'game_state_updated',
    data: {
      gameState: {
        id: state.id,
        phase: state.phase,
        currentPlayerId: state.currentPlayerId,
        status: state.status,
        players: state.players?.map(p => ({
          id: p.id,
          username: p.username,
          handSize: p.hand?.length || 0
        })),
        discardPile: state.discardPile,
        stockSize: state.stockPileCount || 0,
        roundNumber: state.roundNumber,
        scores: state.roundScores || (state.players ? {
          [state.players[0]?.id]: state.players[0]?.score || 0,
          [state.players[1]?.id]: state.players[1]?.score || 0
        } : undefined),
        streamVersion: effectiveVersion
      }
    }
  }, playerIds);

  await Promise.all(
    playerIds.map(async (playerId) => {
      const filteredState = ReplayService.filterStateForPlayer(state!, playerId);
      return sendGameEventToUser(playerId, {
        type: 'player_state_updated',
        gameId,
        data: {
          gameState: filteredState,
          streamVersion: effectiveVersion
        }
      });
    })
  );
}

/**
 * Notify spectators about game state updates (spectator-safe version)
 */
export async function notifySpectatorsGameStateUpdated(gameId: string, gameState: GameState) {
  // For now, we don't have a separate spectator connection pool
  // In a full implementation, we'd maintain a list of spectator connections per game
  // and send spectator-safe updates to them
  console.log('🎮 [STREAMING] Spectator updates not yet implemented for game:', gameId);
  // TODO: Implement spectator-specific streaming updates
}

/**
 * Notify players when a player joins the game
 */
export async function notifyPlayerJoined(gameId: string, player: { id: string; username: string }, playerIds: string[]) {
  return sendGameEventToGame(gameId, {
    type: 'player_joined',
    data: { player },
    message: `${player.username} joined the game`
  }, playerIds);
}

/**
 * Notify players when a player leaves the game
 */
export async function notifyPlayerLeft(gameId: string, player: { id: string; username: string }, playerIds: string[]) {
  return sendGameEventToGame(gameId, {
    type: 'player_left',
    data: { player },
    message: `${player.username} left the game`
  }, playerIds);
}

/**
 * Notify players when a move is made
 */
export async function notifyMoveMade(gameId: string, moveData: { 
  playerId: string; 
  username: string; 
  moveType: string; 
  description: string;
}, playerIds: string[]) {
  return sendGameEventToGame(gameId, {
    type: 'move_made',
    data: moveData,
    message: `${moveData.username} ${moveData.description}`
  }, playerIds);
}

/**
 * Notify players when turn changes
 */
export async function notifyTurnChanged(gameId: string, currentPlayer: { id: string; username: string }, playerIds: string[]) {
  return sendGameEventToGame(gameId, {
    type: 'turn_changed',
    data: { currentPlayer },
    message: `It's ${currentPlayer.username}'s turn`
  }, playerIds);
}

/**
 * Notify players when game ends
 */
export async function notifyGameEnded(gameId: string, result: {
  winner: { id: string; username: string };
  loser: { id: string; username: string };
  winType: string;
  finalScores: { [playerId: string]: number };
}, playerIds: string[]) {
  return sendGameEventToGame(gameId, {
    type: 'game_ended',
    data: result,
    message: `${result.winner.username} wins by ${result.winType}!`
  }, playerIds);
}

/**
 * Notify opponent that AI is thinking (for AI games)
 */
export async function notifyOpponentThinking(gameId: string, opponentId: string, aiThoughts: string[]) {
  return sendGameEventToUser(opponentId, {
    type: 'opponent_thinking',
    gameId,
    data: { aiThoughts },
    message: 'AI is thinking...'
  });
}
