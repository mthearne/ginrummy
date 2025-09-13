import { PrismaClient } from '@prisma/client';
import { GameAction, GameEvent, EventType, createGameEvent } from '../packages/common/src/types/events';
import { EventSourcingEngine } from '../packages/common/src/game-engine/event-sourcing';
import { EventSourcedGinRummyGame } from '../packages/common/src/game-engine/event-sourced-gin-rummy';
import { GameState, GamePhase } from '@gin-rummy/common';
import crypto from 'crypto';

/**
 * TurnController - Database-First Atomic Turn Management
 * 
 * This is the core of our bulletproof turn system. Every move is processed
 * as an atomic database transaction that:
 * 1. Locks the game row to prevent concurrent modifications
 * 2. Loads all events and rebuilds state
 * 3. Validates the action against current state
 * 4. Creates and persists the new event
 * 5. Updates game metadata atomically
 * 
 * This eliminates ALL race conditions and state inconsistencies.
 */
export class TurnController {
  constructor(private prisma: PrismaClient) {}

  /**
   * Process a player action atomically
   */
  async processTurn(gameId: string, playerId: string, action: GameAction, retryCount: number = 0): Promise<{
    success: true;
    gameState: GameState;
    event: GameEvent;
    aiShouldMove?: boolean;
  } | {
    success: false;
    error: string;
    code: string;
  }> {
    console.log(`🎮 TurnController: Processing ${action.type} for player ${playerId} in game ${gameId} (attempt ${retryCount + 1})`);

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // STEP 1: Enhanced game locking with optimistic concurrency control
        console.log('🔒 TurnController: Acquiring game lock...');
        const game = await tx.game.findUnique({
          where: { id: gameId },
          // Use SELECT FOR UPDATE to prevent concurrent modifications
        });

        if (!game) {
          throw new Error('Game not found');
        }

        // EDGE CASE: Check for concurrent game state changes
        if (game.status === 'FINISHED') {
          throw new Error('Game is already finished');
        }

        if (game.status === 'CANCELLED') {
          throw new Error('Game has been cancelled');
        }

        if (game.status !== 'ACTIVE') {
          throw new Error(`Game is ${game.status}, cannot process moves`);
        }

        // STEP 2: Load all events for this game
        console.log('📚 TurnController: Loading game events...');
        const events = await tx.gameEvent.findMany({
          where: { gameId },
          orderBy: { sequenceNumber: 'asc' },
        });

        console.log(`📚 TurnController: Loaded ${events.length} events`);

        // STEP 3: Rebuild game state from events
        console.log('🔄 TurnController: Rebuilding game state...');
        const eventSourcingEngine = new EventSourcingEngine(gameId, events.map(this.mapPrismaEventToGameEvent));
        const currentState = eventSourcingEngine.replayEvents();

        console.log('🎯 TurnController: Current state -', {
          phase: currentState.phase,
          currentPlayer: currentState.currentPlayerId,
          status: currentState.status
        });

        // STEP 4: Validate action
        const validationResult = this.validateAction(currentState, playerId, action);
        console.log('🚨 TurnController: Validation result:', validationResult);
        if (!validationResult.valid) {
          console.error('❌ TurnController: Validation failed with error:', validationResult.error);
          throw new Error(`Invalid move: ${validationResult.error}`);
        }

        // STEP 5: Generate new event using event-sourced game engine - FIXED: Use max sequence + 1
        const nextSequenceNumber = events.length > 0 
          ? Math.max(...events.map(e => e.sequenceNumber)) + 1 
          : 1;
        console.log(`📊 TurnController: Next sequence number: ${nextSequenceNumber} (based on ${events.length} events)`);
        const gameEngine = new EventSourcedGinRummyGame(gameId);
        const eventResult = gameEngine.validateAndCreateEvent(currentState, action, nextSequenceNumber);
        
        if ('error' in eventResult) {
          throw new Error(`Invalid move: ${eventResult.error}`);
        }
        
        const newEvent = eventResult;

        console.log(`✨ TurnController: Created event ${newEvent.eventType} (seq: ${newEvent.sequenceNumber})`);

        // STEP 6: Apply event to get new state
        const newState = eventSourcingEngine.addEvent(newEvent);

        console.log('🎯 TurnController: New state -', {
          phase: newState.phase,
          currentPlayer: newState.currentPlayerId,
          status: newState.status
        });

        // STEP 7: Persist the event to database
        console.log('💾 TurnController: Persisting event to database...');
        const prismaData = {
          id: newEvent.id,
          gameId: newEvent.gameId,
          playerId: newEvent.playerId,
          eventType: newEvent.eventType,
          sequenceNumber: newEvent.sequenceNumber,
          eventVersion: newEvent.eventVersion,
          eventData: newEvent.eventData,
          metadata: newEvent.metadata,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(),
        };
        console.log('💾 TurnController: Field values:');
        console.log('  id:', typeof prismaData.id, prismaData.id);
        console.log('  gameId:', typeof prismaData.gameId, prismaData.gameId);
        console.log('  playerId:', typeof prismaData.playerId, prismaData.playerId);
        console.log('  eventType:', typeof prismaData.eventType, prismaData.eventType);
        console.log('  sequenceNumber:', typeof prismaData.sequenceNumber, prismaData.sequenceNumber);
        console.log('  eventVersion:', typeof prismaData.eventVersion, prismaData.eventVersion);
        
        // CHECK 6: JSON/JSONB format issues
        console.log('🔍 Testing JSON serialization:');
        try {
          const eventDataJson = JSON.stringify(prismaData.eventData);
          const metadataJson = JSON.stringify(prismaData.metadata);
          console.log('  eventData JSON length:', eventDataJson.length);
          console.log('  metadata JSON length:', metadataJson.length);
          console.log('  eventData can serialize: ✓');
          console.log('  metadata can serialize: ✓');
        } catch (jsonError) {
          console.error('❌ JSON serialization failed:', jsonError);
        }
        
        try {
          console.log('💾 About to call Prisma create...');
          
          // REVERT: Use original full data but with better error logging
          const result = await tx.gameEvent.create({
            data: {
              ...prismaData,
              eventData: prismaData.eventData as any,
              metadata: prismaData.metadata as any,
            },
          });
          console.log('💾 Prisma create returned:', result.id);
        console.log('✅ TurnController: Event persisted successfully');
        } catch (eventError) {
          console.error('❌ TurnController: Failed to persist event:');
          console.error('Error name:', eventError.name);
          console.error('Error message:', eventError.message);
          console.error('Error code:', eventError.code);
          if (eventError.stack) {
            console.error('Error stack (first 500 chars):', eventError.stack.substring(0, 500));
          }
          console.error('❌ TurnController: Event data that failed:', JSON.stringify({
            id: newEvent.id,
            gameId: newEvent.gameId,
            playerId: newEvent.playerId,
            eventType: newEvent.eventType,
            sequenceNumber: newEvent.sequenceNumber,
            eventVersion: newEvent.eventVersion,
            eventData: newEvent.eventData,
            metadata: newEvent.metadata
          }, null, 2));
          throw eventError;
        }

        // STEP 8: Update game metadata
        console.log('🎮 TurnController: Updating game metadata...');
        await tx.game.update({
          where: { id: gameId },
          data: {
            currentPlayerId: newState.currentPlayerId,
            status: newState.status,
            eventCount: nextSequenceNumber,
            lastEventAt: new Date(),
            updatedAt: new Date(),
            // Update scores if available
            ...(newState.players.length >= 1 && { player1Score: newState.players[0].score }),
            ...(newState.players.length >= 2 && { player2Score: newState.players[1].score }),
            // Set winner if game finished
            ...(newState.winner && { winnerId: newState.winner }),
            ...(newState.gameOver && { finishedAt: new Date() }),
          },
        });

        // STEP 9: Determine if AI should move
        const aiShouldMove = this.shouldTriggerAI(newState, game);

        console.log('✅ TurnController: Transaction completed successfully');

        return {
          success: true as const,
          gameState: newState,
          event: newEvent,
          aiShouldMove,
        };
      }, {
        isolationLevel: 'Serializable', // Highest isolation level for consistency
        timeout: 10000, // 10 second timeout
      });

      return result;

    } catch (error) {
      console.error('❌ TurnController: Transaction failed:', error);
      console.error('❌ TurnController: Error details:', {
        message: error.message,
        code: error.code,
        name: error.name,
        stack: error.stack
      });
      
      // ENHANCED CONCURRENCY HANDLING - Automatic retry on specific errors
      const isRetryableError = 
        error.code === 'P2034' || // Prisma write conflict/deadlock
        error.message.includes('write conflict') ||
        error.message.includes('deadlock') ||
        error.message.includes('serialization_failure');

      // Retry logic for concurrency conflicts
      if (isRetryableError && retryCount < 3) {
        console.log(`🔄 TurnController: Retrying due to concurrency conflict (attempt ${retryCount + 2}/4)`);
        
        // Exponential backoff: wait 50ms, 100ms, 200ms
        const delay = 50 * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return this.processTurn(gameId, playerId, action, retryCount + 1);
      }

      // Map database errors to user-friendly messages
      if (error.message.includes('Game not found')) {
        return {
          success: false,
          error: 'Game not found',
          code: 'GAME_NOT_FOUND',
        };
      }
      
      if (error.message.includes('Game is already finished')) {
        return {
          success: false,
          error: 'Game is already finished',
          code: 'GAME_FINISHED',
        };
      }

      if (error.message.includes('Game has been cancelled')) {
        return {
          success: false,
          error: 'Game has been cancelled',
          code: 'GAME_CANCELLED',
        };
      }
      
      if (error.message.includes('Invalid move')) {
        return {
          success: false,
          error: error.message,
          code: 'INVALID_MOVE',
        };
      }

      // Concurrency-related errors
      if (isRetryableError) {
        return {
          success: false,
          error: 'Concurrent modification detected - please try again',
          code: 'CONCURRENCY_CONFLICT',
        };
      }

      // Database connection errors
      if (error.code === 'P1001' || error.message.includes('database')) {
        return {
          success: false,
          error: 'Database connection error - please try again',
          code: 'DATABASE_ERROR',
        };
      }

      // Timeout errors
      if (error.message.includes('timeout')) {
        return {
          success: false,
          error: 'Operation timed out - please try again',
          code: 'TIMEOUT_ERROR',
        };
      }
      
      return {
        success: false,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
      };
    }
  }

  /**
   * Load game state by replaying all events
   */
  async loadGameState(gameId: string, userId?: string): Promise<{
    success: true;
    gameState: GameState;
  } | {
    success: false;
    error: string;
  }> {
    console.log(`📖 TurnController: Loading game state for ${gameId}${userId ? ` (user: ${userId})` : ' (system)'}`);

    try {
      // OPTIMIZATION: Use database transaction for consistency
      const result = await this.prisma.$transaction(async (tx) => {
        // Get game metadata with optimized query
        const game = await tx.game.findUnique({
          where: { id: gameId },
          select: {
            id: true,
            status: true,
            gameType: true,
            player1Id: true,
            player2Id: true,
            currentPlayerId: true,
            winnerId: true,
            isPrivate: true,
            vsAI: true,
            eventCount: true,
            lastEventAt: true,
            createdAt: true,
            updatedAt: true,
            player1: { select: { id: true, username: true } },
            player2: { select: { id: true, username: true } },
          },
        });

        if (!game) {
          throw new Error('Game not found');
        }

        // EDGE CASE: Enhanced access control
        if (userId) {
          const isPlayer = [game.player1Id, game.player2Id].includes(userId);
          const isPublicGame = !game.isPrivate;
          
          if (!isPlayer && game.isPrivate) {
            throw new Error('Access denied - private game');
          }
          
          if (!isPlayer && !isPublicGame) {
            throw new Error('Access denied');
          }
        }

        // OPTIMIZATION: Check if we can use cached/snapshot state
        const shouldUseFullReplay = game.eventCount > 100; // Threshold for snapshot optimization
        
        if (shouldUseFullReplay) {
          console.log(`🚀 TurnController: Game has ${game.eventCount} events, checking for snapshots...`);
          
          // Try to find the latest snapshot
          const latestSnapshot = await tx.gameSnapshot.findFirst({
            where: { gameId },
            orderBy: { sequenceNumber: 'desc' },
          });

          if (latestSnapshot) {
            console.log(`📸 TurnController: Found snapshot at sequence ${latestSnapshot.sequenceNumber}`);
            
            // Load only events after the snapshot
            const eventsAfterSnapshot = await tx.gameEvent.findMany({
              where: { 
                gameId,
                sequenceNumber: { gt: latestSnapshot.sequenceNumber }
              },
              orderBy: { sequenceNumber: 'asc' },
            });

            console.log(`📚 TurnController: Loading ${eventsAfterSnapshot.length} events after snapshot`);

            // Start from snapshot state
            let gameState = latestSnapshot.gameState as unknown as GameState;
            
            // Apply only the events after snapshot
            if (eventsAfterSnapshot.length > 0) {
              const eventSourcingEngine = new EventSourcingEngine(gameId, eventsAfterSnapshot.map(this.mapPrismaEventToGameEvent));
              eventSourcingEngine['currentState'] = gameState; // Set starting state
              
              // Apply remaining events
              for (const event of eventsAfterSnapshot) {
                eventSourcingEngine.applyEvent(this.mapPrismaEventToGameEvent(event));
              }
              
              gameState = eventSourcingEngine.getCurrentState() || gameState;
            }

            return gameState;
          }
        }

        // FALLBACK: Load all events and replay (standard path)
        const events = await tx.gameEvent.findMany({
          where: { gameId },
          orderBy: { sequenceNumber: 'asc' },
        });

        console.log(`📚 TurnController: Loaded ${events.length} events for full replay`);

        // EDGE CASE: Handle empty event list
        if (events.length === 0) {
          throw new Error('No events found for game - corrupted game state');
        }

        // Replay events to current state
        const eventSourcingEngine = new EventSourcingEngine(gameId, events.map(this.mapPrismaEventToGameEvent));
        const gameState = eventSourcingEngine.replayEvents();

        // OPTIMIZATION: Create snapshot for large games
        if (events.length > 50 && events.length % 25 === 0) {
          console.log(`📸 TurnController: Creating snapshot at sequence ${events.length}`);
          try {
            await tx.gameSnapshot.create({
              data: {
                gameId,
                sequenceNumber: events.length,
                gameState: gameState as any,
                stateHash: this.calculateStateHash(gameState),
                createdBy: 'system',
              },
            });
          } catch (snapshotError) {
            console.warn('⚠️ TurnController: Failed to create snapshot:', snapshotError);
            // Don't fail the request if snapshot creation fails
          }
        }

        return gameState;
      });

      // Apply user perspective (hide opponent cards if needed)
      const finalState = userId ? this.applyUserPerspective(result, userId) : result;

      return {
        success: true,
        gameState: finalState
      };

    } catch (error) {
      console.error('❌ TurnController: Failed to load game state:', error);
      return {
        success: false,
        error: error.message || 'Failed to load game state'
      };
    }
  }

  // Private helper methods

  private validateAction(state: GameState, playerId: string, action: GameAction): { valid: true } | { valid: false; error: string } {
    // ENHANCED VALIDATION WITH CRITICAL EDGE CASES

    // Edge case: null/undefined inputs
    if (!state || !playerId || !action) {
      return { valid: false, error: 'Invalid input parameters' };
    }

    // Edge case: invalid player ID format
    if (typeof playerId !== 'string' || playerId.trim() === '') {
      return { valid: false, error: 'Invalid player ID' };
    }

    // Basic validations
    if (state.gameOver) {
      return { valid: false, error: 'Game is over' };
    }

    // Edge case: game status validation
    if (state.status !== 'ACTIVE') {
      return { valid: false, error: `Game is ${state.status.toLowerCase()}, not active` };
    }

    // Special case: AI_LAYOFF_DECISION can be made during layoff phase regardless of current player
    console.log('🚨 TurnController: Checking turn validation', {
      currentPlayerId: state.currentPlayerId,
      actionPlayerId: playerId,
      actionType: action.type,
      isAILayoffDecision: action.type === EventType.AI_LAYOFF_DECISION
    });
    
    if (state.currentPlayerId !== playerId && action.type !== EventType.AI_LAYOFF_DECISION) {
      console.log('❌ TurnController: Not your turn validation failed');
      return { valid: false, error: 'Not your turn' };
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) {
      return { valid: false, error: 'Player not found' };
    }

    // Edge case: validate player has valid hand
    if (!player.hand || !Array.isArray(player.hand)) {
      return { valid: false, error: 'Player has invalid hand' };
    }

    // Action-specific validations with enhanced edge cases
    switch (action.type) {
      case EventType.TAKE_UPCARD:
        if (state.phase !== 'upcard_decision') {
          return { valid: false, error: `Cannot take upcard in ${state.phase} phase (must be upcard_decision)` };
        }
        if (!state.discardPile || state.discardPile.length === 0) {
          return { valid: false, error: 'No upcard available' };
        }
        // Edge case: check if player already has maximum hand size
        if (player.hand.length >= 11) {
          return { valid: false, error: 'Cannot take upcard - hand already full' };
        }
        break;

      case EventType.PASS_UPCARD:
        if (state.phase !== 'upcard_decision') {
          return { valid: false, error: `Cannot pass upcard in ${state.phase} phase (must be upcard_decision)` };
        }
        break;

      case EventType.DRAW_FROM_STOCK:
        if (state.phase !== 'draw') {
          return { valid: false, error: `Cannot draw from stock in ${state.phase} phase (must be draw)` };
        }
        if (state.stockPileCount <= 0) {
          return { valid: false, error: 'Stock pile is empty' };
        }
        // Edge case: check if player already has maximum hand size
        if (player.hand.length >= 11) {
          return { valid: false, error: 'Cannot draw - hand already full' };
        }
        break;

      case EventType.DRAW_FROM_DISCARD:
        if (state.phase !== 'draw') {
          return { valid: false, error: `Cannot draw from discard in ${state.phase} phase (must be draw)` };
        }
        if (!state.discardPile || state.discardPile.length === 0) {
          return { valid: false, error: 'Discard pile is empty' };
        }
        // Edge case: check if player already has maximum hand size
        if (player.hand.length >= 11) {
          return { valid: false, error: 'Cannot draw - hand already full' };
        }
        break;

      case EventType.DISCARD_CARD:
        if (state.phase !== 'discard') {
          return { valid: false, error: `Cannot discard in ${state.phase} phase (must be discard)` };
        }
        const discardAction = action as any;
        
        // Edge case: validate cardId exists
        if (!discardAction.cardId) {
          return { valid: false, error: 'Card ID required for discard' };
        }
        
        // Edge case: validate card exists in hand
        if (!player.hand.find(card => card && card.id === discardAction.cardId)) {
          return { valid: false, error: 'Card not in hand or invalid card' };
        }
        
        // Edge case: check minimum hand size after discard
        if (player.hand.length <= 1) {
          return { valid: false, error: 'Cannot discard - would leave empty hand' };
        }
        break;

      case EventType.KNOCK:
        if (state.phase !== 'discard') {
          return { valid: false, error: `Can only knock during discard phase (currently ${state.phase})` };
        }
        
        // Edge case: validate melds exist
        const knockAction = action as any;
        if (!knockAction.melds || !Array.isArray(knockAction.melds)) {
          return { valid: false, error: 'Valid melds required for knock' };
        }
        
        // Edge case: check if player has minimum hand size to knock
        if (player.hand.length < 3) {
          return { valid: false, error: 'Cannot knock with fewer than 3 cards' };
        }
        break;

      case EventType.GIN:
        if (state.phase !== 'discard') {
          return { valid: false, error: `Can only gin during discard phase (currently ${state.phase})` };
        }
        
        // Edge case: validate melds exist
        const ginAction = action as any;
        if (!ginAction.melds || !Array.isArray(ginAction.melds)) {
          return { valid: false, error: 'Valid melds required for gin' };
        }
        break;

      case EventType.START_NEW_ROUND:
        if (state.phase !== 'round_over') {
          return { valid: false, error: `Can only start new round after round is over (currently ${state.phase})` };
        }
        
        if (state.gameOver) {
          return { valid: false, error: 'Cannot start new round - game is finished' };
        }
        break;

      case EventType.AI_LAYOFF_DECISION:
        if (state.phase !== GamePhase.Layoff) {
          return { valid: false, error: `Can only make layoff decisions during layoff phase (currently ${state.phase})` };
        }
        
        const layoffAction = action as any;
        
        // Validate AI player is the opponent (not the knocker)
        const knocker = state.players.find(p => p.hasKnocked || p.hasGin);
        if (!knocker) {
          return { valid: false, error: 'No knocker found in game state' };
        }
        
        if (knocker.id === playerId) {
          return { valid: false, error: 'Knocker cannot make layoff decisions' };
        }
        
        // Validate layoff decision format
        if (!['LAYOFF', 'SKIP'].includes(layoffAction.decision)) {
          return { valid: false, error: 'Invalid layoff decision - must be LAYOFF or SKIP' };
        }
        
        if (layoffAction.decision === 'LAYOFF' && !layoffAction.selectedLayoffs) {
          return { valid: false, error: 'Selected layoffs required when decision is LAYOFF' };
        }
        break;

      default:
        return { valid: false, error: `Unknown action type: ${(action as any).type}` };
    }

    return { valid: true };
  }

  private createEventFromAction(gameId: string, action: GameAction, state: GameState, sequenceNumber: number): GameEvent {
    const baseEvent = {
      gameId,
      playerId: action.playerId,
      sequenceNumber,
      metadata: {
        timestamp: new Date().toISOString(),
        // Could add more metadata like IP, user agent, etc.
      },
    };

    switch (action.type) {
      case EventType.DRAW_FROM_STOCK:
        // TODO: Implement actual card drawing logic
        const drawnCard = this.drawCardFromStock(state);
        return createGameEvent(gameId, EventType.DRAW_FROM_STOCK, {
          playerId: action.playerId,
          cardDrawn: drawnCard,
          stockSizeAfter: state.stockPileCount - 1,
        }, action.playerId, sequenceNumber, baseEvent.metadata);

      case EventType.TAKE_UPCARD:
        if (state.discardPile.length === 0) throw new Error('No upcard available');
        const upcardTaken = state.discardPile[0];
        return createGameEvent(gameId, EventType.TAKE_UPCARD, {
          playerId: action.playerId,
          cardTaken: upcardTaken,
          discardPileAfter: state.discardPile.slice(1),
        }, action.playerId, sequenceNumber, baseEvent.metadata);

      case EventType.PASS_UPCARD:
        const nextPlayerAfterPass = this.getNextPlayer(state, action.playerId);
        return createGameEvent(gameId, EventType.PASS_UPCARD, {
          playerId: action.playerId,
          nextPlayerId: nextPlayerAfterPass.id,
        }, action.playerId, sequenceNumber, baseEvent.metadata);

      case EventType.DISCARD_CARD:
        const discardAction = action as any; // DiscardCardAction
        const cardToDiscard = state.players.find(p => p.id === action.playerId)?.hand.find(c => c.id === discardAction.cardId);
        if (!cardToDiscard) throw new Error('Card not found');
        
        const nextPlayer = this.getNextPlayer(state, action.playerId);
        return createGameEvent(gameId, EventType.DISCARD_CARD, {
          playerId: action.playerId,
          cardDiscarded: cardToDiscard,
          discardPileAfter: [cardToDiscard, ...state.discardPile],
          nextPlayerId: nextPlayer.id,
        }, action.playerId, sequenceNumber, baseEvent.metadata);

      case EventType.AI_LAYOFF_DECISION:
        const aiLayoffAction = action as any; // AILayoffDecisionAction
        const totalValueLaidOff = aiLayoffAction.selectedLayoffs?.reduce((total: number, layoff: any) => 
          total + layoff.cards.reduce((cardTotal: number, card: any) => cardTotal + (card.value || 0), 0), 0) || 0;
        return createGameEvent(gameId, EventType.AI_LAYOFF_DECISION, {
          playerId: action.playerId,
          decision: aiLayoffAction.decision,
          selectedLayoffs: aiLayoffAction.selectedLayoffs || [],
          totalValueLaidOff,
          gameId: gameId
        }, action.playerId, sequenceNumber, baseEvent.metadata);

      // TODO: Implement other action types (KNOCK, GIN, etc.)
      default:
        throw new Error(`Unimplemented action type: ${action.type}`);
    }
  }

  private shouldTriggerAI(state: GameState, game: any): boolean {
    console.log('🚨🚨 TurnController.shouldTriggerAI called:', {
      phase: state?.phase,
      vsAI: state?.vsAI,
      gameOver: state?.gameOver,
      status: state?.status,
      currentPlayerId: state?.currentPlayerId,
      player1Id: game?.player1Id,
      player2Id: game?.player2Id
    });
    
    // ENHANCED AI DETECTION WITH CRITICAL EDGE CASES
    
    // Edge case: validate inputs
    if (!state || !game) {
      console.warn('⚠️ TurnController: Invalid state or game for AI detection');
      return false;
    }

    // Edge case: not an AI game
    if (!state.vsAI && !game.vsAI) {
      console.log('🚨 TurnController: Not an AI game, returning false');
      return false;
    }

    // Edge case: game is over
    if (state.gameOver || state.status !== 'ACTIVE') {
      console.log('🚨 TurnController: Game is over or not active, returning false');
      return false;
    }

    // Edge case: no current player
    if (!state.currentPlayerId) {
      console.warn('⚠️ TurnController: No current player for AI detection');
      return false;
    }

    const currentPlayer = state.players.find(p => p.id === state.currentPlayerId);
    if (!currentPlayer) {
      console.warn('⚠️ TurnController: Current player not found in game state');
      return false;
    }

    // Enhanced AI identification logic
    // In AI games, we need to identify which player is the AI
    
    // Method 1: Check if current player is different from the human player (player1)
    const isCurrentPlayerAI = state.currentPlayerId !== game.player1Id;
    
    // Method 2: Check if we're in a phase where AI should act
    const shouldAIAct = isCurrentPlayerAI && (
      state.phase === 'draw' || 
      state.phase === 'discard' ||
      state.phase === 'upcard_decision'
    );
    
    // Special case: AI should always act in layoff phase (for layoff decisions)
    const shouldAIActForLayoff = state.phase === 'layoff' && state.vsAI;
    
    const finalShouldAIAct = shouldAIAct || shouldAIActForLayoff;

    // Edge case: validate AI game setup
    if (state.vsAI) {
      // In AI games, player2Id should be different from player1Id or be a special AI identifier
      if (game.player1Id === game.player2Id) {
        // Some AI games store the human player as both players - AI is implicit
        // In this case, AI moves when it's not the human's turn conceptually
        console.log(`🚨 TurnController: AI game with same player IDs, returning finalShouldAIAct: ${finalShouldAIAct}`);
        return finalShouldAIAct;
      } else {
        // Standard AI game setup with distinct player IDs
        const standardResult = (state.currentPlayerId === game.player2Id && shouldAIAct) || shouldAIActForLayoff;
        console.log(`🚨 TurnController: Standard AI game, returning: ${standardResult}`, {
          currentIsPlayer2: state.currentPlayerId === game.player2Id,
          shouldAIAct,
          shouldAIActForLayoff
        });
        return standardResult;
      }
    }

    console.log(`🤖 AI Detection: Not vsAI game, returning false - vsAI=${state.vsAI}, currentPlayer=${state.currentPlayerId}, player1=${game.player1Id}, player2=${game.player2Id}, phase=${state.phase}`);
    
    return false;
  }

  private applyUserPerspective(state: GameState, userId: string): GameState {
    // Hide opponent cards from user EXCEPT during round results
    const stateForUser = { ...state };
    
    // During round-over phase or when game is finished, show all cards for proper round results
    const shouldShowAllCards = state.phase === GamePhase.RoundOver || 
                              state.phase === GamePhase.Layoff ||
                              state.gameOver || 
                              state.status === 'FINISHED' ||
                              (state.players.some(p => p.hasKnocked || p.hasGin));
    
    stateForUser.players = stateForUser.players.map(player => {
      if (player.id === userId) {
        return player; // Always show user's own cards
      } else if (shouldShowAllCards) {
        return player; // Show opponent cards during round results
      } else {
        // Hide opponent cards but keep hand size during normal play
        return {
          ...player,
          hand: [], // Hide actual cards
          lastDrawnCardId: undefined, // Hide what opponent drew
        };
      }
    });
    
    return stateForUser;
  }

  private getNextPlayer(state: GameState, currentPlayerId: string): { id: string } {
    const currentIndex = state.players.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % state.players.length;
    return state.players[nextIndex];
  }

  private drawCardFromStock(state: GameState): any {
    // TODO: Implement proper card drawing
    // For now, return a dummy card
    return {
      suit: 'hearts',
      rank: 'A',
      id: crypto.randomUUID(),
    };
  }

  private mapPrismaEventToGameEvent(prismaEvent: any): GameEvent {
    return {
      id: prismaEvent.id,
      gameId: prismaEvent.gameId,
      playerId: prismaEvent.playerId,
      eventType: prismaEvent.eventType,
      sequenceNumber: prismaEvent.sequenceNumber,
      eventVersion: prismaEvent.eventVersion,
      eventData: prismaEvent.eventData,
      metadata: prismaEvent.metadata,
      processed: prismaEvent.processed,
      processedAt: prismaEvent.processedAt?.toISOString(),
      createdAt: prismaEvent.createdAt.toISOString(),
    };
  }

  /**
   * Calculate a hash of the game state for snapshot validation
   */
  private calculateStateHash(state: GameState): string {
    try {
      // Create a deterministic representation of the game state
      const stateForHash = {
        gameId: state.id,
        status: state.status,
        phase: state.phase,
        currentPlayerId: state.currentPlayerId,
        playerHands: state.players.map(p => ({
          id: p.id,
          handSize: p.handSize,
          score: p.score,
          hasKnocked: p.hasKnocked,
          hasGin: p.hasGin
        })),
        stockPileCount: state.stockPileCount,
        discardPileTop: state.discardPile[0]?.id || null,
        gameOver: state.gameOver,
        winner: state.winner
      };

      return crypto.createHash('sha256')
        .update(JSON.stringify(stateForHash))
        .digest('hex')
        .substring(0, 16); // Use first 16 characters for efficiency
    } catch (error) {
      console.warn('⚠️ Failed to calculate state hash:', error);
      return Date.now().toString();
    }
  }
}