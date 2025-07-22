import { prisma } from '../utils/database.js';
import { UserProfile, GameHistory, EloPoint } from '@gin-rummy/common';

/**
 * User service for profile and statistics operations
 */
export class UserService {
  /**
   * Get user profile with game history and ELO history
   */
  public async getUserProfile(username: string, includeHistory = true): Promise<UserProfile | null> {
    try {
      const user = await prisma.user.findUnique({
        where: { username },
        select: {
          id: true,
          email: true,
          username: true,
          elo: true,
          gamesPlayed: true,
          gamesWon: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        return null;
      }

      const profile: UserProfile = {
        ...user,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        winRate: user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0,
        recentGames: [],
        eloHistory: [],
      };

      if (includeHistory) {
        // Get recent games
        const recentGames = await this.getUserGameHistory(user.id, 20);
        profile.recentGames = recentGames;

        // Get ELO history
        const eloHistory = await this.getUserEloHistory(user.id, 100);
        profile.eloHistory = eloHistory;
      }

      return profile;
    } catch (error) {
      console.error('Get user profile error:', error);
      return null;
    }
  }

  /**
   * Get user's game history
   */
  public async getUserGameHistory(userId: string, limit = 20): Promise<GameHistory[]> {
    try {
      const games = await prisma.game.findMany({
        where: {
          OR: [
            { player1Id: userId },
            { player2Id: userId },
          ],
          status: 'FINISHED',
        },
        include: {
          player1: { select: { id: true, username: true } },
          player2: { select: { id: true, username: true } },
          winner: { select: { id: true, username: true } },
        },
        orderBy: { finishedAt: 'desc' },
        take: limit,
      });

      return games.map((game: any) => {
        const isPlayer1 = game.player1Id === userId;
        const opponent = isPlayer1 ? game.player2 : game.player1;
        const userScore = isPlayer1 ? game.player1Score : game.player2Score;
        const opponentScore = isPlayer1 ? game.player2Score : game.player1Score;

        return {
          id: game.id,
          opponent: opponent?.username || 'AI',
          result: game.winnerId === userId ? 'win' : 'loss',
          score: userScore,
          opponentScore,
          duration: game.duration || 0,
          knockType: game.knockType?.toLowerCase() as 'gin' | 'knock' | 'undercut' || 'knock',
          createdAt: game.finishedAt?.toISOString() || game.createdAt.toISOString(),
        };
      });
    } catch (error) {
      console.error('Get game history error:', error);
      return [];
    }
  }

  /**
   * Get user's ELO rating history
   */
  public async getUserEloHistory(userId: string, limit = 100): Promise<EloPoint[]> {
    try {
      const eloHistory = await prisma.eloHistory.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });

      return eloHistory.map((entry: any) => ({
        elo: entry.elo,
        date: entry.createdAt.toISOString(),
      }));
    } catch (error) {
      console.error('Get ELO history error:', error);
      return [];
    }
  }

  /**
   * Get leaderboard
   */
  public async getLeaderboard(limit = 50, offset = 0) {
    try {
      const users = await prisma.user.findMany({
        where: {
          gamesPlayed: {
            gte: 5, // Only include users with at least 5 games
          },
        },
        select: {
          username: true,
          elo: true,
          gamesPlayed: true,
          gamesWon: true,
        },
        orderBy: { elo: 'desc' },
        take: limit,
        skip: offset,
      });

      return users.map((user: any, index: number) => ({
        rank: offset + index + 1,
        username: user.username,
        elo: user.elo,
        gamesPlayed: user.gamesPlayed,
        winRate: user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0,
      }));
    } catch (error) {
      console.error('Get leaderboard error:', error);
      return [];
    }
  }

  /**
   * Update user profile
   */
  public async updateUserProfile(
    userId: string,
    updates: { username?: string }
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      // Check if username is already taken
      if (updates.username) {
        const existingUser = await prisma.user.findFirst({
          where: {
            username: updates.username,
            id: { not: userId },
          },
        });

        if (existingUser) {
          return { success: false, error: 'Username already taken' };
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updates,
        select: {
          id: true,
          email: true,
          username: true,
          elo: true,
          gamesPlayed: true,
          gamesWon: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return { success: true, user: updatedUser };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'Failed to update profile' };
    }
  }

  /**
   * Get user statistics
   */
  public async getUserStats(userId: string) {
    try {
      const stats = await prisma.game.aggregate({
        where: {
          OR: [
            { player1Id: userId },
            { player2Id: userId },
          ],
          status: 'FINISHED',
        },
        _count: {
          id: true,
        },
        _avg: {
          duration: true,
        },
      });

      const winStats = await prisma.game.count({
        where: {
          winnerId: userId,
          status: 'FINISHED',
        },
      });

      const knockStats = await prisma.game.groupBy({
        by: ['knockType'],
        where: {
          winnerId: userId,
          status: 'FINISHED',
          knockType: { not: null },
        },
        _count: true,
      });

      return {
        totalGames: stats._count.id,
        gamesWon: winStats,
        winRate: stats._count.id > 0 ? (winStats / stats._count.id) * 100 : 0,
        averageGameDuration: stats._avg.duration || 0,
        knockTypeStats: knockStats.reduce((acc: any, stat: any) => {
          acc[stat.knockType!] = stat._count;
          return acc;
        }, {} as Record<string, number>),
      };
    } catch (error) {
      console.error('Get user stats error:', error);
      return {
        totalGames: 0,
        gamesWon: 0,
        winRate: 0,
        averageGameDuration: 0,
        knockTypeStats: {},
      };
    }
  }

  /**
   * Search users by username
   */
  public async searchUsers(query: string, limit = 10) {
    try {
      const users = await prisma.user.findMany({
        where: {
          username: {
            contains: query,
            mode: 'insensitive',
          },
        },
        select: {
          username: true,
          elo: true,
          gamesPlayed: true,
          gamesWon: true,
        },
        take: limit,
      });

      return users.map((user: any) => ({
        username: user.username,
        elo: user.elo,
        gamesPlayed: user.gamesPlayed,
        winRate: user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0,
      }));
    } catch (error) {
      console.error('Search users error:', error);
      return [];
    }
  }
}