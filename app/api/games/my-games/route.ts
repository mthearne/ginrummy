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
        players: {
          some: {
            userId: decoded.userId
          }
        }
      },
      orderBy: {
        updatedAt: 'desc'
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
      games
    });

  } catch (error) {
    console.error('Get my games error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}