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
      
      // Update game to active status in database if still waiting
      if (game.status === 'WAITING' as any) {
        await prisma.game.update({
          where: { id: gameId },
          data: {
            status: 'ACTIVE' as any
          }
        });
      }

      // TEMPORARILY DISABLED: Check if AI needs to move when state is loaded
      // This was causing turn state desynchronization issues
      const currentState = gameEngine.getState();
      if (currentState.currentPlayerId === 'ai-player' && !currentState.gameOver) {
        console.log('AI turn detected when loading state - skipping processing to avoid desync');
        // TODO: Process AI moves via separate async mechanism to avoid race conditions
      }

      // Save updated game state after AI moves (with fallback)
      try {
        await persistentGameCache.set(gameId, gameEngine);
      } catch (error) {
        console.log('Persistent cache failed, using fallback cache:', error.message);
        await fallbackGameCache.set(gameId, gameEngine);
      }

      return NextResponse.json({
        gameState: gameEngine.getState(),
        debug: {
          restorationMethod: 'ai_persistent_cache',
          cacheHit: true,
          aiProcessingSkipped: true,
          timestamp: new Date().toISOString(),
          gameEngineDebug: (gameEngine as any)._debugInfo || null
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
    
    // Update game to active status in database if still waiting
    if (game.status === 'WAITING' as any) {
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'ACTIVE' as any
        }
      });
    }

    // Save PvP game state to ensure it persists for future loads
    try {
      await persistentGameCache.set(gameId, gameEngine);
      console.log('PvP game state saved after load to ensure persistence');
    } catch (error) {
      console.log('Failed to save PvP game state after load:', error.message);
      await fallbackGameCache.set(gameId, gameEngine);
    }

    return NextResponse.json({
      gameState: gameEngine.getState(),
      debug: {
        restorationMethod: 'persistent_cache',
        cacheHit: true,
        timestamp: new Date().toISOString(),
        gameEngineDebug: (gameEngine as any)._debugInfo || null
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
  
  if (currentState.currentPlayerId !== 'ai-player' || currentState.phase !== 'upcard_decision') {
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

