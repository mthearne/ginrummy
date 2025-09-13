import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../../lib/auth';
import { EventStore } from '../../../../../src/services/eventStore';
import { ReplayService } from '../../../../../src/services/replay';
import { z } from 'zod';
import crypto from 'crypto';

const prisma = new PrismaClient();

const ReadySchema = z.object({
  requestId: z.string().uuid(),
  expectedVersion: z.number().optional().default(0)
});

/**
 * POST /api/games/[gameId]/ready
 * 
 * Mark player as ready to start the game
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    console.log('🚦 PlayerReady: Player attempting to mark ready for game', params.gameId);
    
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const user = authResult.user;
    const body = await request.json().catch(() => ({}));
    console.log('🚦 PlayerReady: Request body:', JSON.stringify(body, null, 2));
    
    const parsed = ReadySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { requestId, expectedVersion } = parsed.data;

    // Load current game to validate
    const game = await prisma.game.findUnique({
      where: { id: params.gameId },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } }
      }
    });

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Validate player is in game
    if (game.player1Id !== user.id && game.player2Id !== user.id) {
      return NextResponse.json(
        { error: 'You are not a player in this game' },
        { status: 403 }
      );
    }

    // Validate game is in waiting state
    if (game.status !== 'WAITING') {
      return NextResponse.json(
        { error: 'Game is not waiting for players to be ready' },
        { status: 400 }
      );
    }

    console.log('✅ PlayerReady: Validation passed, marking player ready', user.id);

    // Create PLAYER_READY event
    const readyEventData = {
      gameId: params.gameId,
      playerId: user.id,
      playerUsername: user.username
    };

    const appendResult = await EventStore.appendEvent(
      params.gameId,
      requestId,
      expectedVersion,
      'PLAYER_READY',
      readyEventData,
      user.id
    );

    if (!appendResult.success) {
      console.log('❌ PlayerReady: Event append failed:', appendResult.error);
      
      if (appendResult.error?.code === 'STATE_VERSION_MISMATCH') {
        return NextResponse.json({
          error: 'Game state changed',
          code: 'STATE_VERSION_MISMATCH',
          serverVersion: appendResult.error.serverVersion,
          clientVersion: expectedVersion
        }, { status: 409 });
      }
      
      if (appendResult.error?.code === 'DUPLICATE_REQUEST') {
        // For ready operations, idempotency means returning success
        const currentState = await ReplayService.rebuildFilteredState(params.gameId, user.id);
        return NextResponse.json({
          success: true,
          streamVersion: appendResult.sequence,
          gameState: currentState.state,
          message: 'Already marked ready (idempotent)'
        });
      }
      
      return NextResponse.json(
        { error: 'Failed to mark ready', details: appendResult.error },
        { status: 500 }
      );
    }

    console.log('✅ PlayerReady: PLAYER_READY event created');

    // Rebuild game state to check if both players are ready
    const gameState = await ReplayService.rebuildFilteredState(params.gameId, user.id);
    
    // Check if both players are ready
    const readyPlayers = gameState.state.players?.filter(p => p.isReady) || [];
    const allPlayersReady = gameState.state.players?.length === 2 && readyPlayers.length === 2;

    console.log('🚦 PlayerReady: Ready status check:', {
      totalPlayers: gameState.state.players?.length,
      readyPlayers: readyPlayers.length,
      allPlayersReady
    });

    // If both players are ready, automatically start the game
    if (allPlayersReady && gameState.state.players && gameState.state.players.length === 2) {
      console.log('🎮 PlayerReady: Both players ready, starting game automatically');
      
      // Get player IDs from the game state (more reliable than database)
      const players = gameState.state.players;
      const player1Id = players[0]?.id;
      const player2Id = players[1]?.id;
      
      if (!player1Id || !player2Id) {
        console.error('❌ PlayerReady: Missing player IDs in game state');
        return NextResponse.json(
          { error: 'Invalid game state - missing players' },
          { status: 500 }
        );
      }
      
      // Create GAME_STARTED event to deal cards and begin gameplay
      const { createDeck, shuffleDeck } = await import('@gin-rummy/common');
      const deck = shuffleDeck(createDeck());
      
      // Deal 10 cards to each player
      const player1Hand = deck.splice(0, 10);
      const player2Hand = deck.splice(0, 10);
      const topDiscardCard = deck.splice(0, 1)[0];
      
      const gameStartedEventData = {
        gameId: params.gameId,
        player1Id,
        player2Id,
        startingPlayerId: player1Id, // Player 1 always starts first
        initialDeal: {
          player1Hand,
          player2Hand,
          topDiscardCard,
          stockSize: deck.length,
          stockPile: [...deck], // Remaining cards in stock
        },
      };

      const startRequestId = crypto.randomUUID();
      const gameStartResult = await EventStore.appendEvent(
        params.gameId,
        startRequestId,
        appendResult.sequence, // Use sequence from PLAYER_READY event
        'GAME_STARTED',
        gameStartedEventData,
        user.id
      );

      if (!gameStartResult.success) {
        console.log('❌ PlayerReady: Failed to create GAME_STARTED event:', gameStartResult.error);
      } else {
        console.log('✅ PlayerReady: GAME_STARTED event created successfully');
        
        // Update game record to active status
        await prisma.game.update({
          where: { id: params.gameId },
          data: {
            status: 'ACTIVE',
            currentPlayerId: player1Id // Player 1 starts first
          }
        });
      }

      // Rebuild game state again to get the started game state
      const finalGameState = await ReplayService.rebuildFilteredState(params.gameId, user.id);
      
      return NextResponse.json({
        success: true,
        streamVersion: gameStartResult.success ? gameStartResult.sequence : appendResult.sequence,
        gameState: finalGameState.state,
        message: 'Both players ready - game started!',
        gameStarted: true
      });
    }

    return NextResponse.json({
      success: true,
      streamVersion: appendResult.sequence,
      gameState: gameState.state,
      message: 'Marked as ready',
      waitingForOtherPlayer: true
    });

  } catch (error) {
    console.error('💥 PlayerReady: Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}