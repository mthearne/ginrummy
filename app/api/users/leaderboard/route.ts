import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../src/utils/database';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '50') || 50));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0') || 0);

    // Get top players by ELO
    const users = await prisma.user.findMany({
      where: {
        gamesPlayed: {
          gt: 0 // Only include users who have played games
        }
      },
      select: {
        id: true,
        username: true,
        elo: true,
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true
      },
      orderBy: {
        elo: 'desc'
      },
      take: limit,
      skip: offset
    });

    // Calculate win rates and add rank
    const leaderboard = users.map((user, index) => ({
      ...user,
      rank: offset + index + 1,
      winRate: user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0
    }));

    // Get total count for pagination
    const totalUsers = await prisma.user.count({
      where: {
        gamesPlayed: {
          gt: 0
        }
      }
    });

    return NextResponse.json({
      users: leaderboard,
      pagination: {
        total: totalUsers,
        limit,
        offset,
        hasMore: offset + limit < totalUsers
      }
    });

  } catch (error) {
    console.error('Get leaderboard error:', error);
    return NextResponse.json(
      { error: 'Failed to get leaderboard' },
      { status: 500 }
    );
  }
}