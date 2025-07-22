import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';

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

    // Check if user is in the game
    const isPlayer1 = game.player1Id === decoded.userId;
    const isPlayer2 = game.player2Id === decoded.userId;
    
    if (!isPlayer1 && !isPlayer2) {
      return NextResponse.json(
        { error: 'You are not in this game' },
        { status: 400 }
      );
    }

    // Determine new status and update game
    let updateData: any = {};
    
    if (isPlayer1) {
      // Player 1 is leaving
      if (game.player2Id) {
        // Player 2 wins by forfeit
        updateData = {
          status: 'FINISHED',
          winnerId: game.player2Id,
          finishedAt: new Date()
        };
      } else {
        // No player 2, cancel game
        updateData = {
          status: 'CANCELLED',
          finishedAt: new Date()
        };
      }
    } else {
      // Player 2 is leaving
      updateData = {
        player2Id: null,
        status: game.status === 'ACTIVE' ? 'FINISHED' : 'WAITING',
        winnerId: game.status === 'ACTIVE' ? game.player1Id : undefined,
        finishedAt: game.status === 'ACTIVE' ? new Date() : undefined
      };
    }

    const updatedGame = await prisma.game.update({
      where: {
        id: gameId
      },
      data: updateData,
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

    return NextResponse.json({
      message: 'Successfully left game',
      game: updatedGame
    });

  } catch (error) {
    console.error('Leave game error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}