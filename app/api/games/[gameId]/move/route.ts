import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';
import { GinRummyGame } from '@gin-rummy/common';
import { persistentGameCache } from '../../../../../src/utils/persistentGameCache';
import { fallbackGameCache } from '../../../../../src/utils/fallbackGameCache';
import { GamePhase } from '@gin-rummy/common';
import { GameEventsService } from '../../../../../src/services/gameEvents';

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
      
      // Capture state before move for logging
      const gameStateBefore = gameEngine.getState();
      
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
        
        // Enhanced error logging for upcard phase issues
        if (moveResult.error?.includes('upcard decision phase')) {
          console.error('UPCARD PHASE DEBUG:');
          console.error('- Move type:', move.type);
          console.error('- Backend game phase:', retrievedState.phase);
          console.error('- Backend current player:', retrievedState.currentPlayerId);
          console.error('- Move player ID:', move.playerId);
          console.error('- User ID from token:', decoded.userId);
          console.error('- Game state when move attempted:', JSON.stringify({
            phase: retrievedState.phase,
            currentPlayerId: retrievedState.currentPlayerId,
            gameOver: retrievedState.gameOver
          }));
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

      // Log the move to database
      try {
        await GameEventsService.logMove(gameId, decoded.userId, move, gameStateBefore, moveResult.state);
        
        // Log round/game end events if applicable
        if (moveResult.state.phase === 'round_over' && gameStateBefore.phase !== 'round_over') {
          await GameEventsService.logRoundEnd(gameId, {
            winner: moveResult.state.winner,
            knockType: moveResult.state.knockType,
            scores: moveResult.state.roundScores,
            finalHands: moveResult.state.players?.map(p => ({ id: p.id, hand: p.hand, melds: p.melds }))
          });
        }
        
        if (moveResult.state.gameOver && !gameStateBefore.gameOver) {
          await GameEventsService.logGameEnd(gameId, moveResult.state);
        }
        
      } catch (error) {
        console.warn('Failed to log move/events to database:', error);
      }

      // Process AI moves immediately if it's AI's turn - this prevents turn desync
      const currentState = gameEngine.getState();
      const aiShouldProcess = currentState.currentPlayerId === 'ai-player' && !currentState.gameOver;
      
      console.log('\n=== AI PROCESSING CHECK ===');
      console.log('Current state after player move:');
      console.log('- currentPlayerId:', currentState.currentPlayerId);
      console.log('- currentPlayerId === "ai-player":', currentState.currentPlayerId === 'ai-player');
      console.log('- phase:', currentState.phase);
      console.log('- gameOver:', currentState.gameOver);
      console.log('- AI should process moves:', aiShouldProcess);
      
      if (aiShouldProcess) {
        console.log('AI will think before processing moves...');
        
        // Add thinking delay to simulate AI consideration
        const thinkingTime = 1500 + Math.random() * 1000; // 1.5-2.5 seconds
        console.log(`AI thinking for ${Math.round(thinkingTime)}ms`);
        
        await new Promise(resolve => setTimeout(resolve, thinkingTime));
        
        console.log('AI finished thinking, processing moves synchronously...');
        try {
          const stateBeforeAI = gameEngine.getState();
          console.log('State before AI processing:');
          console.log('- currentPlayerId:', stateBeforeAI.currentPlayerId);
          console.log('- phase:', stateBeforeAI.phase);
          
          const aiResults = gameEngine.processAIMoves();
          console.log('AI processed', aiResults.length, 'moves after thinking');
          
          const stateAfterAI = gameEngine.getState();
          console.log('State after AI processing:');
          console.log('- currentPlayerId:', stateAfterAI.currentPlayerId);
          console.log('- phase:', stateAfterAI.phase);
          
        } catch (aiError) {
          console.error('AI processing failed:', aiError);
        }
      }
      
      console.log('=== MOVE PROCESSING COMPLETE ===\n');

      // Save final game state after all processing (including AI moves)
      const finalGameState = gameEngine.getState();
      console.log('\n=== SAVING FINAL STATE ===');
      console.log('Final state - Phase:', finalGameState.phase, 'Current player:', finalGameState.currentPlayerId);
      console.log('Game over:', finalGameState.gameOver);
      
      try {
        await persistentGameCache.set(gameId, gameEngine);
        console.log('Game state saved to persistent cache successfully');
      } catch (error) {
        console.error('❌ CRITICAL: Persistent cache save failed for game:', gameId, error.message);
        console.error('❌ State will not persist across refreshes!');
        
        // Still try fallback but log it as critical issue
        try {
          await fallbackGameCache.set(gameId, gameEngine);
          console.warn('⚠️  Fallback cache used (memory-only) - state will be lost on refresh');
        } catch (fallbackError) {
          console.error('❌ Both persistent and fallback saves failed:', fallbackError.message);
          // Don't throw - let the response return, but user needs to know
        }
      }

      // Get the truly final state after all processing
      const trulyFinalState = gameEngine.getState();
      
      // Return response with game state after all processing (including AI thinking)
      return NextResponse.json({
        success: true,
        gameState: trulyFinalState,
        debug: {
          aiProcessedMoves: aiShouldProcess,
          aiThinkingComplete: aiShouldProcess,
          synchronousProcessing: true,
          beforeAI: {
            currentPlayerId: currentState.currentPlayerId,
            phase: currentState.phase
          },
          afterAI: {
            currentPlayerId: trulyFinalState.currentPlayerId,
            phase: trulyFinalState.phase,
            gameOver: trulyFinalState.gameOver
          }
        }
      });
    }

    // For PvP games, use persistent cache system
    let gameEngine;
    let retrievalAttempts = 0;
    const maxRetrievalAttempts = 3;
    
    while (retrievalAttempts < maxRetrievalAttempts && !gameEngine) {
      retrievalAttempts++;
      
      try {
        gameEngine = await persistentGameCache.get(gameId);
        if (gameEngine) {
          console.log(`PvP game engine retrieved from persistent cache on attempt ${retrievalAttempts}`);
          break;
        }
      } catch (error) {
        console.log(`PvP persistent cache attempt ${retrievalAttempts} failed:`, error.message);
      }
      
      try {
        gameEngine = await fallbackGameCache.get(gameId);
        if (gameEngine) {
          console.log(`PvP game engine retrieved from fallback cache on attempt ${retrievalAttempts}`);
          break;
        }
      } catch (error) {
        console.log(`PvP fallback cache attempt ${retrievalAttempts} failed:`, error.message);
      }
      
      // Brief delay before retry to handle potential race conditions
      if (retrievalAttempts < maxRetrievalAttempts) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    if (!gameEngine) {
      console.log('PvP game engine not found in any cache after', maxRetrievalAttempts, 'attempts for gameId:', gameId);
      
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
      console.error('Retrieved PvP game state is invalid or doesn\'t match gameId:', gameId);
      return NextResponse.json(
        { 
          error: 'Game state corruption detected. Please refresh the page.',
          code: 'GAME_STATE_CORRUPT'
        },
        { status: 400 }
      );
    }

    // Debug player ID mapping for PvP
    console.log('PvP Player ID mapping verification:');
    console.log('- Database player1Id:', game.player1Id);
    console.log('- Database player2Id:', game.player2Id);
    console.log('- Game engine player IDs:', retrievedState.players?.map(p => ({ id: p.id, username: p.username })));
    console.log('- Move playerId:', move.playerId);
    console.log('- Current game player:', retrievedState.currentPlayerId);

    // Make the player's move
    console.log('\n=== PVP MOVE PROCESSING START ===');
    console.log('Move:', move.type, 'by player:', decoded.userId);
    console.log('Game state - Phase:', retrievedState.phase, 'Current player:', retrievedState.currentPlayerId);
    
    // Capture state before move for logging
    const pvpGameStateBefore = gameEngine.getState();
    
    const moveResult = gameEngine.makeMove(move);
    
    if (!moveResult.success) {
      console.log('PvP move failed with error:', moveResult.error);
      return NextResponse.json(
        { error: moveResult.error || 'Invalid move' },
        { status: 400 }
      );
    }

    console.log('\n=== PVP PLAYER MOVE SUCCESS ===');
    console.log('State changes:', moveResult.stateChanges);
    console.log('New game state - Phase:', moveResult.state.phase, 'Current player:', moveResult.state.currentPlayerId);

    // Log the PvP move to database
    try {
      await GameEventsService.logMove(gameId, decoded.userId, move, pvpGameStateBefore, moveResult.state);
      
      // Log round/game end events if applicable
      if (moveResult.state.phase === 'round_over' && pvpGameStateBefore.phase !== 'round_over') {
        await GameEventsService.logRoundEnd(gameId, {
          winner: moveResult.state.winner,
          knockType: moveResult.state.knockType,
          scores: moveResult.state.roundScores,
          finalHands: moveResult.state.players?.map(p => ({ id: p.id, hand: p.hand, melds: p.melds }))
        });
      }
      
      if (moveResult.state.gameOver && !pvpGameStateBefore.gameOver) {
        await GameEventsService.logGameEnd(gameId, moveResult.state);
      }
      
    } catch (error) {
      console.warn('Failed to log PvP move/events to database:', error);
    }

    // Save game state to persistent storage
    const finalGameState = gameEngine.getState();
    console.log('\n=== SAVING PVP FINAL STATE ===');
    console.log('Final state - Phase:', finalGameState.phase, 'Current player:', finalGameState.currentPlayerId);
    console.log('Game over:', finalGameState.gameOver);
    
    try {
      await persistentGameCache.set(gameId, gameEngine);
      console.log('PvP game state saved to persistent cache successfully');
    } catch (error) {
      console.log('PvP persistent cache save failed, using fallback cache:', error.message);
      await fallbackGameCache.set(gameId, gameEngine);
      console.log('PvP game state saved to fallback cache');
    }

    // Return final response
    return NextResponse.json({
      success: true,
      gameState: finalGameState
    });

  } catch (error) {
    console.error('Make move error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Legacy async AI processing code removed - using new synchronous atomic system