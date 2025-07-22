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

    // Check if game is still waiting for players
    if (game.status !== 'WAITING') {
      return NextResponse.json(
        { error: 'Game is not accepting new players' },
        { status: 400 }
      );
    }

    // Check if user is already in the game
    const isAlreadyPlayer = game.players.some(player => player.userId === decoded.userId);
    
    if (isAlreadyPlayer) {
      return NextResponse.json(
        { error: 'You are already in this game' },
        { status: 400 }
      );
    }

    // Check if game is full
    if (game.players.length >= game.maxPlayers) {
      return NextResponse.json(
        { error: 'Game is full' },
        { status: 400 }
      );
    }

    // Add player to game
    const updatedGame = await prisma.game.update({
      where: {
        id: gameId
      },
      data: {
        players: {
          create: {
            userId: decoded.userId,
            joinedAt: new Date(),
          }
        },
        // If this brings us to max players, start the game
        status: game.players.length + 1 >= game.maxPlayers ? 'IN_PROGRESS' : 'WAITING'
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
      message: 'Successfully joined game',
      game: updatedGame
    });

  } catch (error) {
    console.error('Join game error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}