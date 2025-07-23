import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../src/utils/jwt';
import { prisma } from '../../../src/utils/database';
import { z } from 'zod';

// Add CORS headers to all responses
function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

const CreateGameSchema = z.object({
  vsAI: z.boolean().optional().default(false),
  isPrivate: z.boolean().optional().default(false),
  maxPlayers: z.number().min(2).max(4).optional().default(2),
});

const ListGamesSchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  offset: z.coerce.number().min(0).optional().default(0),
});

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const parsed = CreateGameSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { vsAI, isPrivate, maxPlayers } = parsed.data;

    // Create game in database
    const game = await prisma.game.create({
      data: {
        status: 'WAITING',
        vsAI,
        isPrivate,
        maxPlayers,
        player1Id: decoded.userId,
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

    const response = NextResponse.json({
      message: 'Game created successfully',
      id: game.id,
      game
    });
    return addCorsHeaders(response);

  } catch (error) {
    console.error('Create game error details:', {
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

    const { searchParams } = new URL(request.url);
    const queryParams = {
      status: searchParams.get('status') || undefined,
      limit: searchParams.get('limit') || undefined,
      offset: searchParams.get('offset') || undefined,
    };

    const parsed = ListGamesSchema.safeParse(queryParams);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { status, limit, offset } = parsed.data;

    // Build where clause
    const where: any = {};
    if (status) {
      where.status = status;
    }

    // Get games from database
    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: {
          createdAt: 'desc'
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
      }),
      prisma.game.count({ where })
    ]);

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
      games: formattedGames,
      pagination: {
        total,
        offset,
        limit,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error('List games error details:', {
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

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
