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

    // For AI games, get the persistent cached game engine
    if (game.vsAI) {
      let gameEngine;
      
      try {
        gameEngine = await persistentGameCache.get(gameId);
      } catch (error) {
        console.log('Persistent cache failed, trying fallback cache:', error.message);
        gameEngine = await fallbackGameCache.get(gameId);
      }
      
      if (!gameEngine) {
        console.log('Game engine not found in persistent cache for gameId:', gameId);
        
        return NextResponse.json(
          { 
            error: 'Game state not found. Please refresh the page to reload the game.',
            code: 'GAME_STATE_LOST'
          },
          { status: 400 }
        );
      }

      // Make the player's move
      console.log('Processing player move:', move.type, 'by player:', decoded.userId);
      const moveResult = gameEngine.makeMove(move);
      
      if (!moveResult.success) {
        return NextResponse.json(
          { error: moveResult.error || 'Invalid move' },
          { status: 400 }
        );
      }

      console.log('Player move successful, new phase:', moveResult.state.phase);

      // Process AI response moves after player move
      await processAIResponseMoves(gameEngine);

      // Save updated game state to persistent storage (with fallback)
      try {
        await persistentGameCache.set(gameId, gameEngine);
      } catch (error) {
        console.log('Persistent cache save failed, using fallback cache:', error.message);
        await fallbackGameCache.set(gameId, gameEngine);
      }

      return NextResponse.json({
        success: true,
        gameState: gameEngine.getState()
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
    
    console.log('AI making response move:', aiMove.type);
    const aiMoveResult = gameEngine.makeMove(aiMove);
    
    if (!aiMoveResult.success) {
      console.error('AI response move failed:', aiMoveResult.error);
      break;
    }
    
    console.log('AI response move successful, new phase:', aiMoveResult.state.phase, 'next player:', aiMoveResult.state.currentPlayerId);
    movesProcessed++;
    
    // Prevent infinite loops
    if (movesProcessed >= maxMoves) {
      console.log('Max AI response moves reached, stopping');
      break;
    }
  }
  
  console.log(`AI processed ${movesProcessed} response moves`);
}