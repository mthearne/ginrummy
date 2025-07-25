import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { GinRummyGame } from '@gin-rummy/common';
import { persistentGameCache } from '../../../../../src/utils/persistentGameCache';
import { fallbackGameCache } from '../../../../../src/utils/fallbackGameCache';
import { GameEventsService } from '../../../../../src/services/gameEvents';

/**
 * Process AI moves after thinking delay
 */
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
    const { thoughts } = await request.json();
    
    console.log('AI Move API called for game:', gameId);
    console.log('AI thoughts received:', thoughts);

    // Get game engine from cache
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
      
      if (retrievalAttempts < maxRetrievalAttempts) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
    
    if (!gameEngine) {
      console.log('Game engine not found in any cache for AI move processing');
      return NextResponse.json(
        { 
          error: 'Game state not found',
          code: 'GAME_STATE_LOST'
        },
        { status: 400 }
      );
    }

    // Verify it's actually AI's turn
    const currentState = gameEngine.getState();
    if (currentState.currentPlayerId !== 'ai-player' || currentState.gameOver) {
      return NextResponse.json(
        { error: 'Not AI turn or game is over' },
        { status: 400 }
      );
    }

    console.log('\n=== AI PROCESSING START (After Thinking) ===');
    console.log('Pre-AI state - Phase:', currentState.phase, 'Current player:', currentState.currentPlayerId);
    
    // Capture state before AI moves for logging
    const stateBeforeAI = gameEngine.getState();
    
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
      
      // Log AI moves to database (simplified - log each successful AI result)
      try {
        for (const [index, result] of aiResults.entries()) {
          if (result.success && result.move) {
            await GameEventsService.logMove(gameId, null, result.move, stateBeforeAI, result.state);
            console.log(`Logged AI move ${index + 1}: ${result.move.type}`);
          }
        }
        
        // Log round/game end events if applicable
        if (finalState.phase === 'round_over' && stateBeforeAI.phase !== 'round_over') {
          await GameEventsService.logRoundEnd(gameId, {
            winner: finalState.winner,
            knockType: finalState.knockType,
            scores: finalState.roundScores,
            finalHands: finalState.players?.map(p => ({ id: p.id, hand: p.hand, melds: p.melds }))
          });
        }
        
        if (finalState.gameOver && !stateBeforeAI.gameOver) {
          await GameEventsService.logGameEnd(gameId, finalState);
        }
        
      } catch (error) {
        console.warn('Failed to log AI moves to database:', error);
      }
      
      // Save the updated game state
      try {
        await persistentGameCache.set(gameId, gameEngine);
        console.log('AI game state saved to persistent cache successfully');
      } catch (error) {
        console.log('Persistent cache save failed, using fallback cache:', error.message);
        await fallbackGameCache.set(gameId, gameEngine);
        console.log('AI game state saved to fallback cache');
      }
      
      return NextResponse.json({
        success: true,
        gameState: finalState,
        aiMoves: aiResults.map(r => ({ success: r.success, error: r.error }))
      });
      
    } catch (error) {
      console.error('\n=== AI PROCESSING ERROR ===');
      console.error('Error:', error);
      return NextResponse.json(
        { error: 'AI processing failed' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('AI Move API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}