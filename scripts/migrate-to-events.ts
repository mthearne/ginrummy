import { PrismaClient } from '@prisma/client';
import { EventType, createGameEvent } from '../packages/common/src/types/events';
import { eventLogger } from '../lib/event-logger';

/**
 * Data Migration Script: Convert Existing Games to Event Format
 * 
 * This script converts games stored in the old format (mutable gameState JSON)
 * to the new event-sourced format. It creates initial events based on the
 * current game state and existing game_events records.
 */

const prisma = new PrismaClient();

interface MigrationStats {
  totalGames: number;
  migratedGames: number;
  skippedGames: number;
  failedGames: number;
  errors: string[];
}

async function migrateToEventFormat(): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalGames: 0,
    migratedGames: 0,
    skippedGames: 0,
    failedGames: 0,
    errors: []
  };

  console.log('🔄 Starting migration to event-sourced format...');
  const startTime = Date.now();

  try {
    // Get all games that might need migration
    const games = await prisma.game.findMany({
      include: {
        player1: true,
        player2: true,
        gameEvents: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    stats.totalGames = games.length;
    console.log(`📊 Found ${games.length} games to process`);

    for (const game of games) {
      console.log(`\n🎮 Processing game ${game.id}...`);
      
      try {
        const migrationResult = await migrateGame(game);
        
        if (migrationResult.skipped) {
          stats.skippedGames++;
          console.log(`⏭️  Game ${game.id}: ${migrationResult.reason}`);
        } else {
          stats.migratedGames++;
          console.log(`✅ Game ${game.id}: Migrated successfully (${migrationResult.eventsCreated} events created)`);
        }
        
      } catch (error) {
        stats.failedGames++;
        const errorMsg = `Game ${game.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        stats.errors.push(errorMsg);
        console.error(`❌ ${errorMsg}`);
        eventLogger.error('Game migration failed', error, { gameId: game.id });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`\n🎉 Migration completed in ${duration}ms`);
    console.log(`📊 Results:`);
    console.log(`   Total games: ${stats.totalGames}`);
    console.log(`   Migrated: ${stats.migratedGames}`);
    console.log(`   Skipped: ${stats.skippedGames}`);
    console.log(`   Failed: ${stats.failedGames}`);
    
    if (stats.errors.length > 0) {
      console.log(`\n❌ Errors:`);
      stats.errors.forEach(error => console.log(`   ${error}`));
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }

  return stats;
}

async function migrateGame(game: any): Promise<{
  skipped: boolean;
  reason?: string;
  eventsCreated?: number;
}> {
  // Check if game already has proper event structure
  const eventCount = game.gameEvents.length;
  const hasSequencedEvents = game.gameEvents.some((e: any) => e.sequenceNumber != null);
  
  if (hasSequencedEvents && eventCount > 0) {
    return {
      skipped: true,
      reason: `Already has ${eventCount} sequenced events`
    };
  }

  // Check if game has stored state to migrate from
  if (!game.gameState && eventCount === 0) {
    return {
      skipped: true,
      reason: 'No game state or events to migrate'
    };
  }

  let eventsCreated = 0;

  // Start transaction for atomic migration
  await prisma.$transaction(async (tx) => {
    let sequenceNumber = 1;

    // Create GAME_CREATED event
    const gameCreatedEvent = createGameEvent(
      game.id,
      EventType.GAME_CREATED,
      {
        gameId: game.id,
        gameType: 'STANDARD',
        player1Id: game.player1Id,
        player2Id: game.player2Id,
        isPrivate: game.isPrivate,
        vsAI: game.vsAI,
        maxPlayers: game.maxPlayers
      },
      game.player1Id,
      sequenceNumber++
    );

    await tx.gameEvent.create({
      data: {
        id: gameCreatedEvent.id,
        gameId: gameCreatedEvent.gameId,
        playerId: gameCreatedEvent.playerId,
        eventType: gameCreatedEvent.eventType,
        sequenceNumber: gameCreatedEvent.sequenceNumber,
        eventVersion: gameCreatedEvent.eventVersion,
        eventData: gameCreatedEvent.eventData as any,
        metadata: gameCreatedEvent.metadata as any,
        processed: true,
        processedAt: new Date(),
        createdAt: new Date(gameCreatedEvent.createdAt),
      }
    });
    eventsCreated++;

    // If game is active/finished, create GAME_STARTED event
    if (game.status === 'ACTIVE' || game.status === 'FINISHED') {
      // Generate initial deal based on game state or reasonable defaults
      const gameStartedEvent = createGameEvent(
        game.id,
        EventType.GAME_STARTED,
        {
          gameId: game.id,
          player1Id: game.player1Id,
          player2Id: game.player2Id || (game.vsAI ? 'ai-player' : game.player1Id),
          startingPlayerId: game.currentPlayerId || game.player1Id,
          initialDeal: {
            player1Hand: [], // Would need to reconstruct from gameState if available
            player2Hand: [],
            topDiscardCard: { suit: 'hearts' as any, rank: 'A' as any, id: 'initial-discard' },
            stockSize: 31,
            stockPile: [] // Empty stock pile for migration
          }
        },
        game.player1Id,
        sequenceNumber++
      );

      await tx.gameEvent.create({
        data: {
          id: gameStartedEvent.id,
          gameId: gameStartedEvent.gameId,
          playerId: gameStartedEvent.playerId,
          eventType: gameStartedEvent.eventType,
          sequenceNumber: gameStartedEvent.sequenceNumber,
          eventVersion: gameStartedEvent.eventVersion,
          eventData: gameStartedEvent.eventData as any,
          metadata: gameStartedEvent.metadata as any,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(gameStartedEvent.createdAt),
        }
      });
      eventsCreated++;
    }

    // Convert existing game_events to new format (add sequence numbers)
    const existingEvents = game.gameEvents;
    for (let i = 0; i < existingEvents.length; i++) {
      const event = existingEvents[i];
      
      // Skip if already has sequence number
      if (event.sequenceNumber != null) continue;

      // Update existing event with sequence number and processed flag
      await tx.gameEvent.update({
        where: { id: event.id },
        data: {
          sequenceNumber: sequenceNumber++,
          eventVersion: event.eventVersion || 1,
          processed: true,
          processedAt: event.processedAt || new Date(),
          metadata: event.metadata || {}
        }
      });
    }

    // If game is finished, create GAME_FINISHED event
    if (game.status === 'FINISHED' && game.winnerId) {
      const gameFinishedEvent = createGameEvent(
        game.id,
        EventType.GAME_FINISHED,
        {
          gameId: game.id,
          winnerId: game.winnerId,
          winnerScore: game.winnerId === game.player1Id ? game.player1Score : game.player2Score,
          loserId: game.winnerId === game.player1Id ? game.player2Id : game.player1Id,
          loserScore: game.winnerId === game.player1Id ? game.player2Score : game.player1Score,
          endReason: 'KNOCK', // Default, would need more data to determine actual reason
          duration: game.finishedAt ? 
            (new Date(game.finishedAt).getTime() - new Date(game.createdAt).getTime()) : 0
        },
        game.winnerId,
        sequenceNumber++
      );

      await tx.gameEvent.create({
        data: {
          id: gameFinishedEvent.id,
          gameId: gameFinishedEvent.gameId,
          playerId: gameFinishedEvent.playerId,
          eventType: gameFinishedEvent.eventType,
          sequenceNumber: gameFinishedEvent.sequenceNumber,
          eventVersion: gameFinishedEvent.eventVersion,
          eventData: gameFinishedEvent.eventData as any,
          metadata: gameFinishedEvent.metadata as any,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(gameFinishedEvent.createdAt),
        }
      });
      eventsCreated++;
    }

    // Update game metadata
    await tx.game.update({
      where: { id: game.id },
      data: {
        eventCount: sequenceNumber - 1,
        lastEventAt: new Date(),
        updatedAt: new Date()
      }
    });
  });

  return {
    skipped: false,
    eventsCreated
  };
}

// Script execution
if (require.main === module) {
  migrateToEventFormat()
    .then(stats => {
      console.log('✅ Migration completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}

export { migrateToEventFormat };