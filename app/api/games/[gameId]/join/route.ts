import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../../lib/auth';
import { EventStore } from '../../../../../src/services/eventStore';
import { ReplayService } from '../../../../../src/services/replay';
import { createNotification } from '../../../../../src/utils/notifications';
import { EventSourcedGinRummyGame } from '../../../../../packages/common/src/game-engine/event-sourced-gin-rummy';
import { z } from 'zod';
import crypto from 'crypto';
import { maybeCaptureSnapshot } from '../../../../../src/services/snapshot';

const prisma = new PrismaClient();

const JoinGameSchema = z.object({
  requestId: z.string().uuid(),
  expectedVersion: z.number().optional().default(0)
});

/**
 * POST /api/games/[gameId]/join
 * 
 * Join a waiting PvP game using event-sourced architecture
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    console.log('🤝 GameJoin: Player attempting to join game', params.gameId);
    
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
    
    const parsed = JoinGameSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { requestId, expectedVersion } = parsed.data;

    // Load current game state
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

    // Validate game can be joined
    if (game.status !== 'WAITING') {
      return NextResponse.json(
        { error: 'Game is not waiting for players', status: game.status },
        { status: 400 }
      );
    }

    if (game.vsAI) {
      return NextResponse.json(
        { error: 'Cannot join AI game' },
        { status: 400 }
      );
    }

    if (game.player1Id === user.id) {
      return NextResponse.json(
        { error: 'You are already in this game' },
        { status: 400 }
      );
    }

    if (game.player2Id && game.player2Id !== 'waiting-for-player') {
      return NextResponse.json(
        { error: 'Game is full' },
        { status: 400 }
      );
    }

    console.log('✅ GameJoin: Game validation passed, adding player', user.id);

    // Generate PLAYER_JOINED event through EventStore
    const joinEventData = {
      gameId: params.gameId,
      playerId: user.id,
      playerUsername: user.username
    };

    const appendResult = await EventStore.appendEvent(
      params.gameId,
      requestId,
      expectedVersion,
      'PLAYER_JOINED',
      joinEventData,
      user.id
    );

    if (!appendResult.success) {
      console.log('❌ GameJoin: Event append failed:', appendResult.error);
      
      if (appendResult.error?.code === 'STATE_VERSION_MISMATCH') {
        return NextResponse.json({
          error: 'Game state changed',
          code: 'STATE_VERSION_MISMATCH',
          serverVersion: appendResult.error.serverVersion,
          clientVersion: expectedVersion
        }, { status: 409 });
      }
      
      if (appendResult.error?.code === 'DUPLICATE_REQUEST') {
        // For join operations, idempotency means returning success
        const currentState = await ReplayService.rebuildFilteredState(params.gameId, user.id);
        return NextResponse.json({
          success: true,
          streamVersion: appendResult.sequence,
          gameState: currentState.state,
          message: 'Already joined (idempotent)'
        });
      }
      
      return NextResponse.json(
        { error: 'Failed to join game', details: appendResult.error },
        { status: 500 }
      );
    }

    await maybeCaptureSnapshot(params.gameId, appendResult.sequence, {
      eventType: 'PLAYER_JOINED'
    });

    console.log('✅ GameJoin: PLAYER_JOINED event created, now creating GAME_STARTED event');

    // Now create GAME_STARTED event to deal cards and begin gameplay
    const gameEngine = new EventSourcedGinRummyGame(params.gameId);
    
    // For PvP games, we need to manually create the GAME_STARTED event with proper card dealing
    // since createInitialGameEvents() with vsAI=false only returns GAME_CREATED
    const { createDeck, shuffleDeck } = await import('@gin-rummy/common');
    const deck = shuffleDeck(createDeck());
    
    // Deal 10 cards to each player
    const player1Hand = deck.splice(0, 10);
    const player2Hand = deck.splice(0, 10);
    const topDiscardCard = deck.splice(0, 1)[0];
    
    const gameStartedEventData = {
      gameId: params.gameId,
      player1Id: game.player1Id,
      player2Id: user.id,
      startingPlayerId: game.player1Id, // Player 1 always starts first
      initialDeal: {
        player1Hand,
        player2Hand,
        topDiscardCard,
        stockSize: deck.length,
        stockPile: [...deck], // Remaining cards in stock
      },
    };

    console.log('🎮 GameJoin: Creating GAME_STARTED event with card dealing');
    
    // Generate new request ID for the GAME_STARTED event
    const startRequestId = crypto.randomUUID();
    
    const gameStartResult = await EventStore.appendEvent(
      params.gameId,
      startRequestId,
      appendResult.sequence, // Use the sequence from PLAYER_JOINED event
      'GAME_STARTED',
      gameStartedEventData,
      user.id // User who joined triggers the game start
    );

    if (!gameStartResult.success) {
      console.log('❌ GameJoin: Failed to create GAME_STARTED event:', gameStartResult.error);
      // Game is still joinable, but won't have proper card dealing
    } else {
      console.log('✅ GameJoin: GAME_STARTED event created successfully');
      const startedState = await ReplayService.rebuildState(params.gameId);
      await maybeCaptureSnapshot(params.gameId, gameStartResult.sequence, {
        eventType: 'GAME_STARTED',
        state: startedState.state
      });
    }

    // Update game record to reflect new player
    await prisma.game.update({
      where: { id: params.gameId },
      data: {
        player2Id: user.id,
        status: 'ACTIVE',
        currentPlayerId: game.player1Id // Player 1 starts first
      }
    });

    // Send notifications to both players
    try {
      // Notify Player 1 that Player 2 joined
      await createNotification({
        userId: game.player1Id,
        type: 'PLAYER_JOINED',
        title: 'Player Joined!',
        message: `${user.username} has joined your game. It's your turn to start!`,
        data: {
          gameId: params.gameId,
          joinedPlayerId: user.id,
          joinedPlayerUsername: user.username
        }
      });

      // Notify Player 2 that they successfully joined
      await createNotification({
        userId: user.id,
        type: 'GAME_STARTED',
        title: 'Game Started!',
        message: `You joined ${game.player1.username}'s game. Waiting for their first move.`,
        data: {
          gameId: params.gameId,
          opponentId: game.player1Id,
          opponentUsername: game.player1.username
        }
      });
    } catch (notificationError) {
      console.error('⚠️ GameJoin: Failed to send notifications:', notificationError);
      // Don't fail the join if notifications fail
    }

    // Rebuild game state after join
    const gameState = await ReplayService.rebuildFilteredState(params.gameId, user.id);

    // Send real-time game streaming update to all players
    try {
      const { notifyPlayerJoined, notifyGameStateUpdated } = await import('../../../../../src/utils/gameStreaming');
      
      // Notify about player join
      await notifyPlayerJoined(params.gameId, { id: user.id, username: user.username }, [game.player1Id, user.id]);
      
      // Notify about updated game state
      if (gameState) {
        await notifyGameStateUpdated(params.gameId, gameState.state, [game.player1Id, user.id]);
      }
    } catch (streamingError) {
      console.error('⚠️ GameJoin: Failed to send streaming updates:', streamingError);
      // Don't fail the join if streaming fails
    }

    console.log('✅ GameJoin: Player joined successfully:', {
      gameId: params.gameId,
      newPlayer: user.id,
      streamVersion: appendResult.sequence
    });

    return NextResponse.json({
      success: true,
      streamVersion: appendResult.sequence,
      gameState: gameState.state,
      metadata: {
        eventType: 'PLAYER_JOINED',
        playerId: user.id,
        version: 'event-sourced-v2'
      }
    });

  } catch (error) {
    console.error('💥 GameJoin: Unexpected error:', error);
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
