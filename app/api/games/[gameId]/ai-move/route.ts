import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { GinRummyGame } from '@gin-rummy/common';
import { persistentGameCache } from '../../../../../src/utils/persistentGameCache';
import { fallbackGameCache } from '../../../../../src/utils/fallbackGameCache';
import { GameEventsService } from '../../../../../src/services/gameEvents';
import { createTurnHistoryEntry, getPlayerNameFromGameState, TurnHistoryEntry } from '../../../../../src/utils/turnHistory';

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
    
    let thoughts: any = null;
    try {
      if (request.headers.get('content-type')?.includes('application/json')) {
        const body = await request.json();
        thoughts = body?.thoughts ?? null;
      }
    } catch {
      // No/invalid JSON is fine; we don't require it
    }
    
    console.log('🔍 STEP 5: AI Move API called for game:', gameId);
    console.log('🔍 AI thoughts received:', thoughts);

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
      console.log('🔍 STEP 5 FAILED: Game engine not found in any cache for AI move processing');
      return NextResponse.json(
        { 
          error: 'Game state not found',
          code: 'GAME_STATE_LOST'
        },
        { status: 400 }
      );
    }
    
    console.log('🔍 STEP 5: Game engine loaded successfully');

    // Verify it's actually AI's turn
    const currentState = gameEngine.getState();
    console.log('🔍 STEP 5: Current game state:', { 
      phase: currentState.phase, 
      currentPlayerId: currentState.currentPlayerId,
      gameOver: currentState.gameOver,
      players: currentState.players?.map(p => ({ id: p.id, username: p.username }))
    });
    
    // Identify human and AI players
    const humanId = decoded.userId;
    const aiPlayer = currentState.players?.find(p => p.id !== humanId);
    console.log('🔍 STEP 5: Player identification:', { 
      humanId, 
      aiPlayerId: aiPlayer?.id,
      currentTurn: currentState.currentPlayerId === aiPlayer?.id ? 'AI' : 'Human'
    });
    
    // Skip deduplication for now - it's preventing AI from moving
    // const lastAiTurnId = (gameEngine as any).lastAiTurnId ?? -1;
    // if (typeof currentState.turnId === 'number') {
    //   if (currentState.turnId === lastAiTurnId) {
    //     console.log('🔍 STEP 5: AI deduplication - already processed turnId', currentState.turnId);
    //     return NextResponse.json({ success: true, deduped: true }, { status: 200 });
    //   }
    //   (gameEngine as any).lastAiTurnId = currentState.turnId;
    // }
    console.log('🔍 STEP 5: Skipping deduplication to allow AI moves');
    
    // Check if engine is busy and force clear if stuck
    if (typeof gameEngine.isProcessing === 'function' && gameEngine.isProcessing()) {
      console.warn('🔍 STEP 5: Game engine marked as processing, force clearing lock for AI move');
      // Force clear the processing lock for AI moves since they run separately
      if (typeof gameEngine.setProcessing === 'function') {
        gameEngine.setProcessing(false);
        console.log('🔍 STEP 5: Processing lock cleared');
      } else {
        return NextResponse.json(
          { error: 'Engine busy, try again', code: 'ENGINE_BUSY' },
          { status: 409 }
        );
      }
    }
    // Identify AI as "the other player" relative to the authenticated human
    const humanId = decoded.userId;
    const aiPlayer = currentState.players?.find(p => p.id !== humanId);
    if (!aiPlayer) {
      return NextResponse.json(
        { error: 'AI player not found', code: 'AI_NOT_FOUND' },
        { status: 500 }
      );
    }
    if (currentState.gameOver || currentState.currentPlayerId !== aiPlayer.id) {
      return NextResponse.json(
        {
          error: 'Not AI turn or game is over',
          code: 'NOT_AI_TURN',
          details: {
            currentPlayerId: currentState.currentPlayerId,
            aiPlayerId: aiPlayer.id,
            phase: currentState.phase,
            gameOver: currentState.gameOver
          }
        },
        { status: 409 }
      );
    }

    console.log('\n=== AI THINKING START ===');
    
    // Add thinking delay to simulate AI consideration (for better UX)
    const thinkingTime = 1500 + Math.random() * 1000; // 1.5-2.5 seconds
    console.log(`AI thinking for ${Math.round(thinkingTime)}ms`);
    
    await new Promise(resolve => setTimeout(resolve, thinkingTime));
    
    console.log('\n=== AI PROCESSING START (After Thinking) ===');
    console.log('Pre-AI state - Phase:', currentState.phase, 'Current player:', currentState.currentPlayerId);
    
    // Capture state before AI moves for logging
    const stateBeforeAI = gameEngine.getState();
    
    console.log('🔍 STEP 5: Starting AI move processing...');
    
    try {
      const startTime = Date.now();
      console.log('🔍 STEP 5: About to call gameEngine.processAIMoves()');
      const aiResults = gameEngine.processAIMoves();
      console.log('🔍 STEP 5: gameEngine.processAIMoves() completed, results:', aiResults?.length || 0);
      const endTime = Date.now();
      
      console.log('🔍 STEP 5: AI processing completed in', endTime - startTime, 'ms');
      
      console.log('\n=== AI PROCESSING COMPLETE ===');
      console.log('Processing time:', endTime - startTime, 'ms');
      console.log('AI moves processed:', aiResults.length);
      
      // Log AI move results
      aiResults.forEach((result, index) => {
        if (result.success) {
          console.log(`AI move ${index + 1} SUCCESS:`, result.stateChanges);
        } else {
          console.error(`AI move ${index + 1} FAILED:`, result.error);
          // Log specific details for draw_discard failures
          if (result.move && result.move.type === 'draw_discard') {
            const currentState = gameEngine.getState();
            console.error(`🚨 Draw discard failed - Discard pile length: ${currentState.discardPile?.length || 0}`);
            console.error(`🚨 Discard pile contents:`, currentState.discardPile?.map(c => c.id) || []);
          }
        }
      });
      
      const finalState = gameEngine.getState();
      console.log('Final state - Phase:', finalState.phase, 'Current player:', finalState.currentPlayerId);
      
      // Create turn history entries for successful AI moves
      const aiTurnHistoryEntries: TurnHistoryEntry[] = [];
      console.log('🔍 AI Turn History Debug - aiResults:', aiResults.map(r => ({ success: r.success, move: r.move, hasMove: !!r.move })));
      
      for (const [index, result] of aiResults.entries()) {
        console.log(`🔍 AI Turn History Debug - Result ${index + 1}:`, { success: result.success, move: result.move, hasMove: !!result.move });
        if (result.success && result.move) {
          const playerName = getPlayerNameFromGameState(result.move.playerId, finalState);
          // Use global sequential turn counter
          const turnHistoryEntry = createTurnHistoryEntry(result.move, result.state, null, playerName);
          aiTurnHistoryEntries.push(turnHistoryEntry);
          console.log(`🔍 AI Move ${index + 1}: Created turn history entry:`, turnHistoryEntry);
          console.log(`🔍 AI Move ${index + 1}: Player name resolved as:`, playerName, 'for playerId:', result.move.playerId);
        }
      }
      
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
      
      // Get player-specific state for the frontend
      let playerState;
      try {
        // Find the human player (not the AI)
        const humanPlayer = finalState.players?.find(p => p.id !== aiPlayer.id);
        if (humanPlayer) {
          playerState = gameEngine.getPlayerState(humanPlayer.id);
          console.log('🔍 STEP 5: Returning player-specific state for human player:', humanPlayer.id);
          
          // Log hand sizes to debug missing cards issue
          if (playerState && playerState.players) {
            playerState.players.forEach((player: any) => {
              if (player.hand && Array.isArray(player.hand)) {
                console.log(`🔍 AI Move - Player ${player.id} hand: ${player.hand.length} cards`);
                console.log(`🔍 AI Move - Card IDs:`, player.hand.map((c: any) => c.id));
              }
            });
          }
        } else {
          playerState = finalState;
          console.log('🔍 STEP 5: Could not find human player, returning full state');
        }
      } catch (error) {
        console.error('🔍 STEP 5: getPlayerState failed, using full state:', error.message);
        playerState = finalState;
      }

      console.log('🔍 STEP 5: AI moves complete, returning updated game state');
      console.log('🔍 STEP 5: Final response data:', {
        success: true,
        aiMoves: aiResults.length,
        aiTurnHistoryEntries: aiTurnHistoryEntries.length,
        gameStatePhase: playerState?.phase,
        gameStateCurrentPlayer: playerState?.currentPlayerId
      });
      return NextResponse.json({
        success: true,
        gameState: playerState,
        aiMoves: aiResults.map(r => ({ success: r.success, error: r.error })),
        aiTurnHistoryEntries: aiTurnHistoryEntries
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