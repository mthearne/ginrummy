import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../lib/auth';
import { z } from 'zod';

const prisma = new PrismaClient();

const ListAvailableGamesSchema = z.object({
  limit: z.coerce.number().min(1).max(50).optional().default(10),
  offset: z.coerce.number().min(0).optional().default(0)
});

/**
 * GET /api/games/available
 * 
 * List available PvP games that players can join
 */
export async function GET(request: NextRequest) {
  try {
    console.log('🎯 AvailableGames: Listing available games');
    
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    const user = authResult.user;
    
    // Parse query parameters
    const url = new URL(request.url);
    const queryParams = Object.fromEntries(url.searchParams);
    
    const parsed = ListAvailableGamesSchema.safeParse(queryParams);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { limit, offset } = parsed.data;

    // Get available games (WAITING status, not AI, not created by current user)
    const availableGames = await prisma.game.findMany({
      where: {
        status: 'WAITING',
        vsAI: false,
        isPrivate: false,
        player1Id: { not: user.id }, // Don't show own games
        OR: [
          { player2Id: null },
          { player2Id: 'waiting-for-player' }
        ]
      },
      include: {
        player1: {
          select: {
            id: true,
            username: true,
            elo: true,
            gamesPlayed: true,
            gamesWon: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Get total count for pagination
    const totalCount = await prisma.game.count({
      where: {
        status: 'WAITING',
        vsAI: false,
        isPrivate: false,
        player1Id: { not: user.id },
        OR: [
          { player2Id: null },
          { player2Id: 'waiting-for-player' }
        ]
      }
    });

    const gamesList = availableGames.map(game => ({
      gameId: game.id,
      createdAt: game.createdAt,
      gameType: game.gameType,
      maxPlayers: game.maxPlayers,
      currentPlayers: game.player2Id ? 2 : 1,
      player1: {
        username: game.player1.username,
        elo: game.player1.elo,
        gamesPlayed: game.player1.gamesPlayed,
        winRate: game.player1.gamesPlayed > 0 
          ? Math.round((game.player1.gamesWon / game.player1.gamesPlayed) * 100)
          : 0
      },
      canJoin: !game.player2Id || game.player2Id === 'waiting-for-player',
      streamVersion: game.streamVersion || 0
    }));

    console.log(`✅ AvailableGames: Found ${gamesList.length} available games`);

    return NextResponse.json({
      games: gamesList,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount
      }
    });

  } catch (error) {
    console.error('💥 AvailableGames: Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}