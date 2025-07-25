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

      // Check if AI needs to move when state is loaded
      const currentState = gameEngine.getState();
      if (currentState.currentPlayerId === 'ai-player' && !currentState.gameOver) {
        console.log('AI turn detected when loading state, starting background AI processing');
        // Process AI moves asynchronously to avoid blocking the response
        processAIMovesFromStateAsync(gameId, gameEngine).catch(error => {
          console.error('Background AI processing from state error:', error);
        });
      }

      // Save updated game state after AI moves (with fallback)
      try {
        await persistentGameCache.set(gameId, gameEngine);
      } catch (error) {
        console.log('Persistent cache failed, using fallback cache:', error.message);
        await fallbackGameCache.set(gameId, gameEngine);
      }

      return NextResponse.json({
        gameState: gameEngine.getState()
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

    return NextResponse.json({
      gameState: gameEngine.getState()
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

/**
 * Process AI moves asynchronously when loading state and it's AI's turn
 */
async function processAIMovesFromStateAsync(gameId: string, gameEngine: any): Promise<void> {
  try {
    console.log('Starting background AI processing from state load for game:', gameId);
    
    let movesProcessed = 0;
    const maxMoves = 5;
    
    while (movesProcessed < maxMoves) {
      const currentState = gameEngine.getState();
      
      if (currentState.currentPlayerId !== 'ai-player' || currentState.gameOver) {
        console.log('AI turn complete from state. Current player:', currentState.currentPlayerId, 'Game over:', currentState.gameOver);
        break;
      }
      
      console.log(`Processing AI move ${movesProcessed + 1} from state for phase:`, currentState.phase);
      
      const aiMove = gameEngine.getAISuggestion();
      if (!aiMove) {
        console.log('No AI move suggestion available for phase:', currentState.phase);
        break;
      }
      
      // Add thinking delay for natural AI behavior
      const thinkingDelay = Math.random() * 3500 + 500; // 500ms to 4000ms (same as move endpoint)
      console.log(`AI thinking for ${Math.round(thinkingDelay)}ms before making move from state:`, aiMove.type);
      await new Promise(resolve => setTimeout(resolve, thinkingDelay));
      
      console.log('AI making move from state:', aiMove.type);
      const aiMoveResult = gameEngine.makeMove(aiMove);
      
      if (!aiMoveResult.success) {
        console.error('AI move from state failed:', aiMoveResult.error);
        break;
      }
      
      console.log('AI move from state successful, new phase:', aiMoveResult.state.phase, 'next player:', aiMoveResult.state.currentPlayerId);
      movesProcessed++;
      
      // Add small delay between moves
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Prevent infinite loops
      if (movesProcessed >= maxMoves) {
        console.log('Max AI moves reached from state, stopping');
        break;
      }
    }
    
    console.log(`AI processed ${movesProcessed} moves from state load`);
    
    // Save updated game state and set completion flag
    try {
      await persistentGameCache.set(gameId, gameEngine);
    } catch (error) {
      console.log('Background AI cache save failed, using fallback cache:', error.message);
      await fallbackGameCache.set(gameId, gameEngine);
    }
    
    // Set completion flag for polling using fallback cache only
    const completionKey = `${gameId}_ai_complete`;
    const completionData = gameEngine.getState();
    try {
      // Only use fallback cache for completion flags to avoid persistence issues
      await fallbackGameCache.set(completionKey, completionData as any);
      console.log('AI completion flag set successfully from state for game:', gameId);
    } catch (error) {
      console.error('Failed to set AI completion flag from state:', error);
    }
    
  } catch (error) {
    console.error('AI processing from state failed:', error);
  }
}

