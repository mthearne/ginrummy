import { PrismaClient } from '@prisma/client';
import { EventSourcingEngine } from '../packages/common/src/game-engine/event-sourcing';
import { GameState, GamePhase } from '@gin-rummy/common';
import { GameEvent } from '../packages/common/src/types/events';

/**
 * Universal Game State Loader
 * 
 * Single source of truth for loading game state across the entire application.
 * Always rebuilds from events - no caching, no state storage, no inconsistencies.
 * 
 * Used by:
 * - API endpoints to get current game state
 * - Frontend on page load/refresh  
 * - AI system when making moves
 * - Admin tools for debugging
 * 
 * This ensures EVERYONE sees the same state because it's computed the same way.
 */
export class GameStateLoader {
  constructor(private prisma: PrismaClient) {}

  /**
   * Load game state for any user with access verification
   */
  async loadGameState(gameId: string, userId?: string): Promise<{
    success: true;
    gameState: GameState;
    eventCount: number;
    lastEventAt: Date | null;
    currentRoundTurnHistory?: any[];
  } | {
    success: false;
    error: string;
    code: string;
  }> {
    console.log(`📖 GameStateLoader: Loading state for game ${gameId}, user ${userId || 'system'}`);

    try {
      // STEP 1: Get game metadata and verify access
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } },
        },
      });

      if (!game) {
        return {
          success: false,
          error: 'Game not found',
          code: 'GAME_NOT_FOUND',
        };
      }

      // Verify user has access (skip for system calls)
      if (userId && ![game.player1Id, game.player2Id].includes(userId)) {
        return {
          success: false,
          error: 'Access denied - you are not a player in this game',
          code: 'ACCESS_DENIED',
        };
      }

      // STEP 2: Load all events in correct order
      console.log('📚 GameStateLoader: Loading events from database...');
      const events = await this.prisma.gameEvent.findMany({
        where: { 
          gameId,
          processed: true, // Only load processed events
        },
        orderBy: { sequenceNumber: 'asc' },
        include: {
          player: { select: { id: true, username: true } },
        },
      });

      console.log(`📚 GameStateLoader: Found ${events.length} events`);

      // STEP 3: Convert Prisma events to GameEvent format
      const gameEvents: GameEvent[] = events.map(event => ({
        id: event.id,
        gameId: event.gameId,
        playerId: event.playerId || undefined,
        eventType: event.eventType as any,
        sequenceNumber: event.sequenceNumber,
        eventVersion: event.eventVersion,
        eventData: event.eventData as any,
        metadata: event.metadata as any,
        processed: event.processed,
        processedAt: event.processedAt?.toISOString(),
        createdAt: event.createdAt.toISOString(),
      }));

      // STEP 4: Validate event sequence integrity
      const sequenceValidation = this.validateEventSequence(gameEvents);
      if (!sequenceValidation.valid) {
        console.error('❌ GameStateLoader: Event sequence validation failed:', sequenceValidation.error);
        return {
          success: false,
          error: `Game state corrupted: ${sequenceValidation.error}`,
          code: 'CORRUPTED_STATE',
        };
      }

      // STEP 5: Rebuild state from events
      console.log('🔄 GameStateLoader: Rebuilding game state from events...');
      const eventSourcingEngine = new EventSourcingEngine(gameId, gameEvents);
      let gameState: GameState;

      try {
        gameState = eventSourcingEngine.replayEvents();
      } catch (error) {
        console.error('❌ GameStateLoader: Event replay failed:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to rebuild game state: ${errorMessage}`,
          code: 'REPLAY_FAILED',
        };
      }

      // STEP 6: Enrich state with database metadata
      gameState = this.enrichGameState(gameState, game);

      // STEP 7: Apply user perspective (hide opponent cards)
      if (userId) {
        gameState = this.applyUserPerspective(gameState, userId);
      }

      console.log('✅ GameStateLoader: Successfully loaded game state', {
        gameId,
        phase: gameState.phase,
        currentPlayer: gameState.currentPlayerId,
        eventCount: gameEvents.length,
        status: gameState.status,
      });

      // STEP 8: Generate current round turn history from events  
      // TEMPORARILY DISABLED FOR DEBUGGING
      const currentRoundTurnHistory: any[] = [];
      console.log('📝 GameStateLoader: Turn history generation temporarily disabled for debugging');

      return {
        success: true,
        gameState,
        eventCount: gameEvents.length,
        lastEventAt: game.lastEventAt,
        currentRoundTurnHistory,
      };

    } catch (error) {
      console.error('❌ GameStateLoader: Unexpected error loading game state:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Internal error: ${errorMessage}`,
        code: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Load multiple games for a user (lobby view)
   */
  async loadUserGames(userId: string, limit: number = 20): Promise<{
    success: true;
    games: Array<{
      id: string;
      status: string;
      vsAI: boolean;
      currentPlayerId: string | null;
      isPlayerTurn: boolean;
      opponent: string;
      updatedAt: Date;
    }>;
  } | {
    success: false;
    error: string;
    code: string;
  }> {
    try {
      const games = await this.prisma.game.findMany({
        where: {
          OR: [
            { player1Id: userId },
            { player2Id: userId },
          ],
          status: { in: ['WAITING', 'ACTIVE'] },
        },
        include: {
          player1: { select: { username: true } },
          player2: { select: { username: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      const gameList = games.map(game => ({
        id: game.id,
        status: game.status,
        vsAI: game.vsAI,
        currentPlayerId: game.currentPlayerId,
        isPlayerTurn: game.currentPlayerId === userId,
        opponent: game.player1Id === userId 
          ? (game.player2?.username || 'Waiting...')
          : (game.player1?.username || 'Unknown'),
        updatedAt: game.updatedAt,
      }));

      return {
        success: true,
        games: gameList,
      };

    } catch (error) {
      console.error('❌ GameStateLoader: Error loading user games:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to load games: ${errorMessage}`,
        code: 'LOAD_FAILED',
      };
    }
  }

  /**
   * Quick check if game exists and user has access
   */
  async verifyGameAccess(gameId: string, userId: string): Promise<boolean> {
    try {
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        select: { player1Id: true, player2Id: true },
      });

      return game ? [game.player1Id, game.player2Id].includes(userId) : false;
    } catch {
      return false;
    }
  }

  // Private helper methods

  private validateEventSequence(events: GameEvent[]): { valid: true } | { valid: false; error: string } {
    if (events.length === 0) {
      return { valid: true }; // Empty sequence is valid
    }

    // Check for gaps in sequence numbers
    for (let i = 0; i < events.length; i++) {
      const expectedSequence = i + 1;
      if (events[i].sequenceNumber !== expectedSequence) {
        return {
          valid: false,
          error: `Sequence gap detected: expected ${expectedSequence}, found ${events[i].sequenceNumber}`,
        };
      }
    }

    // Check for duplicate sequence numbers
    const sequenceNumbers = events.map(e => e.sequenceNumber);
    const uniqueSequences = new Set(sequenceNumbers);
    if (uniqueSequences.size !== sequenceNumbers.length) {
      return {
        valid: false,
        error: 'Duplicate sequence numbers detected',
      };
    }

    return { valid: true };
  }

  private enrichGameState(gameState: GameState, gameData: any): GameState {
    // Add metadata from database that isn't in events
    return {
      ...gameState,
      isPrivate: gameData.isPrivate,
      vsAI: gameData.vsAI,
      // Ensure player usernames are set
      players: gameState.players.map(player => {
        const dbPlayer = player.id === gameData.player1Id ? gameData.player1 : gameData.player2;
        return {
          ...player,
          username: dbPlayer?.username || player.username || 'Unknown',
        };
      }),
    };
  }

  private applyUserPerspective(gameState: GameState, userId: string): GameState {
    // Check if cards should be revealed (round over or game over)
    const shouldRevealCards = gameState.phase === GamePhase.RoundOver || 
                             gameState.phase === GamePhase.GameOver;
    
    // Create a copy of the state with appropriate card visibility
    return {
      ...gameState,
      players: gameState.players.map(player => {
        if (player.id === userId) {
          // Always show user's own cards
          return player;
        } else {
          // Handle opponent's cards based on game state
          if (shouldRevealCards) {
            // Reveal all opponent cards when round/game is over
            return player;
          } else {
            // Hide opponent's cards during active gameplay
            return {
              ...player,
              hand: [], // Hide cards
              lastDrawnCardId: undefined, // Hide what they just drew
              // Keep public information visible
              handSize: player.handSize,
              score: player.score,
              hasKnocked: player.hasKnocked,
              hasGin: player.hasGin,
              deadwood: player.deadwood,
              melds: player.hasKnocked || player.hasGin ? player.melds : [], // Only show melds after knock/gin
            };
          }
        }
      }),
    };
  }

  /**
   * Generate turn history entries for the current round from events
   */
  private generateCurrentRoundTurnHistory(events: any[], gameState: any): any[] {
    // Find the most recent NEW_ROUND or GAME_CREATED event to determine round start
    let roundStartIndex = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].eventType === 'NEW_ROUND' || events[i].eventType === 'GAME_CREATED') {
        roundStartIndex = events[i].eventType === 'GAME_CREATED' ? 0 : i;
        break;
      }
    }

    console.log('📝 GameStateLoader: Round start found at event index:', roundStartIndex, 'event type:', events[roundStartIndex]?.eventType);

    // Filter events that represent player moves in the current round
    const moveEventTypes = [
      'DRAW_FROM_STOCK',
      'DRAW_FROM_DISCARD', 
      'DISCARD_CARD',
      'KNOCK',
      'GIN',
      'TAKE_UPCARD',
      'PASS_UPCARD'
    ];

    const currentRoundEvents = events
      .slice(roundStartIndex)
      .filter(event => moveEventTypes.includes(event.eventType));

    console.log('📝 GameStateLoader: Found', currentRoundEvents.length, 'move events in current round');

    // Convert events to turn history entries
    const turnHistory = currentRoundEvents.map((event, index) => {
      const eventDescriptions: { [key: string]: string } = {
        'DRAW_FROM_STOCK': 'drew a card from the stock pile',
        'DRAW_FROM_DISCARD': 'drew a card from the discard pile', 
        'DISCARD_CARD': 'discarded a card',
        'KNOCK': 'knocked',
        'GIN': 'went gin',
        'TAKE_UPCARD': 'took the upcard',
        'PASS_UPCARD': 'passed on the upcard'
      };

      const description = eventDescriptions[event.eventType] || `made a ${event.eventType.toLowerCase()} move`;
      
      // Try to get player name from event, then from game state players as fallback
      let playerName = event.player?.username;
      if (!playerName && event.playerId && gameState.players) {
        const player = gameState.players.find((p: any) => p.id === event.playerId);
        playerName = player?.username;
      }
      playerName = playerName || 'Unknown Player';

      return {
        id: event.id,
        turnNumber: index + 1, // Sequential turn numbering for current round
        playerId: event.playerId,
        playerName,
        action: event.eventType,
        description,
        timestamp: event.createdAt,
      };
    });

    console.log('📝 GameStateLoader: Generated turn history:', turnHistory.map(t => `${t.turnNumber}: ${t.playerName} ${t.description}`));
    return turnHistory;
  }
}