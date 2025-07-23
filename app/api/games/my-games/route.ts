import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { prisma } from '../../../../src/utils/database';

export async function GET(request: NextRequest) {
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

    // Get user's games from database
    const games = await prisma.game.findMany({
      where: {
        AND: [
          {
            OR: [
              { player1Id: decoded.userId },
              { player2Id: decoded.userId }
            ]
          },
          {
            status: {
              not: 'CANCELLED'
            }
          }
        ]
      },
      orderBy: {
        updatedAt: 'desc'
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

    // Format games for frontend
    const formattedGames = games.map(game => ({
      id: game.id,
      status: game.status,
      playerCount: game.player2Id ? 2 : 1,
      maxPlayers: game.maxPlayers,
      isPrivate: game.isPrivate,
      vsAI: game.vsAI,
      createdAt: game.createdAt.toISOString(),
    }));

    return NextResponse.json({
      games: formattedGames
    });

  } catch (error) {
    console.error('Get my games error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      },
      { status: 500 }
    );
  }
}