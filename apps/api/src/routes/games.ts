import { Router } from 'express';
import { z } from 'zod';
import { CreateGameSchema } from '@gin-rummy/common';
import { prisma } from '../utils/database.js';
import { requireAuth, AuthenticatedRequest, createAuthenticatedHandler } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validation.js';
import { GameService } from '../services/game.js';

const router = Router();
const gameService = GameService.getInstance();

const GameListQuerySchema = z.object({
  status: z.enum(['WAITING', 'ACTIVE', 'FINISHED']).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(50)).optional().default('20'),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional().default('0'),
});

const GameParamsSchema = z.object({
  gameId: z.string().uuid(),
});

/**
 * Create a new game
 */
router.post('/', requireAuth, validateBody(CreateGameSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { vsAI = false, isPrivate = false, maxPlayers = 2 } = req.body;

    const game = await prisma.game.create({
      data: {
        player1Id: req.user.id,
        vsAI,
        isPrivate,
        maxPlayers,
        status: vsAI ? 'ACTIVE' : 'WAITING',
        player2Id: null,
      },
      include: {
        player1: {
          select: { id: true, username: true, elo: true },
        },
        player2: {
          select: { id: true, username: true, elo: true },
        },
      },
    });

    // Initialize game engine if vs AI
    if (vsAI) {
      const gameEngine = gameService.createGame(game.id, req.user.id, 'ai-player', true);
      gameEngine.setPlayerUsernames({
        [req.user.id]: req.user.username,
        'ai-player': 'AI'
      });
    }

    res.status(201).json(game);
  } catch (error) {
    console.error('Create game error:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
}));

/**
 * Get current user's games
 */
router.get('/my-games', requireAuth, createAuthenticatedHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    const games = await prisma.game.findMany({
      where: {
        OR: [
          { player1Id: userId },
          { player2Id: userId },
        ],
        status: { in: ['WAITING', 'ACTIVE'] },
      },
      include: {
        player1: {
          select: { username: true, elo: true },
        },
        player2: {
          select: { username: true, elo: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const gameList = games.map((game: any) => ({
      id: game.id,
      status: game.status,
      playerCount: game.player2Id ? 2 : 1,
      maxPlayers: game.maxPlayers,
      isPrivate: game.isPrivate,
      vsAI: game.vsAI,
      createdAt: game.createdAt.toISOString(),
      updatedAt: game.updatedAt.toISOString(),
      players: [
        game.player1 && { username: game.player1.username, elo: game.player1.elo },
        game.player2 && { username: game.player2.username, elo: game.player2.elo },
      ].filter(Boolean),
      // Indicate if the current user is the creator
      isCreator: game.player1Id === userId,
    }));

    res.json({
      games: gameList,
      total: gameList.length,
    });
  } catch (error) {
    console.error('Get my games error:', error);
    res.status(500).json({ error: 'Failed to get games' });
  }
}));

/**
 * List games with optional filtering
 */
router.get('/', validateQuery(GameListQuerySchema), async (req, res) => {
  try {
    const { status, limit, offset } = req.query as any;

    const where = {
      ...(status && { status }),
      isPrivate: false, // Only show public games in listing
      vsAI: false, // Exclude AI games from public listing (only visible to creator)
    };

    const games = await prisma.game.findMany({
      where,
      include: {
        player1: {
          select: { username: true, elo: true },
        },
        player2: {
          select: { username: true, elo: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset),
    });

    const total = await prisma.game.count({ where });

    const gameList = games.map((game: any) => ({
      id: game.id,
      status: game.status,
      playerCount: game.player2Id ? 2 : 1,
      maxPlayers: game.maxPlayers,
      isPrivate: game.isPrivate,
      vsAI: game.vsAI,
      createdAt: game.createdAt.toISOString(),
      players: [
        game.player1 && { username: game.player1.username, elo: game.player1.elo },
        game.player2 && { username: game.player2.username, elo: game.player2.elo },
      ].filter(Boolean),
    }));

    res.json({
      games: gameList,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: Number(offset) + Number(limit) < total,
      },
    });
  } catch (error) {
    console.error('List games error:', error);
    res.status(500).json({ error: 'Failed to list games' });
  }
});

/**
 * Get specific game details
 */
router.get('/:gameId', requireAuth, validateParams(GameParamsSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: {
          select: { id: true, username: true, elo: true },
        },
        player2: {
          select: { id: true, username: true, elo: true },
        },
        winner: {
          select: { id: true, username: true },
        },
        gameEvents: {
          orderBy: { timestamp: 'asc' },
          take: 100, // Limit events for performance
        },
      },
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Check if user is part of this game
    const isPlayer = game.player1Id === req.user.id || game.player2Id === req.user.id;
    if (!isPlayer && game.isPrivate) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(game);
  } catch (error) {
    console.error('Get game error:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
}));

/**
 * Join an existing game
 */
router.post('/:gameId/join', requireAuth, validateParams(GameParamsSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { gameId } = req.params;

    // Check if game exists and can be joined
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game is not waiting for players' });
    }

    if (game.player2Id) {
      return res.status(400).json({ error: 'Game is full' });
    }

    if (game.player1Id === req.user.id) {
      return res.status(400).json({ error: 'Cannot join your own game' });
    }

    // Join the game
    const updatedGame = await prisma.game.update({
      where: { id: gameId },
      data: {
        player2Id: req.user.id,
        status: 'ACTIVE',
      },
      include: {
        player1: {
          select: { id: true, username: true, elo: true },
        },
        player2: {
          select: { id: true, username: true, elo: true },
        },
      },
    });

    // Initialize game engine
    gameService.createGame(gameId, game.player1Id, req.user.id, false);

    res.json(updatedGame);
  } catch (error) {
    console.error('Join game error:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
}));

/**
 * Leave a game
 */
router.post('/:gameId/leave', requireAuth, validateParams(GameParamsSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const isPlayer = game.player1Id === req.user.id || game.player2Id === req.user.id;
    if (!isPlayer) {
      return res.status(403).json({ error: 'Not a player in this game' });
    }

    if (game.status === 'ACTIVE') {
      // End game with other player as winner
      const winnerId = game.player1Id === req.user.id ? game.player2Id : game.player1Id;
      
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'FINISHED',
          winnerId,
          finishedAt: new Date(),
        },
      });
    } else {
      // Delete waiting game
      await prisma.game.delete({
        where: { id: gameId },
      });
    }

    // Remove from game engine
    gameService.removeGame(gameId);

    res.json({ message: 'Left game successfully' });
  } catch (error) {
    console.error('Leave game error:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
}));

/**
 * Get game replay data
 */
router.get('/:gameId/replay', requireAuth, validateParams(GameParamsSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { gameId } = req.params;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        gameEvents: {
          orderBy: { timestamp: 'asc' },
        },
        player1: {
          select: { username: true },
        },
        player2: {
          select: { username: true },
        },
      },
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'FINISHED') {
      return res.status(400).json({ error: 'Game not finished yet' });
    }

    // Filter events to only include public game actions (no hidden hands)
    const publicEvents = game.gameEvents.filter((event: any) => 
      ['draw', 'discard', 'knock', 'gin', 'game_end'].includes(event.eventType)
    );

    res.json({
      gameId: game.id,
      players: [game.player1?.username, game.player2?.username],
      events: publicEvents,
      duration: game.duration,
      winner: game.winnerId,
    });
  } catch (error) {
    console.error('Get replay error:', error);
    res.status(500).json({ error: 'Failed to get replay' });
  }
}));

export default router;