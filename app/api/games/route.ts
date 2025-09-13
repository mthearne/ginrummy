import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { TurnController } from '../../../lib/turn-controller';
import { EventSourcedGinRummyGame } from '../../../packages/common/src/game-engine/event-sourced-gin-rummy';
import { verifyAuth } from '../../../lib/auth';
import { eventLogger } from '../../../lib/event-logger';
import { EventStore } from '../../../src/services/eventStore';
import { ReplayService } from '../../../src/services/replay';
import crypto from 'crypto';
import { z } from 'zod';

const prisma = new PrismaClient();
const turnController = new TurnController(prisma);

// Add CORS headers to all responses
function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

const CreateGameSchema = z.object({
  vsAI: z.boolean().optional().default(false),
  isPrivate: z.boolean().optional().default(false),
  maxPlayers: z.number().min(2).max(4).optional().default(2),
  player2Id: z.string().optional(),
});

const ListGamesSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

/**
 * POST /api/games
 * 
 * Event-Sourced Game Creation Endpoint
 * Creates a new game using the bulletproof event-sourced architecture
 */
export async function POST(request: NextRequest) {
  try {
    console.log('🎮 GameCreate: Starting event-sourced game creation');
    
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      console.log('❌ GameCreate: Authentication failed');
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const user = authResult.user;
    const body = await request.json().catch(() => ({}));
    
    const parsed = CreateGameSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { vsAI, isPrivate, player2Id } = parsed.data;

    console.log('🎮 GameCreate: Creating game for user:', user.id, { vsAI, isPrivate, player2Id });

    // Create game with event sourcing
    const result = await prisma.$transaction(async (tx) => {
      // STEP 1: Create base game record
      const gameId = crypto.randomUUID();
      console.log('🎮 GameCreate: Generated game ID:', gameId);
      
      const game = await tx.game.create({
        data: {
          id: gameId,
          status: 'WAITING',
          gameType: 'STANDARD',
          player1Id: user.id,
          player2Id: vsAI ? 'ai-player' : player2Id, // For AI games, player2 is the AI player
          currentPlayerId: null, // Will be set when game starts
          isPrivate,
          vsAI,
          maxPlayers: 2,
          eventCount: 0,
          streamVersion: 0, // Initialize stream version
        },
      });

      console.log('🎮 GameCreate: Base game record created');

      // STEP 2: Generate initial events using event-sourced game engine
      const eventSourcedGame = new EventSourcedGinRummyGame(gameId);
      const initialEvents = eventSourcedGame.createInitialGameEvents(
        user.id,
        vsAI ? 'ai-player' : (player2Id || 'waiting-for-player'),
        vsAI,
        user.username, // player1Username
        vsAI ? 'AI' : undefined // player2Username (only for AI games)
      );

      console.log('🎮 GameCreate: Generated initial events:', initialEvents.length);

      // STEP 3: Persist events to database
      for (const event of initialEvents) {
        await tx.gameEvent.create({
          data: {
            id: event.id,
            gameId: event.gameId,
            playerId: event.playerId,
            eventType: event.eventType,
            sequenceNumber: event.sequenceNumber,
            eventVersion: event.eventVersion,
            eventData: event.eventData as any,
            metadata: event.metadata as any,
            processed: true,
            processedAt: new Date(),
            createdAt: new Date(event.createdAt),
          },
        });
      }

      console.log('🎮 GameCreate: Events persisted to database');

      // STEP 4: Update game metadata with event count, stream version, and status
      await tx.game.update({
        where: { id: gameId },
        data: {
          eventCount: initialEvents.length,
          streamVersion: initialEvents.length, // Stream version matches event count for initial creation
          lastEventAt: new Date(),
          currentPlayerId: vsAI ? user.id : null, // For AI games, human starts; PvP games have no current player until started
          status: vsAI ? 'ACTIVE' : 'WAITING', // AI games start immediately, PvP games wait for second player
        },
      });

      console.log('🎮 GameCreate: Game metadata updated');

      return { gameId, eventCount: initialEvents.length };
    });

    console.log('🎮 GameCreate: Transaction completed successfully');

    // STEP 5: Load the created game state using new ReplayService
    const stateResult = await ReplayService.rebuildFilteredState(result.gameId, user.id);
    const gameState = stateResult.state;
    const streamVersion = stateResult.version;
    
    console.log('🎮 GameCreate: Game state loaded from events:', {
      gameId: result.gameId,
      phase: gameState.phase,
      players: gameState.players?.length,
      vsAI: gameState.vsAI,
      streamVersion
    });

    // Log successful game creation
    eventLogger.logGameEvent(result.gameId, 'GAME_CREATED', {
      creator: user.id,
      vsAI,
      isPrivate,
      eventCount: result.eventCount
    });

    const response = NextResponse.json({
      success: true,
      gameId: result.gameId,
      gameState,
      streamVersion, // NEW: Stream version for optimistic concurrency
      message: vsAI ? 'AI game created successfully' : 'Game created - waiting for opponent',
      version: 'event-sourced-v2'
    });
    return addCorsHeaders(response);

  } catch (error) {
    console.error('❌ GameCreate: Failed to create game:', error);
    
    const response = NextResponse.json(
      { 
        error: 'Failed to create game',
        details: error instanceof Error ? error.message : 'Unknown error',
        version: 'event-sourced-v2'
      },
      { status: 500 }
    );
    return addCorsHeaders(response);
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const queryParams = {
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    };

    const parsed = ListGamesSchema.safeParse(queryParams);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { status, limit, offset } = parsed.data;

    // Build where clause
    const where: any = {};
    if (status) {
      where.status = status;
    } else {
      // Exclude cancelled and finished games when no specific status is requested
      where.status = {
        notIn: ['CANCELLED', 'FINISHED']
      };
    }

    // Exclude PvE games from public lobby - they should only appear in "My Games"
    where.vsAI = false;

    // Exclude games where the current user is already a participant
    where.AND = [
      {
        player1Id: {
          not: authResult.user.id
        }
      },
      {
        OR: [
          { player2Id: null },
          { player2Id: { not: authResult.user.id } }
        ]
      }
    ];

    // Get games from database
    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          player1: {
            select: {
              id: true,
              username: true,
              email: true,
              elo: true,
            }
          },
          player2: {
            select: {
              id: true,
              username: true,
              email: true,
              elo: true,
            }
          }
        }
      }),
      prisma.game.count({ where })
    ]);

    // Format games for frontend
    const formattedGames = games.map(game => ({
      id: game.id,
      status: game.status,
      playerCount: game.player2Id ? 2 : 1,
      maxPlayers: game.maxPlayers,
      isPrivate: game.isPrivate,
      vsAI: game.vsAI,
      createdAt: game.createdAt.toISOString(),
    }));

    return NextResponse.json({
      games: formattedGames,
      pagination: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error('List games error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      },
      { status: 500 }
    );
  }
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
