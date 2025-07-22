import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/database.js';
import { requireAuth, AuthenticatedRequest, createAuthenticatedHandler } from '../middleware/auth.js';
import { validateParams, validateQuery } from '../middleware/validation.js';

const router = Router();

const UserParamsSchema = z.object({
  username: z.string().min(1),
});

const ProfileQuerySchema = z.object({
  includeHistory: z.string().transform(Boolean).optional().default('true'),
  historyLimit: z.string().transform(Number).pipe(z.number().min(1).max(50)).optional().default('20'),
});

/**
 * Get user profile by username
 */
router.get('/profile/:username', validateParams(UserParamsSchema), validateQuery(ProfileQuerySchema), async (req, res) => {
  try {
    const { username } = req.params;
    const { includeHistory, historyLimit } = req.query as any;

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        elo: true,
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = {
      ...user,
      winRate: user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0,
      recentGames: [] as any[],
      eloHistory: [] as any[],
    };

    if (includeHistory) {
      // Get recent games
      const recentGames = await prisma.game.findMany({
        where: {
          OR: [
            { player1Id: user.id },
            { player2Id: user.id },
          ],
          status: 'FINISHED',
        },
        include: {
          player1: { select: { username: true } },
          player2: { select: { username: true } },
          winner: { select: { username: true } },
        },
        orderBy: { finishedAt: 'desc' },
        take: Number(historyLimit),
      });

      profile.recentGames = recentGames.map((game: any) => {
        const isPlayer1 = game.player1Id === user.id;
        const opponent = isPlayer1 ? game.player2 : game.player1;
        const userScore = isPlayer1 ? game.player1Score : game.player2Score;
        const opponentScore = isPlayer1 ? game.player2Score : game.player1Score;

        return {
          id: game.id,
          opponent: opponent?.username || 'AI',
          result: game.winnerId === user.id ? 'win' : 'loss',
          score: userScore,
          opponentScore,
          duration: game.duration || 0,
          knockType: game.knockType?.toLowerCase() || 'unknown',
          createdAt: game.finishedAt?.toISOString() || game.createdAt.toISOString(),
        };
      });

      // Get ELO history
      const eloHistory = await prisma.eloHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        take: 100, // Last 100 ELO changes
      });

      profile.eloHistory = eloHistory.map((entry: any) => ({
        elo: entry.elo,
        date: entry.createdAt.toISOString(),
      }));
    }

    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

/**
 * Get leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

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
      take: Number(limit),
      skip: Number(offset),
    });

    const leaderboard = users.map((user: any, index: number) => ({
      rank: Number(offset) + index + 1,
      username: user.username,
      elo: user.elo,
      gamesPlayed: user.gamesPlayed,
      winRate: user.gamesPlayed > 0 ? (user.gamesWon / user.gamesPlayed) * 100 : 0,
    }));

    res.json(leaderboard);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

/**
 * Update user profile (authenticated user only)
 */
router.patch('/profile', requireAuth, createAuthenticatedHandler(async (req, res) => {
  try {
    const allowedUpdates = ['username'];
    const updates = Object.keys(req.body);
    const isValidUpdate = updates.every(update => allowedUpdates.includes(update));

    if (!isValidUpdate) {
      return res.status(400).json({ error: 'Invalid updates' });
    }

    const { username } = req.body;

    // Check if username is already taken
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username,
          id: { not: req.user.id },
        },
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: req.body,
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

    res.json(updatedUser);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}));

/**
 * Get user statistics
 */
router.get('/stats', requireAuth, createAuthenticatedHandler(async (req, res) => {
  try {
    const stats = await prisma.game.aggregate({
      where: {
        OR: [
          { player1Id: req.user.id },
          { player2Id: req.user.id },
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
        winnerId: req.user.id,
        status: 'FINISHED',
      },
    });

    const knockStats = await prisma.game.groupBy({
      by: ['knockType'],
      where: {
        winnerId: req.user.id,
        status: 'FINISHED',
        knockType: { not: null },
      },
      _count: true,
    });

    res.json({
      totalGames: stats._count.id,
      gamesWon: winStats,
      winRate: stats._count.id > 0 ? (winStats / stats._count.id) * 100 : 0,
      averageGameDuration: stats._avg.duration || 0,
      knockTypeStats: knockStats.reduce((acc: any, stat: any) => {
        acc[stat.knockType!] = stat._count;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
}));

export default router;