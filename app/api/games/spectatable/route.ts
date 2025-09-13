import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../lib/auth';

const prisma = new PrismaClient();

/**
 * GET /api/games/spectatable
 * 
 * Get list of games that can be spectated (public, active games)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication (spectators must be logged in)
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const userId = authResult.user.id;

    // Get public, active games that the user is not playing in
    const spectatableGames = await prisma.game.findMany({
      where: {
        status: 'ACTIVE',
        isPrivate: false,
        // User is not a player in the game
        AND: [
          { player1Id: { not: userId } },
          { player2Id: { not: userId } }
        ]
      },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } }
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 20 // Limit to 20 most recent games
    });

    const formattedGames = spectatableGames.map(game => ({
      id: game.id,
      status: game.status,
      vsAI: game.vsAI,
      players: [
        game.player1,
        game.player2
      ].filter(Boolean), // Remove null players
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString()
    }));

    console.log(`👁️ Spectatable: Found ${formattedGames.length} spectatable games for user ${userId}`);

    return NextResponse.json({
      success: true,
      games: formattedGames
    });

  } catch (error) {
    console.error('💥 Spectatable: Unexpected error:', error);
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