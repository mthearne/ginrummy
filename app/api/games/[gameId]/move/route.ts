import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';
import { GinRummyGame } from '@gin-rummy/common';
import { GameCache } from '../../../../../src/utils/gameCache';

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

    // For AI games, get the cached game engine
    if (game.vsAI) {
      let gameEngine = GameCache.get(gameId);
      
      if (!gameEngine) {
        console.log('Game engine not in cache for gameId:', gameId);
        console.log('This can happen in serverless environments where memory is not persistent');
        
        // For now, return an error asking the user to refresh
        // In a production system, we'd store game state in database/Redis
        return NextResponse.json(
          { 
            error: 'Game state lost due to serverless limitations. Please refresh the page to reload the game.',
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

      // Check if it's now AI's turn and process AI move
      const currentState = gameEngine.getState();
      if (currentState.currentPlayerId === 'ai-player' && !currentState.gameOver) {
        console.log('Processing AI response move, phase:', currentState.phase);
        
        const aiMove = gameEngine.getAISuggestion();
        if (aiMove) {
          console.log('AI making response move:', aiMove.type);
          const aiMoveResult = gameEngine.makeMove(aiMove);
          if (aiMoveResult.success) {
            console.log('AI response move successful, new phase:', aiMoveResult.state.phase);
          } else {
            console.error('AI response move failed:', aiMoveResult.error);
          }
        }
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