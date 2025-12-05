import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { TurnController } from '../../../../../lib/turn-controller';
import { verifyAuth } from '../../../../../lib/auth';
import { EventStore } from '../../../../../src/services/eventStore';
import { ReplayService } from '../../../../../src/services/replay';

const prisma = new PrismaClient();
const turnController = new TurnController(prisma);

/**
 * Generate turn history from game events for frontend compatibility
 */
async function generateTurnHistoryFromEvents(prisma: PrismaClient, gameId: string) {
  try {
    // Get game events and player info
    const [events, game] = await Promise.all([
      prisma.gameEvent.findMany({
        where: { gameId },
        orderBy: { sequenceNumber: 'asc' }
      }),
      prisma.game.findUnique({
        where: { id: gameId },
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } }
        }
      })
    ]);

    if (!game) return [];

    // Create player lookup
    const playerLookup: { [playerId: string]: string } = {};
    if (game.player1) playerLookup[game.player1.id] = game.player1.username;
    if (game.player2) playerLookup[game.player2.id] = game.player2.username || 'AI Assistant';
    if (game.vsAI) playerLookup['ai-player'] = 'AI Assistant';

    // Convert events to turn history entries
    const turnHistory = events
      .filter(event => {
        // Only include player action events that should show in turn history
        return [
          'TAKE_UPCARD',
          'PASS_UPCARD',
          'DRAW_FROM_STOCK',
          'DRAW_FROM_DISCARD', 
          'DISCARD_CARD',
          'KNOCK',
          'GIN',
          'LAY_OFF'
        ].includes(event.eventType);
      })
      .map((event, index) => {
        const eventData = event.eventData as any;
        let description = '';
        let action = event.eventType;

        // Generate human-readable description based on event type
        switch (event.eventType) {
          case 'TAKE_UPCARD':
            const cardTaken = eventData.cardTaken ? `${eventData.cardTaken.rank} of ${eventData.cardTaken.suit}` : 'unknown card';
            description = `took the upcard (${cardTaken})`;
            break;
          case 'PASS_UPCARD':
            description = 'passed on the upcard';
            break;
          case 'DRAW_FROM_STOCK':
            description = 'drew a card from the stock';
            break;
          case 'DRAW_FROM_DISCARD':
            const cardDrawn = eventData.cardDrawn ? `${eventData.cardDrawn.rank} of ${eventData.cardDrawn.suit}` : 'a card';
            description = `drew ${cardDrawn} from the discard pile`;
            break;
          case 'DISCARD_CARD':
            const cardDiscarded = eventData.cardDiscarded ? `${eventData.cardDiscarded.rank} of ${eventData.cardDiscarded.suit}` : 'a card';
            description = `discarded ${cardDiscarded}`;
            break;
          case 'KNOCK':
            description = 'knocked';
            break;
          case 'GIN':
            description = 'went gin';
            break;
          case 'LAY_OFF':
            description = 'laid off cards';
            break;
          default:
            description = event.eventType.toLowerCase().replace(/_/g, ' ');
        }

        return {
          id: event.id,
          turnNumber: index + 1,
          playerId: event.playerId || 'system',
          playerName: event.playerId ? (playerLookup[event.playerId] || 'Unknown Player') : 'System',
          action,
          description,
          timestamp: event.createdAt.toISOString()
        };
      });

    return turnHistory;
  } catch (error) {
    console.error('❌ StateAPI: Failed to generate turn history:', error);
    return [];
  }
}

/**
 * GET /api/games/[gameId]/state
 * 
 * Event-Sourced Game State Endpoint
 * Loads game state by replaying events from the database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const { gameId } = params;

  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      console.log('❌ StateAPI: Authentication failed');
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const userId = authResult.user.id;

    // Load game state using new EventStore + ReplayService (with player filtering)
    let result;
    let streamVersion;
    
    try {
      // Get current stream version
      streamVersion = await EventStore.getCurrentVersion(gameId);
      
      // Rebuild game state with player filtering (hide opponent cards)
      const replayResult = await ReplayService.rebuildFilteredState(gameId, userId);
      
      result = {
        success: true,
        gameState: replayResult.state
      };
      
      // Double-check version consistency
      if (replayResult.version !== streamVersion) {
        console.warn(`⚠️ StateAPI: Version mismatch - replay: ${replayResult.version}, store: ${streamVersion}`);
        streamVersion = replayResult.version; // Use replay version as authoritative
      }
      
    } catch (error: any) {
      
      // Fallback to old TurnController method for compatibility
      result = await turnController.loadGameState(gameId, userId);
      streamVersion = 0; // Legacy - no stream version available
      
      if (!result.success) {
        return NextResponse.json(
          {
            error: result.error,
          },
          { status: 500 }
        );
      }
    }

    // Generate turn history from events for frontend compatibility
    const currentRoundTurnHistory = await generateTurnHistoryFromEvents(prisma, gameId);

    // Check if we need to trigger AI for layoff phase (when loading existing game)
    if (result.gameState.phase === 'layoff' && result.gameState.vsAI && !result.gameState.gameOver) {
      
      // Import and trigger AI queue processor
      const { getAIQueueProcessor } = await import('../../../../../lib/ai-queue-processor');
      const aiQueueProcessor = getAIQueueProcessor(prisma);
      
      // Trigger AI layoff processing asynchronously
      setImmediate(() => {
        aiQueueProcessor.queueAIMove(gameId).catch(error => {
          console.error('❌ StateAPI: AI queue processing failed:', error);
        });
      });
    }

    // Check if game is in waiting state and should return waitingState instead of state
    if (result.gameState.status === 'WAITING') {
      // For the new ready system, we return the full game state when WAITING
      // The frontend will handle showing the waiting/ready screen based on player count and ready status
    }

    return NextResponse.json({
      success: true,
      state: result.gameState,        // Renamed for Phase 1 API consistency
      streamVersion,                  // NEW: Stream version for optimistic concurrency
      gameId,                         // NEW: Echo gameId for client validation
      serverClock: new Date().toISOString(), // NEW: Server timestamp
      currentRoundTurnHistory,        // Legacy: For existing frontend compatibility
      version: 'event-sourced'        // Legacy: For existing frontend compatibility
    });

  } catch (error) {
    console.error('❌ StateAPI: Unexpected error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}