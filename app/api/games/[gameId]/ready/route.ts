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
  const fs = require('fs');
  const logEntry = `${new Date().toISOString()} - READY ENDPOINT HIT for game ${params.gameId}\n`;
  fs.appendFileSync('/tmp/ready-debug.log', logEntry);
  
  console.log(`🚨 READY ENDPOINT HIT: ${new Date().toISOString()}`);
  try {
    const { gameId } = params;
    console.log(`🎯 ReadyAPI: POST /api/games/${gameId}/ready - Starting request`);
    console.log(`🎯 ReadyAPI: Request timestamp: ${new Date().toISOString()}`);
    
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const user = authResult.user;
    
    // Get current game state
    const currentState = await ReplayService.rebuildState(gameId);
    
    // Handle both initial ready state and round-over ready state
    const isWaitingForPlayers = currentState.state.phase === 'waiting';
    const isRoundOver = currentState.state.phase === 'round_over';
    
    console.log(`🔍 ReadyAPI: Game phase: ${currentState.state.phase}, isWaitingForPlayers: ${isWaitingForPlayers}, isRoundOver: ${isRoundOver}`);
    
    if (!isWaitingForPlayers && !isRoundOver) {
      console.log(`❌ ReadyAPI: Game not in waiting or round_over phase, current phase: ${currentState.state.phase}`);
      return NextResponse.json({ error: 'Cannot mark ready in current game phase' }, { status: 400 });
    }

    // Create appropriate player ready event based on game phase
    const eventData = {
      playerId: user.id,
      ready: true
    };

    const eventType = isWaitingForPlayers ? 'PLAYER_READY' : 'PLAYER_READY_NEXT_ROUND';

    // Parse request body to get requestId and expectedVersion from client
    const body = await request.json().catch(() => ({}));
    const { requestId, expectedVersion } = body;
    
    console.log(`🔍 ReadyAPI: Using expectedVersion from client: ${expectedVersion}, current state version: ${currentState.version}`);

    const appendResult = await EventStore.appendEvent(
      gameId,
      requestId || null,
      expectedVersion || currentState.version, // Use client's expectedVersion if provided
      eventType,
      eventData,
      user.id
    );

    if (!appendResult.success) {
      console.error('❌ ReadyAPI: Failed to append event:', appendResult.error);
      return NextResponse.json({ 
        error: 'Failed to mark ready',
        details: appendResult.error 
      }, { status: 500 });
    }

    console.log(`✅ ReadyAPI: Player ${user.id} marked ready for ${isWaitingForPlayers ? 'game start' : 'next round'}`);

    // Check if both players are now ready - rebuild state after the PLAYER_READY event
    const updatedState = await ReplayService.rebuildState(gameId);
    
    console.log(`🔍 ReadyAPI: Checking if all players ready. Phase: ${updatedState.state.phase}`);
    console.log(`🔍 ReadyAPI: Players:`, updatedState.state.players.map(p => ({ 
      id: p.id, 
      username: p.username, 
      isReady: p.isReady, 
      isReadyForNextRound: p.isReadyForNextRound 
    })));
    
    const readyPlayers = updatedState.state.players.filter(p => isWaitingForPlayers ? p.isReady : p.isReadyForNextRound);
    const totalPlayers = updatedState.state.players.length;
    const allPlayersReady = readyPlayers.length === totalPlayers && totalPlayers >= 2;
      
    console.log(`🔍 ReadyAPI: Ready players: ${readyPlayers.length}/${totalPlayers}, All ready: ${allPlayersReady}, Game over: ${updatedState.state.gameOver}`);
    console.log(`🔍 ReadyAPI: Ready player IDs:`, readyPlayers.map(p => p.id));

    console.log(`🔍 ReadyAPI: About to check game start conditions:`);
    console.log(`🔍 ReadyAPI: - allPlayersReady: ${allPlayersReady}`);
    console.log(`🔍 ReadyAPI: - gameOver: ${updatedState.state.gameOver}`);
    console.log(`🔍 ReadyAPI: - isWaitingForPlayers: ${isWaitingForPlayers}`);
    
    // Also log to file for debugging
    const debugInfo = `${new Date().toISOString()} - Game ${gameId}: allPlayersReady=${allPlayersReady}, gameOver=${updatedState.state.gameOver}, isWaiting=${isWaitingForPlayers}, readyPlayers=${readyPlayers.length}/${totalPlayers}\n`;
    fs.appendFileSync('/tmp/ready-debug.log', debugInfo);

    if (allPlayersReady && !updatedState.state.gameOver) {
      if (isWaitingForPlayers) {
        console.log('🚀 ReadyAPI: Both players ready, starting initial game');
        fs.appendFileSync('/tmp/ready-debug.log', `${new Date().toISOString()} - STARTING GAME for ${gameId}\n`);
        
        // Create deck and deal cards for initial game
        const { createDeck, shuffleDeck } = await import('../../../../../packages/common/src/utils/cards');
        const deck = shuffleDeck(createDeck());
        
        // Deal 10 cards to each player
        const player1Hand = deck.splice(0, 10);
        const player2Hand = deck.splice(0, 10);
        const topDiscardCard = deck.splice(0, 1)[0];
        
        const player1 = updatedState.state.players[0];
        const player2 = updatedState.state.players[1];
        
        // Get the latest version after both PLAYER_READY events
        const latestState = await ReplayService.rebuildState(gameId);
        
        // Start the initial game
        const gameStartResult = await EventStore.appendEvent(
          gameId,
          null, // requestId
          latestState.version, // Use the current version after all PLAYER_READY events
          'GAME_STARTED',
          {
            gameId,
            startingPlayerId: player1.id, // First player starts
            player1Id: player1.id,
            player2Id: player2.id,
            initialDeal: {
              player1Hand,
              player2Hand,
              topDiscardCard,
              stockSize: deck.length,
              stockPile: deck
            }
          },
          user.id // Use the current user's ID to satisfy foreign key constraint
        );

        if (gameStartResult.success) {
          console.log(`🎮 ReadyAPI: Initial game started successfully with event sequence ${gameStartResult.newVersion}`);
          fs.appendFileSync('/tmp/ready-debug.log', `${new Date().toISOString()} - GAME_STARTED EVENT CREATED SUCCESSFULLY for ${gameId}\n`);
          
          // Update database record to sync with event store
          try {
            const { prisma } = await import('../../../../../src/utils/database');
            await prisma.game.update({
              where: { id: gameId },
              data: { 
                status: 'ACTIVE',
                streamVersion: gameStartResult.newVersion 
              }
            });
            console.log(`✅ ReadyAPI: Database status synced to ACTIVE`);
            fs.appendFileSync('/tmp/ready-debug.log', `${new Date().toISOString()} - DATABASE SYNCED TO ACTIVE for ${gameId}\n`);
          } catch (dbError) {
            console.error('❌ ReadyAPI: Failed to sync database status:', dbError);
            fs.appendFileSync('/tmp/ready-debug.log', `${new Date().toISOString()} - DATABASE SYNC FAILED: ${dbError}\n`);
          }
        } else {
          console.error('❌ ReadyAPI: Failed to start initial game:', gameStartResult.error);
          console.error('❌ ReadyAPI: EventStore error details:', JSON.stringify(gameStartResult.error, null, 2));
          fs.appendFileSync('/tmp/ready-debug.log', `${new Date().toISOString()} - GAME_STARTED EVENT FAILED: ${JSON.stringify(gameStartResult.error)}\n`);
        }
      } else {
        console.log('🚀 ReadyAPI: Both players ready, starting new round');
        
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
          appendResult.newVersion, // Use the version after the PLAYER_READY event was appended
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
          console.log(`🎮 ReadyAPI: New round started automatically`);
        } else {
          console.error('❌ ReadyAPI: Failed to start new round:', newRoundResult.error);
        }
      }
    }

    return NextResponse.json({ 
      success: true,
      message: `Player marked ready for ${isWaitingForPlayers ? 'game start' : 'next round'}`,
      allPlayersReady
    });

  } catch (error) {
    console.error('💥 ReadyAPI: Error marking player ready:', error);
    console.error('💥 ReadyAPI: Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  console.log(`🔍 ReadyAPI: GET endpoint called for game ${params.gameId}`);
  return NextResponse.json({ 
    message: 'Ready endpoint is working',
    gameId: params.gameId,
    timestamp: new Date().toISOString()
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}