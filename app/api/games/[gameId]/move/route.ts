import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';
import { GinRummyGame } from '@gin-rummy/common';
import { persistentGameCache } from '../../../../../src/utils/persistentGameCache';
import { fallbackGameCache } from '../../../../../src/utils/fallbackGameCache';
import { GamePhase } from '@gin-rummy/common';

export async function POST(
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
    const move = await request.json();
    
    console.log('Move API called with:', { gameId, move, userId: decoded.userId });
    console.log('Move details - Type:', move.type, 'PlayerId:', move.playerId, 'Current user:', decoded.userId);

    // Get game from database
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
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

    // For AI games, get the persistent cached game engine with retry logic
    if (game.vsAI) {
      let gameEngine;
      let retrievalAttempts = 0;
      const maxRetrievalAttempts = 3;
      
      while (retrievalAttempts < maxRetrievalAttempts && !gameEngine) {
        retrievalAttempts++;
        
        try {
          gameEngine = await persistentGameCache.get(gameId);
          if (gameEngine) {
            console.log(`Game engine retrieved from persistent cache on attempt ${retrievalAttempts}`);
            break;
          }
        } catch (error) {
          console.log(`Persistent cache attempt ${retrievalAttempts} failed:`, error.message);
        }
        
        try {
          gameEngine = await fallbackGameCache.get(gameId);
          if (gameEngine) {
            console.log(`Game engine retrieved from fallback cache on attempt ${retrievalAttempts}`);
            break;
          }
        } catch (error) {
          console.log(`Fallback cache attempt ${retrievalAttempts} failed:`, error.message);
        }
        
        // Brief delay before retry to handle potential race conditions
        if (retrievalAttempts < maxRetrievalAttempts) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
      
      if (!gameEngine) {
        console.log('Game engine not found in any cache after', maxRetrievalAttempts, 'attempts for gameId:', gameId);
        
        return NextResponse.json(
          { 
            error: 'Game state not found. Please refresh the page to reload the game.',
            code: 'GAME_STATE_LOST'
          },
          { status: 400 }
        );
      }

      // Validate retrieved game state consistency
      const retrievedState = gameEngine.getState();
      if (!retrievedState || !retrievedState.id || retrievedState.id !== gameId) {
        console.error('Retrieved game state is invalid or doesn\'t match gameId:', gameId);
        return NextResponse.json(
          { 
            error: 'Game state corruption detected. Please refresh the page.',
            code: 'GAME_STATE_CORRUPT'
          },
          { status: 400 }
        );
      }

      // Make the player's move
      console.log('Processing player move:', move.type, 'by player:', decoded.userId);
      console.log('Current game state - Phase:', retrievedState.phase, 'Current player:', retrievedState.currentPlayerId);
      console.log('Move validation - Move player:', move.playerId, 'Backend current player:', retrievedState.currentPlayerId, 'Match:', move.playerId === retrievedState.currentPlayerId);
      console.log('Backend game state details - Phase:', retrievedState.phase, 'Game ID:', retrievedState.id, 'Players:', retrievedState.players?.map(p => p.id));
      
      const moveResult = gameEngine.makeMove(move);
      
      if (!moveResult.success) {
        console.log('Move failed with error:', moveResult.error);
        
        // Enhanced error logging for upcard phase issues
        if (moveResult.error === 'Not your turn') {
          console.error('UPCARD PHASE DEBUG - Turn validation failed:');
          console.error('- Move type:', move.type);
          console.error('- Move player ID:', move.playerId);
          console.error('- Backend current player ID:', retrievedState.currentPlayerId);
          console.error('- Game phase:', retrievedState.phase);
          console.error('- User ID from token:', decoded.userId);
          console.error('- Full move object:', JSON.stringify(move, null, 2));
          console.error('- Players in game:', retrievedState.players?.map(p => ({ id: p.id, username: p.username })));
        }
        
        return NextResponse.json(
          { error: moveResult.error || 'Invalid move' },
          { status: 400 }
        );
      }

      console.log('Player move successful, new phase:', moveResult.state.phase, 'current player:', moveResult.state.currentPlayerId);

      // Save player's move immediately
      console.log('Saving game state after move - Phase:', moveResult.state.phase, 'Current player:', moveResult.state.currentPlayerId);
      try {
        await persistentGameCache.set(gameId, gameEngine);
        console.log('Game state saved to persistent cache successfully');
      } catch (error) {
        console.log('Persistent cache save failed, using fallback cache:', error.message);
        await fallbackGameCache.set(gameId, gameEngine);
        console.log('Game state saved to fallback cache');
      }

      // Return response to player immediately
      const playerResponse = NextResponse.json({
        success: true,
        gameState: gameEngine.getState()
      });

      // Process AI response moves asynchronously only if it's now AI's turn
      const currentState = gameEngine.getState();
      if (currentState.currentPlayerId === 'ai-player' && !currentState.gameOver) {
        console.log('AI turn detected after player move, starting background AI processing');
        // Add a small delay to prevent race conditions with immediate player moves
        setTimeout(() => {
          processAIResponseMovesAsync(gameId, gameEngine).catch(error => {
            console.error('Background AI processing error:', error);
          });
        }, 100); // 100ms delay to ensure cache consistency
      } else {
        console.log('Not AI turn after player move. Current player:', currentState.currentPlayerId, 'Game over:', currentState.gameOver);
      }

      return playerResponse;
    }

    // For PvP games, this would need different handling
    return NextResponse.json(
      { error: 'PvP games not yet implemented' },
      { status: 501 }
    );

  } catch (error) {
    console.error('Make move error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Generate a random AI thinking delay between 0.5-4 seconds
 */
function getRandomAIThinkingDelay(): number {
  return Math.random() * 3500 + 500; // 500ms to 4000ms
}

/**
 * Process AI response moves after a player move
 */
async function processAIResponseMoves(gameEngine: any, maxMoves: number = 5): Promise<void> {
  let movesProcessed = 0;
  
  while (movesProcessed < maxMoves) {
    const currentState = gameEngine.getState();
    
    if (currentState.currentPlayerId !== 'ai-player' || currentState.gameOver) {
      console.log('AI turn complete. Current player:', currentState.currentPlayerId, 'Game over:', currentState.gameOver);
      break;
    }
    
    console.log(`Processing AI response move ${movesProcessed + 1} for phase:`, currentState.phase);
    
    const aiMove = gameEngine.getAISuggestion();
    if (!aiMove) {
      console.log('No AI move suggestion available for phase:', currentState.phase);
      break;
    }
    
    // Add thinking delay for more natural AI behavior
    const thinkingDelay = getRandomAIThinkingDelay();
    console.log(`AI thinking for ${Math.round(thinkingDelay)}ms before making move:`, aiMove.type);
    await new Promise(resolve => setTimeout(resolve, thinkingDelay));
    
    // Validate turn state before making AI move
    const preMoveState = gameEngine.getState();
    if (preMoveState.currentPlayerId !== 'ai-player') {
      console.error('Turn state changed during AI thinking, aborting AI move. Current player:', preMoveState.currentPlayerId);
      break;
    }
    
    console.log('AI making response move:', aiMove.type);
    const aiMoveResult = gameEngine.makeMove(aiMove);
    
    if (!aiMoveResult.success) {
      console.error('AI response move failed:', aiMoveResult.error);
      break;
    }
    
    console.log('AI response move successful, new phase:', aiMoveResult.state.phase, 'next player:', aiMoveResult.state.currentPlayerId);
    movesProcessed++;
    
    // Add a small delay between AI moves to prevent race conditions
    await new Promise(resolve => setTimeout(resolve, 50));
    
    // Prevent infinite loops
    if (movesProcessed >= maxMoves) {
      console.log('Max AI response moves reached, stopping');
      break;
    }
  }
  
  console.log(`AI processed ${movesProcessed} response moves`);
}

/**
 * Process AI response moves asynchronously in the background
 */
async function processAIResponseMovesAsync(gameId: string, gameEngine: any): Promise<void> {
  try {
    console.log('Starting background AI processing for game:', gameId);
    
    // Create a fresh copy of the game engine to avoid state conflicts
    const gameEngineState = gameEngine.getState();
    console.log('AI processing with state - Phase:', gameEngineState.phase, 'Current player:', gameEngineState.currentPlayerId);
    
    // Process AI moves with thinking delays
    await processAIResponseMoves(gameEngine);
    
    // Save updated game state after AI moves with retry logic
    let saveAttempts = 0;
    const maxSaveAttempts = 3;
    
    while (saveAttempts < maxSaveAttempts) {
      try {
        await persistentGameCache.set(gameId, gameEngine);
        console.log('AI game state saved to persistent cache successfully after', saveAttempts + 1, 'attempts');
        break;
      } catch (error) {
        saveAttempts++;
        console.log(`AI cache save attempt ${saveAttempts} failed:`, error.message);
        
        if (saveAttempts >= maxSaveAttempts) {
          console.log('Using fallback cache after persistent cache failures');
          await fallbackGameCache.set(gameId, gameEngine);
        } else {
          // Brief delay before retry to avoid immediate conflicts
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    }
    
    console.log('Background AI processing completed for game:', gameId);
    
    // Set a simple completion flag using fallback cache only (since completion data is temporary)
    const completionKey = `${gameId}_ai_complete`;
    const completionData = gameEngine.getState();
    console.log('Setting AI completion flag with state - Phase:', completionData.phase, 'Current player:', completionData.currentPlayerId);
    
    try {
      // Only use fallback cache for completion flags to avoid persistence issues
      await fallbackGameCache.set(completionKey, completionData as any);
      console.log('AI completion flag set successfully for game:', gameId);
    } catch (error) {
      console.error('Failed to set AI completion flag:', error);
    }
    
  } catch (error) {
    console.error('Background AI processing failed for game:', gameId, error);
  }
}