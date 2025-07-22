import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';
import { GinRummyGame } from '@gin-rummy/common';

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

    // For AI games, initialize the game engine if it's still waiting
    if (game.vsAI && game.status === 'WAITING') {
      // Initialize the game engine with proper cards and game logic
      const gameEngine = new GinRummyGame(gameId, game.player1Id, 'ai-player', true);
      const initialState = gameEngine.getState();
      
      // Set player names from database
      initialState.players[0].username = game.player1!.username;
      initialState.players[1].username = 'AI Opponent';
      
      // Update game to active status in database
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'ACTIVE'
        }
      });

      // Store the initialized game state (in a real system, this would go to Redis/memory store)
      // For now, we'll return the initialized state
      return NextResponse.json({
        gameState: initialState
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

    // For active games, return basic game state
    return NextResponse.json({
      gameState: {
        id: game.id,
        status: game.status,
        vsAI: game.vsAI,
        players: [
          game.player1 ? {
            id: game.player1.id,
            username: game.player1.username,
            elo: game.player1.elo,
            score: game.player1Score,
            hand: [], // Would need game engine for actual cards
            deadwood: 0,
          } : null,
          game.player2 ? {
            id: game.player2.id,
            username: game.player2.username,
            elo: game.player2.elo,
            score: game.player2Score,
            hand: [],
            deadwood: 0,
          } : null,
        ].filter(Boolean),
        currentPlayerId: game.player1Id,
        phase: 'draw',
        turnTimer: 30,
        stockPileCount: 31,
        discardPile: [],
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