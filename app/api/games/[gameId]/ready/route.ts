import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '../../../../../lib/auth';
import { EventStore } from '../../../../../src/services/eventStore';
import { ReplayService } from '../../../../../src/services/replay';

/**
 * POST /api/games/[gameId]/ready
 * 
 * Mark player as ready for next round or to continue after round ends
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    console.log('🎯 ReadyNextRoundAPI: POST /api/games/[gameId]/ready');
    
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const user = authResult.user;
    const { gameId } = params;
    
    // Get current game state
    const currentState = await ReplayService.rebuildState(gameId);
    
    if (currentState.state.phase !== 'round_over') {
      console.log(`❌ ReadyNextRoundAPI: Game not in round_over phase, current phase: ${currentState.state.phase}`);
      return NextResponse.json({ error: 'Game not in round over phase' }, { status: 400 });
    }

    // Create player ready event
    const eventData = {
      playerId: user.id,
      ready: true
    };

    const appendResult = await EventStore.appendEvent(
      gameId,
      null, // requestId
      currentState.version, // expectedVersion
      'PLAYER_READY_NEXT_ROUND',
      eventData,
      user.id
    );

    if (!appendResult.success) {
      console.error('❌ ReadyNextRoundAPI: Failed to append event:', appendResult.error);
      return NextResponse.json({ 
        error: 'Failed to mark ready',
        details: appendResult.error 
      }, { status: 500 });
    }

    console.log(`✅ ReadyNextRoundAPI: Player ${user.id} marked ready for next round`);

    // Check if both players are now ready
    const updatedState = await ReplayService.rebuildState(gameId);
    const allPlayersReady = updatedState.state.players.every(p => p.isReadyForNextRound);

    if (allPlayersReady && !updatedState.state.gameOver) {
      console.log('🚀 ReadyNextRoundAPI: Both players ready, starting new round');
      
      // Create new round event with new deal
      const { createDeck, shuffleDeck } = await import('../../../../../packages/common/src/utils/cards');
      const deck = shuffleDeck(createDeck());
      
      // Deal 10 cards to each player
      const player1Hand = deck.splice(0, 10);
      const player2Hand = deck.splice(0, 10);
      const topDiscardCard = deck.splice(0, 1)[0];
      
      const newRoundResult = await EventStore.appendEvent(
        gameId,
        null, // requestId
        updatedState.version, // expectedVersion
        'ROUND_STARTED',
        {
          roundNumber: (updatedState.state.roundNumber || 1) + 1,
          startedBy: 'system',
          newDeal: {
            player1Hand,
            player2Hand,
            topDiscardCard,
            stockSize: deck.length,
            stockPile: deck
          }
        },
        'system'
      );

      if (newRoundResult.success) {
        console.log(`🎮 ReadyNextRoundAPI: New round started automatically`);
      } else {
        console.error('❌ ReadyNextRoundAPI: Failed to start new round:', newRoundResult.error);
      }
    }

    return NextResponse.json({ 
      success: true,
      message: 'Player marked ready for next round',
      allPlayersReady
    });

  } catch (error) {
    console.error('💥 ReadyNextRoundAPI: Error marking player ready:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
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