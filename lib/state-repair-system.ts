import { PrismaClient } from '@prisma/client';
import { EventSourcingEngine } from '../packages/common/src/game-engine/event-sourcing';
import { GameEvent, EventType } from '../packages/common/src/types/events';
import { eventLogger } from './event-logger';

/**
 * Automatic State Repair System
 * 
 * Detects and repairs inconsistencies in the event-sourced system.
 * This provides automatic recovery from any database corruption or
 * inconsistencies that might occur.
 */
export class StateRepairSystem {
  constructor(private prisma: PrismaClient) {}

  /**
   * Validate and repair a single game's state
   */
  async validateAndRepairGame(gameId: string): Promise<{
    success: true;
    repairsApplied: string[];
    finalState: any;
  } | {
    success: false;
    error: string;
    criticalIssues: string[];
  }> {
    const timerId = eventLogger.startTimer('validateAndRepairGame', { gameId });
    const repairsApplied: string[] = [];
    
    try {
      eventLogger.info('🔧 Starting game validation and repair', { gameId });

      // STEP 1: Load game metadata
      const game = await this.prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: true,
          player2: true,
        }
      });

      if (!game) {
        return {
          success: false,
          error: 'Game not found',
          criticalIssues: ['GAME_NOT_FOUND']
        };
      }

      // STEP 2: Load all events
      const events = await this.prisma.gameEvent.findMany({
        where: { gameId },
        orderBy: { sequenceNumber: 'asc' }
      });

      eventLogger.debug('Loaded events for validation', { 
        gameId, 
        eventCount: events.length 
      });

      // STEP 3: Validate event sequence integrity
      const sequenceIssues = this.validateEventSequence(events);
      if (sequenceIssues.length > 0) {
        eventLogger.warn('Event sequence issues detected', { 
          gameId, 
          issues: sequenceIssues 
        });

        // Attempt to repair sequence issues
        const sequenceRepairs = await this.repairEventSequence(gameId, events);
        repairsApplied.push(...sequenceRepairs);
      }

      // STEP 4: Validate events can be replayed
      const gameEvents = events.map(this.mapPrismaEventToGameEvent);
      let replayState;
      try {
        const eventSourcingEngine = new EventSourcingEngine(gameId, gameEvents);
        replayState = eventSourcingEngine.replayEvents();
        eventLogger.debug('Event replay successful', { gameId });
      } catch (error) {
        eventLogger.error('Event replay failed', error, { gameId });
        return {
          success: false,
          error: `Event replay failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          criticalIssues: ['EVENT_REPLAY_FAILURE']
        };
      }

      // STEP 5: Validate game metadata consistency
      const metadataIssues = this.validateGameMetadata(game, replayState, events);
      if (metadataIssues.length > 0) {
        eventLogger.warn('Game metadata inconsistencies detected', { 
          gameId, 
          issues: metadataIssues 
        });

        // Attempt to repair metadata
        const metadataRepairs = await this.repairGameMetadata(gameId, replayState, events);
        repairsApplied.push(...metadataRepairs);
      }

      // STEP 6: Validate player data consistency
      const playerIssues = this.validatePlayerData(game, replayState);
      if (playerIssues.length > 0) {
        eventLogger.warn('Player data inconsistencies detected', { 
          gameId, 
          issues: playerIssues 
        });
        
        repairsApplied.push('PLAYER_DATA_VALIDATED');
      }

      eventLogger.endTimer(timerId);
      eventLogger.info('🔧 Game validation and repair completed', { 
        gameId, 
        repairsApplied: repairsApplied,
        repairs: repairsApplied
      });

      return {
        success: true,
        repairsApplied,
        finalState: replayState
      };

    } catch (error) {
      eventLogger.endTimer(timerId);
      eventLogger.error('Game validation and repair failed', error, { gameId });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        criticalIssues: ['VALIDATION_SYSTEM_FAILURE']
      };
    }
  }

  /**
   * Validate all active games
   */
  async validateAllActiveGames(): Promise<{
    totalGames: number;
    validatedGames: number;
    repairedGames: number;
    failedGames: number;
    results: Array<{
      gameId: string;
      status: 'SUCCESS' | 'FAILURE';
      repairsApplied: string[];
      error?: string;
    }>;
  }> {
    const timerId = eventLogger.startTimer('validateAllActiveGames');
    
    try {
      eventLogger.info('🔧 Starting validation of all active games');

      // Get all active games
      const activeGames = await this.prisma.game.findMany({
        where: {
          status: { in: ['WAITING', 'ACTIVE'] }
        },
        select: { id: true }
      });

      const results: any[] = [];
      let validatedGames = 0;
      let repairedGames = 0;
      let failedGames = 0;

      for (const game of activeGames) {
        const result = await this.validateAndRepairGame(game.id);
        
        if (result.success) {
          validatedGames++;
          if (result.repairsApplied.length > 0) {
            repairedGames++;
          }
          
          results.push({
            gameId: game.id,
            status: 'SUCCESS' as const,
            repairsApplied: result.repairsApplied
          });
        } else {
          failedGames++;
          results.push({
            gameId: game.id,
            status: 'FAILURE' as const,
            repairsApplied: [],
            error: result.error
          });
        }
      }

      eventLogger.endTimer(timerId);
      eventLogger.info('🔧 Bulk game validation completed', {
        totalGames: activeGames.length,
        validatedGames,
        repairedGames,
        failedGames
      });

      return {
        totalGames: activeGames.length,
        validatedGames,
        repairedGames,
        failedGames,
        results
      };

    } catch (error) {
      eventLogger.endTimer(timerId);
      eventLogger.error('Bulk game validation failed', error);
      throw error;
    }
  }

  // Private helper methods

  private validateEventSequence(events: any[]): string[] {
    const issues: string[] = [];

    if (events.length === 0) {
      return issues; // Empty sequence is valid
    }

    // Check for gaps in sequence numbers
    for (let i = 0; i < events.length; i++) {
      const expectedSequence = i + 1;
      if (events[i].sequenceNumber !== expectedSequence) {
        issues.push(`SEQUENCE_GAP: Expected ${expectedSequence}, found ${events[i].sequenceNumber} at index ${i}`);
      }
    }

    // Check for duplicate sequence numbers
    const sequenceNumbers = events.map(e => e.sequenceNumber);
    const uniqueSequences = new Set(sequenceNumbers);
    if (uniqueSequences.size !== sequenceNumbers.length) {
      issues.push('DUPLICATE_SEQUENCES: Duplicate sequence numbers detected');
    }

    // Check for missing processed flags
    const unprocessedEvents = events.filter(e => !e.processed);
    if (unprocessedEvents.length > 0) {
      issues.push(`UNPROCESSED_EVENTS: ${unprocessedEvents.length} events not marked as processed`);
    }

    return issues;
  }

  private async repairEventSequence(gameId: string, events: any[]): Promise<string[]> {
    const repairs: string[] = [];

    // Mark all events as processed if they aren't
    const unprocessedEvents = events.filter(e => !e.processed);
    if (unprocessedEvents.length > 0) {
      await this.prisma.gameEvent.updateMany({
        where: {
          gameId,
          processed: false
        },
        data: {
          processed: true,
          processedAt: new Date()
        }
      });
      repairs.push(`MARKED_PROCESSED: ${unprocessedEvents.length} events marked as processed`);
    }

    return repairs;
  }

  private validateGameMetadata(game: any, replayState: any, events: any[]): string[] {
    const issues: string[] = [];

    // Check event count consistency
    if (game.eventCount !== events.length) {
      issues.push(`EVENT_COUNT_MISMATCH: Game shows ${game.eventCount}, actual events: ${events.length}`);
    }

    // Check current player consistency
    if (game.currentPlayerId !== replayState.currentPlayerId) {
      issues.push(`CURRENT_PLAYER_MISMATCH: Game shows ${game.currentPlayerId}, replay shows ${replayState.currentPlayerId}`);
    }

    // Check status consistency
    if (game.status !== replayState.status) {
      issues.push(`STATUS_MISMATCH: Game shows ${game.status}, replay shows ${replayState.status}`);
    }

    return issues;
  }

  private async repairGameMetadata(gameId: string, replayState: any, events: any[]): Promise<string[]> {
    const repairs: string[] = [];

    try {
      await this.prisma.game.update({
        where: { id: gameId },
        data: {
          eventCount: events.length,
          currentPlayerId: replayState.currentPlayerId,
          status: replayState.status,
          lastEventAt: events.length > 0 ? events[events.length - 1].createdAt : null,
          updatedAt: new Date()
        }
      });
      repairs.push('METADATA_SYNCED: Game metadata synchronized with replay state');
    } catch (error) {
      eventLogger.error('Failed to repair game metadata', error, { gameId });
    }

    return repairs;
  }

  private validatePlayerData(game: any, replayState: any): string[] {
    const issues: string[] = [];

    // Ensure we have the expected number of players
    if (!game.player1Id) {
      issues.push('MISSING_PLAYER1: Game missing player1');
    }

    if (!game.vsAI && !game.player2Id) {
      issues.push('MISSING_PLAYER2: PvP game missing player2');
    }

    if (replayState.players.length === 0) {
      issues.push('NO_PLAYERS_IN_STATE: Replay state has no players');
    }

    return issues;
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
}