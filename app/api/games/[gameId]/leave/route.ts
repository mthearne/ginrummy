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
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                eloRating: true,
              }
            }
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
    const playerInGame = game.players.find(player => player.userId === decoded.userId);
    
    if (!playerInGame) {
      return NextResponse.json(
        { error: 'You are not in this game' },
        { status: 400 }
      );
    }

    // Remove player from game
    await prisma.gamePlayer.delete({
      where: {
        id: playerInGame.id
      }
    });

    // Update game status based on remaining players
    const remainingPlayersCount = game.players.length - 1;
    let newStatus = game.status;

    if (remainingPlayersCount === 0) {
      // No players left, cancel the game
      newStatus = 'CANCELLED';
    } else if (game.status === 'IN_PROGRESS' && remainingPlayersCount === 1) {
      // If game was in progress and only one player remains, end the game
      newStatus = 'COMPLETED';
    } else if (game.status === 'IN_PROGRESS') {
      // Player resigned during active game
      newStatus = 'COMPLETED';
    }

    const updatedGame = await prisma.game.update({
      where: {
        id: gameId
      },
      data: {
        status: newStatus,
        endedAt: newStatus === 'COMPLETED' || newStatus === 'CANCELLED' ? new Date() : undefined
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                eloRating: true,
              }
            }
          }
        },
        createdBy: {
          select: {
            id: true,
            username: true,
            email: true,
            eloRating: true,
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