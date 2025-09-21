import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../src/utils/database';

export async function GET(
  request: NextRequest,
  { params }: { params: { username: string } }
) {
  try {
    const { username } = params;
    const { searchParams } = new URL(request.url);
    const includeHistory = searchParams.get('includeHistory') === 'true';
    const historyLimit = Math.max(1, Math.min(50, parseInt(searchParams.get('historyLimit') || '10') || 10));

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        // Get ELO history
        eloHistory: includeHistory ? {
          take: 50, // Last 50 ELO changes
          orderBy: { createdAt: 'desc' }
        } : false
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Calculate win rate
    const winRate = user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0;

    // Process recent games if requested
    let recentGames: any[] = [];
    if (includeHistory) {
      // Get player1 games
      const player1Games = await prisma.game.findMany({
        where: {
          player1Id: user.id,
          status: 'FINISHED'
        },
        include: {
          player2: { select: { username: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: historyLimit
      });

      // Get player2 games
      const player2Games = await prisma.game.findMany({
        where: {
          player2Id: user.id,
          status: 'FINISHED'
        },
        include: {
          player1: { select: { username: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: historyLimit
      });

      const allGames = [
        ...player1Games.map(game => ({
          ...game,
          isPlayer1: true,
          opponent: game.player2?.username || 'AI',
          result: game.winnerId === user.id ? 'win' : 'loss',
          score: game.player1Score || 0,
          opponentScore: game.player2Score || 0
        })),
        ...player2Games.map(game => ({
          ...game,
          isPlayer1: false,
          opponent: game.player1?.username || 'Unknown',
          result: game.winnerId === user.id ? 'win' : 'loss',
          score: game.player2Score || 0,
          opponentScore: game.player1Score || 0
        }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, historyLimit);

      recentGames = allGames.map(game => ({
        id: game.id,
        opponent: game.opponent,
        result: game.result,
        score: game.score,
        opponentScore: game.opponentScore,
        duration: game.duration || 0,
        knockType: game.knockType ? game.knockType.toLowerCase() : 'knock',
        createdAt: game.createdAt
      }));
    }

    // Process ELO history if requested
    let eloHistory: any[] = [];
    if (includeHistory && user.eloHistory) {
      eloHistory = user.eloHistory
        .reverse() // Show chronological order
        .map(entry => ({
          elo: entry.elo,
          date: entry.createdAt
        }));
    }

    const profile = {
      id: user.id,
      email: user.email,
      username: user.username,
      elo: user.elo,
      gamesPlayed: user.gamesPlayed,
      gamesWon: user.gamesWon,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      winRate,
      recentGames,
      eloHistory
    };

    return NextResponse.json(profile);

  } catch (error) {
    console.error('Get profile error:', error);
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500 }
    );
  }
}