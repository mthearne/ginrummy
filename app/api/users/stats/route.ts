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
    let decoded;
    
    try {
      decoded = verifyAccessToken(token);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = decoded.userId;

    // Get comprehensive user stats
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        eloHistory: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get player1 games
    const player1Games = await prisma.game.findMany({
      where: {
        player1Id: userId,
        status: 'FINISHED'
      },
      select: {
        id: true,
        knockType: true,
        winnerId: true,
        player1Score: true,
        player2Score: true,
        duration: true,
        createdAt: true
      }
    });

    // Get player2 games
    const player2Games = await prisma.game.findMany({
      where: {
        player2Id: userId,
        status: 'FINISHED'
      },
      select: {
        id: true,
        knockType: true,
        winnerId: true,
        player1Score: true,
        player2Score: true,
        duration: true,
        createdAt: true
      }
    });

    // Combine all games
    const allGames = [
      ...player1Games.map(game => ({
        ...game,
        isPlayer1: true,
        userScore: game.player1Score || 0,
        opponentScore: game.player2Score || 0,
        won: game.winnerId === userId
      })),
      ...player2Games.map(game => ({
        ...game,
        isPlayer1: false,
        userScore: game.player2Score || 0,
        opponentScore: game.player1Score || 0,
        won: game.winnerId === userId
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Calculate detailed statistics
    const totalGames = allGames.length;
    const wins = allGames.filter(game => game.won).length;
    const losses = totalGames - wins;
    const winRate = totalGames > 0 ? (wins / totalGames) * 100 : 0;

    // Game type statistics
    const ginWins = allGames.filter(game => game.won && game.knockType === 'GIN').length;
    const knockWins = allGames.filter(game => game.won && game.knockType === 'KNOCK').length;
    const undercutWins = allGames.filter(game => game.won && game.knockType === 'UNDERCUT').length;

    const ginLosses = allGames.filter(game => !game.won && game.knockType === 'GIN').length;
    const knockLosses = allGames.filter(game => !game.won && game.knockType === 'KNOCK').length;
    const undercutLosses = allGames.filter(game => !game.won && game.knockType === 'UNDERCUT').length;

    // Average scores
    const avgUserScore = totalGames > 0 
      ? allGames.reduce((sum, game) => sum + game.userScore, 0) / totalGames 
      : 0;
    const avgOpponentScore = totalGames > 0 
      ? allGames.reduce((sum, game) => sum + game.opponentScore, 0) / totalGames 
      : 0;

    // Average game duration
    const gamesWithDuration = allGames.filter(game => game.duration);
    const avgDuration = gamesWithDuration.length > 0 
      ? gamesWithDuration.reduce((sum, game) => sum + (game.duration || 0), 0) / gamesWithDuration.length 
      : 0;

    // Recent performance (last 10 games)
    const recentGames = allGames.slice(0, 10);
    const recentWins = recentGames.filter(game => game.won).length;
    const recentWinRate = recentGames.length > 0 ? (recentWins / recentGames.length) * 100 : 0;

    // ELO progression
    const currentElo = user.elo;
    const eloHistory = user.eloHistory.reverse().map(entry => ({
      elo: entry.elo,
      change: entry.change,
      date: entry.createdAt
    }));

    // Peak ELO
    const peakElo = Math.max(currentElo, ...eloHistory.map(h => h.elo));

    // Current rank (approximate)
    const usersWithHigherElo = await prisma.user.count({
      where: {
        elo: { gt: currentElo },
        gamesPlayed: { gt: 0 }
      }
    });
    const currentRank = usersWithHigherElo + 1;

    const stats = {
      // Basic stats
      gamesPlayed: totalGames,
      gamesWon: wins,
      gamesLost: losses,
      winRate,
      
      // ELO stats
      currentElo,
      peakElo,
      currentRank,
      eloHistory,
      
      // Game type breakdown
      gameTypes: {
        gin: { wins: ginWins, losses: ginLosses },
        knock: { wins: knockWins, losses: knockLosses },
        undercut: { wins: undercutWins, losses: undercutLosses }
      },
      
      // Performance metrics
      averageScore: Math.round(avgUserScore),
      averageOpponentScore: Math.round(avgOpponentScore),
      averageDuration: Math.round(avgDuration / 1000), // Convert to seconds
      
      // Recent performance
      recentPerformance: {
        games: recentGames.length,
        wins: recentWins,
        winRate: recentWinRate
      }
    };

    return NextResponse.json(stats);

  } catch (error) {
    console.error('Get user stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get user statistics' },
      { status: 500 }
    );
  }
}