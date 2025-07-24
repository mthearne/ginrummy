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
    console.log('Player ID verification - Move player ID:', move.playerId, 'Token user ID:', decoded.userId, 'Match:', move.playerId === decoded.userId);

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
    console.log('Player access check - DB player1:', game.player1Id, 'DB player2:', game.player2Id, 'Token user:', decoded.userId, 'Is player:', isPlayer);
    
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

      // Debug player ID mapping
      console.log('Player ID mapping verification:');
      console.log('- Database player1Id:', game.player1Id);
      console.log('- Database player2Id:', game.player2Id);
      console.log('- Game engine player IDs:', retrievedState.players?.map(p => ({ id: p.id, username: p.username })));
      console.log('- Move playerId:', move.playerId);
      console.log('- Current game player:', retrievedState.currentPlayerId);

      // Make the player's move using new atomic system
      console.log('\n=== ATOMIC MOVE PROCESSING START ===');
      console.log('Move:', move.type, 'by player:', decoded.userId);
      console.log('Game state - Phase:', retrievedState.phase, 'Current player:', retrievedState.currentPlayerId);
      console.log('Turn state before move:', gameEngine.getTurnState());
      console.log('Processing lock status:', gameEngine.isProcessing());
      
      const moveResult = gameEngine.makeMove(move);
      
      if (!moveResult.success) {
        console.log('Move failed with error:', moveResult.error);
        console.log('Turn state after failed move:', gameEngine.getTurnState());
        
        // Enhanced error logging for debugging
        if (moveResult.error?.includes('Not your turn')) {
          console.error('TURN VALIDATION DEBUG:');
          console.error('- Move type:', move.type);
          console.error('- Move player ID:', move.playerId);
          console.error('- Backend current player ID:', retrievedState.currentPlayerId);
          console.error('- Game phase:', retrievedState.phase);
          console.error('- Turn state:', gameEngine.getTurnState());
          console.error('- State changes:', moveResult.stateChanges);
        }
        
        return NextResponse.json(
          { error: moveResult.error || 'Invalid move' },
          { status: 400 }
        );
      }

      console.log('\n=== PLAYER MOVE SUCCESS ===');
      console.log('State changes:', moveResult.stateChanges);
      console.log('New game state - Phase:', moveResult.state.phase, 'Current player:', moveResult.state.currentPlayerId);
      console.log('Turn state after move:', gameEngine.getTurnState());

      // Process AI moves synchronously using new atomic system
      const currentState = gameEngine.getState();
      if (currentState.currentPlayerId === 'ai-player' && !currentState.gameOver) {
        console.log('\n=== AI PROCESSING START ===');
        console.log('AI turn detected - processing synchronously');
        console.log('Pre-AI state - Phase:', currentState.phase, 'Current player:', currentState.currentPlayerId);
        
        try {
          const startTime = Date.now();
          const aiResults = gameEngine.processAIMoves();
          const endTime = Date.now();
          
          console.log('\n=== AI PROCESSING COMPLETE ===');
          console.log('Processing time:', endTime - startTime, 'ms');
          console.log('AI moves processed:', aiResults.length);
          
          // Log AI move results
          aiResults.forEach((result, index) => {
            if (result.success) {
              console.log(`AI move ${index + 1} SUCCESS:`, result.stateChanges);
            } else {
              console.error(`AI move ${index + 1} FAILED:`, result.error);
            }
          });
          
          const finalState = gameEngine.getState();
          console.log('Final state - Phase:', finalState.phase, 'Current player:', finalState.currentPlayerId);
          console.log('Turn state after AI:', gameEngine.getTurnState());
        } catch (error) {
          console.error('\n=== AI PROCESSING ERROR ===');
          console.error('Error:', error);
          console.error('Turn state:', gameEngine.getTurnState());
        }
      } else {
        console.log('\n=== NO AI PROCESSING NEEDED ===');
        console.log('Current player:', currentState.currentPlayerId, 'Game over:', currentState.gameOver);
      }
      
      console.log('=== ATOMIC MOVE PROCESSING END ===\n');

      // Save final game state after all processing (including AI moves)
      const finalGameState = gameEngine.getState();
      console.log('\n=== SAVING FINAL STATE ===');
      console.log('Final state - Phase:', finalGameState.phase, 'Current player:', finalGameState.currentPlayerId);
      console.log('Game over:', finalGameState.gameOver);
      
      try {
        await persistentGameCache.set(gameId, gameEngine);
        console.log('Game state saved to persistent cache successfully');
      } catch (error) {
        console.log('Persistent cache save failed, using fallback cache:', error.message);
        await fallbackGameCache.set(gameId, gameEngine);
        console.log('Game state saved to fallback cache');
      }

      // Return final response with complete game state and AI processing info
      const finalGameState = gameEngine.getState();
      return NextResponse.json({
        success: true,
        gameState: finalGameState,
        debug: {
          aiProcessingTriggered: currentState.currentPlayerId === 'ai-player' && !currentState.gameOver,
          preAIState: {
            currentPlayerId: currentState.currentPlayerId,
            phase: currentState.phase,
            gameOver: currentState.gameOver
          },
          postAIState: {
            currentPlayerId: finalGameState.currentPlayerId,
            phase: finalGameState.phase,
            gameOver: finalGameState.gameOver
          }
        }
      });
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

// Legacy async AI processing code removed - using new synchronous atomic system