import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../../lib/auth';
import { ReplayService } from '../../../../../src/services/replay';

const prisma = new PrismaClient();

/**
 * GET /api/games/[gameId]/spectate
 * 
 * Get spectator view of a game (no private player data)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    console.log('👁️ Spectator: Requesting spectator view for game', params.gameId);
    
    // Verify authentication (spectators must be logged in)
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication required for spectating' },
        { status: 401 }
      );
    }

    const spectatorId = authResult.user.id;

    // Load game metadata
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

    // Check if game allows spectating
    if (game.isPrivate) {
      return NextResponse.json(
        { error: 'Cannot spectate private games' },
        { status: 403 }
      );
    }

    // Check if user is a player in the game (players can't spectate their own games)
    if (game.player1Id === spectatorId || game.player2Id === spectatorId) {
      return NextResponse.json(
        { error: 'Players cannot spectate their own games' },
        { status: 403 }
      );
    }

    // For waiting games, return basic info
    if (game.status === 'WAITING') {
      return NextResponse.json({
        success: true,
        spectatorView: {
          gameId: params.gameId,
          status: 'WAITING',
          players: game.player1 ? [game.player1] : [],
          vsAI: game.vsAI,
          message: game.vsAI ? 'AI game in progress' : 'Waiting for second player to join'
        }
      });
    }

    console.log('👁️ Spectator: Rebuilding spectator game state');

    // Get the full game state and filter for spectator view
    const fullGameState = await ReplayService.rebuildFilteredState(params.gameId, spectatorId, true); // true = spectator mode

    if (!fullGameState) {
      return NextResponse.json(
        { error: 'Unable to load game state' },
        { status: 500 }
      );
    }

    // Create spectator-safe game state
    const spectatorGameState = {
      id: fullGameState.state.id,
      status: fullGameState.state.status,
      phase: fullGameState.state.phase,
      currentPlayerId: fullGameState.state.currentPlayerId,
      players: fullGameState.state.players?.map(player => ({
        id: player.id,
        username: player.username,
        handSize: player.hand?.length || player.handSize || 0,
        score: player.score,
        hasKnocked: player.hasKnocked,
        hasGin: player.hasGin,
        deadwood: player.deadwood,
        melds: player.melds // Melds are public after knocking
      })),
      stockPileCount: fullGameState.state.stockPileCount,
      discardPile: fullGameState.state.discardPile, // Public information
      turnTimer: fullGameState.state.turnTimer,
      isPrivate: fullGameState.state.isPrivate,
      vsAI: fullGameState.state.vsAI,
      winner: fullGameState.state.winner,
      gameOver: fullGameState.state.gameOver,
      roundScores: fullGameState.state.roundScores,
      roundNumber: fullGameState.state.roundNumber,
      
      // Spectator-specific info
      isSpectating: true,
      spectatorId: spectatorId,
      playerNames: {
        [game.player1Id]: game.player1?.username || 'Player 1',
        ...(game.player2Id && game.player2 ? { [game.player2Id]: game.player2.username } : {})
      }
    };

    console.log('✅ Spectator: Spectator view generated successfully for user', spectatorId);

    return NextResponse.json({
      success: true,
      spectatorView: spectatorGameState,
      streamVersion: fullGameState.version || 0 // Use version as stream version for spectators
    });

  } catch (error) {
    console.error('💥 Spectator: Unexpected error:', error);
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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}