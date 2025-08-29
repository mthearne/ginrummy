import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';
import { GinRummyGame } from '@gin-rummy/common';
import { persistentGameCache } from '../../../../../src/utils/persistentGameCache';
import { fallbackGameCache } from '../../../../../src/utils/fallbackGameCache';

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { gameId } = params;

    // Get game from database
    const game = await prisma.game.findUnique({
      where: {
        id: gameId
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
    });

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Check if user is a player in this game
    const isPlayer = game.player1Id === decoded.userId || game.player2Id === decoded.userId;
    
    if (!isPlayer) {
      return NextResponse.json(
        { error: 'Access denied. You are not a player in this game.' },
        { status: 403 }
      );
    }

    // For AI games, use persistent cached state or initialize new game
    if (game.vsAI) {
      let gameEngine: any;
      
      try {
        gameEngine = await persistentGameCache.get(gameId);
      } catch (error) {
        console.log('Persistent cache failed, trying fallback cache:', error.message);
        gameEngine = await fallbackGameCache.get(gameId);
      }
      
      if (!gameEngine) {
        // This should not happen if the game exists in the database
        // The persistent cache should now handle initialization from database records
        console.error(`AI game engine still null after cache attempts for gameId: ${gameId}`);
        return NextResponse.json(
          { 
            error: 'Game state could not be loaded or initialized. Please try refreshing the page.',
            code: 'GAME_INITIALIZATION_FAILED'
          },
          { status: 500 }
        );
      }
      
      // Update game to active status in database if still waiting - PRESERVE gameState!
      if (game.status === 'WAITING' as any) {
        console.log(`Updating game ${gameId} status to ACTIVE - preserving existing gameState`);
        await prisma.game.update({
          where: { id: gameId },
          data: {
            status: 'ACTIVE' as any
            // DO NOT clear gameState - it should remain as-is
          }
        });
      }

      // Check if AI needs to move when state is loaded
      const currentState = gameEngine.getState();
      let aiProcessedMoves = false;
      
      const aiPlayer = currentState.players?.find(p => p.id !== decoded.userId);
      if (currentState.currentPlayerId === aiPlayer?.id && !currentState.gameOver) {
        console.log('AI turn detected when loading state - processing AI moves synchronously');
        console.log(`AI state: phase=${currentState.phase}, currentPlayer=${currentState.currentPlayerId}`);
        
        try {
          // Process AI moves immediately and synchronously to prevent race conditions
          const aiResults = gameEngine.processAIMoves();
          console.log(`AI processed ${aiResults.length} moves after state load`);
          
          if (aiResults.length > 0) {
            aiProcessedMoves = true;
          }
          
          // Log successful AI moves
          aiResults.forEach((result, index) => {
            if (result.success) {
              console.log(`AI move ${index + 1} SUCCESS: ${result.move?.type}`);
            } else {
              console.error(`AI move ${index + 1} FAILED: ${result.error}`);
            }
          });
          
          const stateAfterAI = gameEngine.getState();
          console.log(`State after AI processing: phase=${stateAfterAI.phase}, currentPlayer=${stateAfterAI.currentPlayerId}`);
          
        } catch (error) {
          console.error('AI processing failed during state load:', error);
        }
      }

      // Save state if AI actually processed moves during load
      if (aiProcessedMoves) {
        try {
          await persistentGameCache.set(gameId, gameEngine);
          console.log('Game state saved after AI processing during load');
        } catch (error) {
          console.log('Failed to save state after AI processing:', error.message);
          await fallbackGameCache.set(gameId, gameEngine);
        }
      }

      // Get final state after all processing (including AI moves)
      const finalGameState = gameEngine.getState();
      
      // CRITICAL: Final validation before sending to frontend
      const p1Cards = finalGameState.players[0]?.hand?.length || 0;
      const p2Cards = finalGameState.players[1]?.hand?.length || 0;
      
      if (p1Cards > 11 || p2Cards > 11) {
        console.error(`🚨 PREVENTING CORRUPTED STATE FROM REACHING FRONTEND!`);
        console.error(`Player hands: P1=${p1Cards}, P2=${p2Cards}`);
        console.error(`P1 hand:`, finalGameState.players[0]?.hand?.map(c => c.id));
        console.error(`P2 hand:`, finalGameState.players[1]?.hand?.map(c => c.id));
        
        return NextResponse.json({
          error: `Game state corrupted: Player has ${p1Cards > 11 ? p1Cards : p2Cards} cards instead of 10-11. Please refresh to reinitialize.`,
          code: 'CORRUPTED_GAME_STATE'
        }, { status: 500 });
      }
      
      let playerState;
      try {
        playerState = gameEngine.getPlayerState(decoded.userId);
      } catch (error) {
        console.error('getPlayerState failed for userId:', decoded.userId, 'error:', error.message);
        console.error('Available players:', finalGameState.players?.map(p => ({ id: p.id, username: p.username })));
        // Fallback to full state but log the error
        playerState = finalGameState;
      }

      return NextResponse.json({
        gameState: playerState,
        debug: {
          restorationMethod: 'ai_persistent_cache',
          cacheHit: true,
          aiProcessingSkipped: false,
          aiProcessedMoves: aiProcessedMoves,
          timestamp: new Date().toISOString(),
          finalPhase: finalGameState.phase,
          finalCurrentPlayer: finalGameState.currentPlayerId,
          gameEngineDebug: (gameEngine as any)._debugInfo || null,
          playerStateError: playerState === finalGameState ? 'getPlayerState failed, using full state' : null
        }
      });
    }

    // For waiting games, return waiting state
    if (game.status === 'WAITING') {
      return NextResponse.json({
        waitingState: {
          gameId: game.id,
          currentPlayers: game.player2Id ? 2 : 1,
          maxPlayers: game.maxPlayers,
        }
      });
    }

    // For active PvP games, use persistent cached state or initialize new game
    let gameEngine: any;
    
    try {
      gameEngine = await persistentGameCache.get(gameId);
    } catch (error) {
      console.log('PvP persistent cache failed, trying fallback cache:', error.message);
      gameEngine = await fallbackGameCache.get(gameId);
    }
    
    if (!gameEngine) {
      // This should not happen if the game exists in the database
      // The persistent cache should now handle initialization from database records
      console.error(`PvP game engine still null after cache attempts for gameId: ${gameId}`);
      return NextResponse.json(
        { 
          error: 'Game state could not be loaded or initialized. Please try refreshing the page.',
          code: 'GAME_INITIALIZATION_FAILED'
        },
        { status: 500 }
      );
    }
    
    // Update game to active status in database if still waiting - PRESERVE gameState!
    if (game.status === 'WAITING' as any) {
      console.log(`Updating PvP game ${gameId} status to ACTIVE - preserving existing gameState`);
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'ACTIVE' as any
          // DO NOT clear gameState - it should remain as-is
        }
      });
    }

    // Don't save PvP state here - we're just loading, not updating
    // Saving here was overwriting newer state with older restored state

    let playerState;
    try {
      playerState = gameEngine.getPlayerState(decoded.userId);
    } catch (error) {
      console.error('PvP getPlayerState failed for userId:', decoded.userId, 'error:', error.message);
      const currentState = gameEngine.getState();
      console.error('Available players:', currentState.players?.map(p => ({ id: p.id, username: p.username })));
      // Fallback to full state but log the error
      playerState = currentState;
    }

    return NextResponse.json({
      gameState: playerState,
      debug: {
        restorationMethod: 'persistent_cache',
        cacheHit: true,
        timestamp: new Date().toISOString(),
        gameEngineDebug: (gameEngine as any)._debugInfo || null,
        playerStateError: playerState === gameEngine.getState() ? 'getPlayerState failed, using full state' : null
      }
    });

  } catch (error) {
    console.error('Get game state error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process initial AI moves when a new game is created (upcard decision only)
 */
async function processInitialAIMoves(gameEngine: any): Promise<void> {
  const currentState = gameEngine.getState();
  
  const aiPlayer = currentState.players?.find(p => p.username === 'AI Assistant');
  if (currentState.currentPlayerId !== aiPlayer?.id || currentState.phase !== 'upcard_decision') {
    return; // Not AI's turn or not upcard decision phase
  }
  
  console.log('AI making initial upcard decision');
  const aiMove = gameEngine.getAISuggestion();
  
  if (!aiMove) {
    console.log('No AI move available for upcard decision phase');
    return;
  }
  
  console.log('AI making initial move:', aiMove.type);
  const moveResult = gameEngine.makeMove(aiMove);
  
  if (!moveResult.success) {
    console.error('AI initial move failed:', moveResult.error);
    return;
  }
  
  console.log('AI initial move successful, new phase:', moveResult.state.phase, 'next player:', moveResult.state.currentPlayerId);
}

// Removed processAIMovesFromStateAsync function - using synchronous AI processing during state load
// to prevent race conditions between state loading and AI move processing

