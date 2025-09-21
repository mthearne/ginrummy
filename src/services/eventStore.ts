import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { GameState } from '@gin-rummy/common';

const prisma = new PrismaClient();

/**
 * EventStore - Core service for multiplayer concurrency control
 * 
 * Handles:
 * - Optimistic concurrency control via expectedVersion
 * - Idempotency via requestId
 * - Atomic event appending with advisory locks
 * - Version conflict detection
 */

export interface EventAppendResult {
  success: boolean;
  sequence: number;
  error?: { 
    code: 'STATE_VERSION_MISMATCH' | 'DUPLICATE_REQUEST' | 'INTERNAL_ERROR';
    serverVersion?: number;
    message?: string;
  };
}

export interface GameEventData {
  id: string;
  gameId: string;
  playerId: string | null;
  eventType: string;
  sequenceNumber: number;
  eventData: any;
  metadata?: any;
  requestId: string | null;
  createdAt: Date;
}

/**
 * Generate a hash for advisory locks (convert string to bigint)
 * Uses MD5 hash and takes first 64 bits as PostgreSQL bigint
 */
function hash64(input: string): string {
  const hash = createHash('md5').update(input).digest('hex');
  // Take first 16 hex chars (64 bits) and convert to signed bigint
  const hex64 = hash.substring(0, 16);
  const bigint = BigInt('0x' + hex64);
  // Convert to signed 64-bit integer (PostgreSQL bigint range)
  const signed = bigint > 0x7FFFFFFFFFFFFFFFn 
    ? bigint - 0x10000000000000000n 
    : bigint;
  return signed.toString();
}

export class EventStore {
  /**
   * Get the current stream version (latest sequence number) for a game
   */
  static async getCurrentVersion(gameId: string): Promise<number> {
    const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT COALESCE(MAX(sequence_number), 0)::int as max 
      FROM game_events 
      WHERE game_id = ${gameId}
    `;
    return result[0]?.max ?? 0;
  }

  /**
   * Append an event to the game's event stream with concurrency control
   * 
   * @param gameId - Game identifier
   * @param requestId - Idempotency key (UUID v4) - null for legacy/system events
   * @param expectedVersion - Client's last seen stream version
   * @param eventType - Type of event
   * @param eventData - Event payload
   * @param userId - User making the action (optional)
   * @returns EventAppendResult with success/error details
   */
  static async appendEvent(
    gameId: string,
    requestId: string | null,
    expectedVersion: number,
    eventType: string,
    eventData: any,
    userId?: string
  ): Promise<EventAppendResult> {
    console.log(`📝 EventStore: Appending event ${eventType} for game ${gameId}`, {
      requestId,
      expectedVersion,
      userId
    });

    try {
      return await prisma.$transaction(async (tx) => {
        // 1. IDEMPOTENCY CHECK - if requestId exists, return existing event
        if (requestId) {
          const existingEvent = await tx.gameEvent.findUnique({
            where: {
              gameId_requestId: {
                gameId,
                requestId
              }
            },
            select: { sequenceNumber: true }
          });

          if (existingEvent) {
            console.log(`♻️  EventStore: Idempotent request ${requestId} - returning existing sequence ${existingEvent.sequenceNumber}`);
            return {
              success: true,
              sequence: existingEvent.sequenceNumber
            };
          }
        }

        // 2. ADVISORY LOCK - prevent concurrent modifications to same game
        const lockId = hash64(gameId);
        console.log(`🔐 EventStore: Acquiring advisory lock ${lockId} for game ${gameId}`);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId}::bigint)`;

        // 3. VERSION CHECK - ensure client has latest version
        const currentVersion = await tx.$queryRaw<Array<{ max: number | null }>>`
          SELECT COALESCE(MAX(sequence_number), 0)::int as max 
          FROM game_events 
          WHERE game_id = ${gameId}
        `;
        
        const serverVersion = currentVersion[0]?.max ?? 0;
        console.log(`📊 EventStore: Version check - expected: ${expectedVersion}, server: ${serverVersion}`);

        if (expectedVersion !== serverVersion) {
          console.log(`❌ EventStore: Version mismatch - client outdated`);
          return {
            success: false,
            sequence: serverVersion,
            error: {
              code: 'STATE_VERSION_MISMATCH',
              serverVersion,
              message: `Expected version ${expectedVersion}, but server is at version ${serverVersion}`
            }
          };
        }

        // 4. APPEND EVENT - create new event with next sequence number
        const newSequence = serverVersion + 1;
        console.log(`✅ EventStore: Creating event with sequence ${newSequence}`);

        const event = await tx.gameEvent.create({
          data: {
            gameId,
            playerId: userId || null,
            eventType: eventType as any, // Cast to EventType enum
            sequenceNumber: newSequence,
            eventData,
            metadata: {
              timestamp: new Date().toISOString(),
              requestId
            },
            requestId,
            processed: true,
            processedAt: new Date()
          }
        });

        // 5. UPDATE GAME STREAM VERSION CACHE
        await tx.game.update({
          where: { id: gameId },
          data: { 
            streamVersion: newSequence,
            eventCount: newSequence,
            lastEventAt: new Date()
          }
        });

        console.log(`🎉 EventStore: Successfully appended event ${event.id} with sequence ${newSequence}`);
        
        return {
          success: true,
          sequence: newSequence
        };

      }, {
        isolationLevel: 'Serializable' // Highest isolation for consistency
      });

    } catch (error: any) {
      console.error(`💥 EventStore: Failed to append event:`, error);
      
      // Handle specific database constraint violations
      if (error.code === 'P2002') { // Prisma unique constraint error
        if (error.meta?.target?.includes('requestId')) {
          return {
            success: false,
            sequence: 0,
            error: {
              code: 'DUPLICATE_REQUEST',
              message: 'Request ID already processed'
            }
          };
        }
      }

      return {
        success: false,
        sequence: 0,
        error: {
          code: 'INTERNAL_ERROR',
          message: error.message
        }
      };
    }
  }

  /**
   * Get events since a specific version (for incremental updates)
   */
  static async getEventsSince(gameId: string, fromVersion: number): Promise<GameEventData[]> {
    const events = await prisma.gameEvent.findMany({
      where: {
        gameId,
        sequenceNumber: {
          gt: fromVersion
        }
      },
      orderBy: {
        sequenceNumber: 'asc'
      }
    });

    return events.map(event => ({
      id: event.id,
      gameId: event.gameId,
      playerId: event.playerId,
      eventType: event.eventType,
      sequenceNumber: event.sequenceNumber,
      eventData: event.eventData,
      metadata: event.metadata,
      requestId: event.requestId,
      createdAt: event.createdAt
    }));
  }

  /**
   * Get all events for a game (for full replay)
   */
  static async getAllEvents(gameId: string): Promise<GameEventData[]> {
    return this.getEventsSince(gameId, 0);
  }

  /**
   * Get events in a range (for pagination)
   */
  static async getEventsRange(
    gameId: string, 
    fromVersion: number, 
    toVersion: number
  ): Promise<GameEventData[]> {
    const events = await prisma.gameEvent.findMany({
      where: {
        gameId,
        sequenceNumber: {
          gt: fromVersion,
          lte: toVersion
        }
      },
      orderBy: {
        sequenceNumber: 'asc'
      }
    });

    return events.map(event => ({
      id: event.id,
      gameId: event.gameId,
      playerId: event.playerId,
      eventType: event.eventType,
      sequenceNumber: event.sequenceNumber,
      eventData: event.eventData,
      metadata: event.metadata,
      requestId: event.requestId,
      createdAt: event.createdAt
    }));
  }

  /**
   * Get the latest snapshot for a game (future: for performance optimization)
   */
  static async getLatestSnapshot(gameId: string) {
    const snapshot = await prisma.gameSnapshot.findFirst({
      where: { gameId },
      orderBy: { sequenceNumber: 'desc' }
    });

    if (!snapshot) {
      return null;
    }

    return {
      id: snapshot.id,
      sequenceNumber: snapshot.sequenceNumber,
      state: snapshot.gameState as GameState,
      stateHash: snapshot.stateHash,
      createdAt: snapshot.createdAt,
      createdBy: snapshot.createdBy
    };
  }

  /**
   * Save or update a snapshot of the game state for faster replays
   */
  static async saveSnapshot(gameId: string, version: number, state: GameState) {
    try {
      const stateJson = JSON.stringify(state);
      const stateHash = createHash('sha256').update(stateJson).digest('hex');

      await prisma.gameSnapshot.upsert({
        where: {
          gameId_sequenceNumber: {
            gameId,
            sequenceNumber: version
          }
        },
        update: {
          gameState: state,
          stateHash,
          createdBy: 'SYSTEM'
        },
        create: {
          id: randomUUID(),
          gameId,
          sequenceNumber: version,
          gameState: state,
          stateHash,
          createdBy: 'SYSTEM'
        }
      });

      console.log(`📸 EventStore: Snapshot saved for game ${gameId} at version ${version}`);

      const retention = Number(process.env.GAME_SNAPSHOT_RETENTION || 5);
      const keepCount = Number.isFinite(retention) && retention > 0 ? Math.floor(retention) : 5;

      const snapshotsToDelete = await prisma.gameSnapshot.findMany({
        where: { gameId },
        orderBy: { sequenceNumber: 'desc' },
        skip: keepCount,
        select: { id: true },
      });

      if (snapshotsToDelete.length > 0) {
        await prisma.gameSnapshot.deleteMany({
          where: { id: { in: snapshotsToDelete.map((snapshot) => snapshot.id) } },
        });
        console.log(`📸 EventStore: Pruned ${snapshotsToDelete.length} old snapshots for game ${gameId}`);
      }
    } catch (error) {
      console.error(`📸 EventStore: Failed to save snapshot for game ${gameId} at version ${version}`, error);
    }
  }
}
