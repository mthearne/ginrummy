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
        // Initialize the game engine with proper cards and game logic
        console.log('Initializing new AI game:', gameId);
        gameEngine = new GinRummyGame(gameId, game.player1Id, 'ai-player', true);
        const initialState = gameEngine.getState();
        
        // Set player names from database
        initialState.players[0].username = game.player1!.username;
        initialState.players[1].username = 'AI Opponent';
        
        // Cache the game engine in persistent storage (with fallback)
        try {
          await persistentGameCache.set(gameId, gameEngine);
        } catch (error) {
          console.log('Persistent cache failed, using fallback cache:', error.message);
          await fallbackGameCache.set(gameId, gameEngine);
        }
        
        // Update game to active status in database if still waiting
        if (game.status === 'WAITING') {
          await prisma.game.update({
            where: { id: gameId },
            data: {
              status: 'ACTIVE'
            }
          });
        }
      }

      // Note: AI moves are now handled by the move endpoint to prevent race conditions

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

    // For active PvP games, return basic game state
    return NextResponse.json({
      gameState: {
        id: game.id,
        status: game.status,
        vsAI: game.vsAI,
        players: [
          game.player1 ? {
            id: game.player1.id,
            username: game.player1.username,
            score: game.player1Score,
            hand: [], // Would need game engine for actual cards
            handSize: 10,
            deadwood: 0,
            hasKnocked: false,
            hasGin: false,
            melds: [],
          } : null,
          game.player2 ? {
            id: game.player2.id,
            username: game.player2.username,
            score: game.player2Score,
            hand: [],
            handSize: 10,
            deadwood: 0,
            hasKnocked: false,
            hasGin: false,
            melds: [],
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

