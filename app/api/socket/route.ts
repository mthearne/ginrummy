import { NextRequest, NextResponse } from 'next/server';
import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../../../src/utils/jwt';
import { prisma } from '../../../src/utils/database';
import { setSocketInstance } from '../../../src/utils/socket';

// Global socket.io instance
let io: SocketIOServer;

export async function GET(req: NextRequest) {
  if (!io) {
    console.log('Initializing Socket.io server...');
    
    // Create Socket.io server
    const httpServer = (global as any).httpServer;
    io = new SocketIOServer(httpServer, {
      path: '/api/socket',
      addTrailingSlash: false,
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    // Authentication middleware
    io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const decoded = verifyAccessToken(token);
        if (!decoded) {
          return next(new Error('Invalid token'));
        }

        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            username: true,
            email: true,
            elo: true,
          }
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.data.user = user;
        next();
      } catch (error) {
        console.error('Socket auth error:', error);
        next(new Error('Authentication failed'));
      }
    });

    // Set global instance for use in other routes
    setSocketInstance(io);

    // Connection handler
    io.on('connection', (socket) => {
      console.log(`User ${socket.data.user.username} connected`);
      
      // Join user's personal room for notifications
      socket.join(`user:${socket.data.user.id}`);

      // Join game room
      socket.on('join-game', async (gameId) => {
        try {
          console.log(`User ${socket.data.user.username} joining game ${gameId}`);
          
          // Verify user is part of this game
          const game = await prisma.game.findUnique({
            where: { id: gameId },
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

          if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
          }

          const userId = socket.data.user.id;
          const isPlayer = game.player1Id === userId || game.player2Id === userId;

          if (!isPlayer) {
            socket.emit('error', { message: 'You are not a player in this game' });
            return;
          }

          // Join the game room
          socket.join(`game:${gameId}`);

          // For AI games, automatically add AI as player2 if not present
          if (game.vsAI && !game.player2Id) {
            await prisma.game.update({
              where: { id: gameId },
              data: {
                player2Id: 'ai-player', // Special ID for AI
                status: 'ACTIVE'
              }
            });

            // Refresh game data
            const updatedGame = await prisma.game.findUnique({
              where: { id: gameId },
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

            // Create initial game state for AI game
            const gameState = {
              id: updatedGame!.id,
              status: updatedGame!.status,
              vsAI: updatedGame!.vsAI,
              players: [
                {
                  id: updatedGame!.player1!.id,
                  username: updatedGame!.player1!.username,
                  elo: updatedGame!.player1!.elo,
                  hand: [], // Will be populated by game engine
                  score: updatedGame!.player1Score,
                },
                {
                  id: 'ai-player',
                  username: 'AI Opponent',
                  elo: 1200,
                  hand: [],
                  score: updatedGame!.player2Score,
                }
              ],
              currentPlayerId: updatedGame!.player1!.id,
              phase: 'draw',
              turnTimer: 30,
              stockPileCount: 52,
              discardPile: [],
            };

            socket.emit('game-state', gameState);
            return;
          }

          // For regular games, emit current game state
          if (game.status === 'WAITING') {
            socket.emit('waiting-for-players', {
              gameId: gameId,
              currentPlayers: game.player2Id ? 2 : 1,
              maxPlayers: game.maxPlayers,
            });
          } else {
            // Emit basic game state (would need full game engine integration for complete state)
            const gameState = {
              id: game.id,
              status: game.status,
              vsAI: game.vsAI,
              players: [
                game.player1 ? {
                  id: game.player1.id,
                  username: game.player1.username,
                  elo: game.player1.elo,
                  score: game.player1Score,
                } : null,
                game.player2 ? {
                  id: game.player2.id,
                  username: game.player2.username,
                  elo: game.player2.elo,
                  score: game.player2Score,
                } : null,
              ].filter(Boolean),
              phase: 'draw',
              turnTimer: 30,
            };

            socket.emit('game-state', gameState);
          }

        } catch (error) {
          console.error('Join game error:', error);
          socket.emit('error', { message: 'Failed to join game' });
        }
      });

      // Leave game room
      socket.on('leave-game', (gameId) => {
        console.log(`User ${socket.data.user.username} leaving game ${gameId}`);
        socket.leave(`game:${gameId}`);
      });

      // Handle game moves (placeholder for now)
      socket.on('make-move', async (move) => {
        console.log(`User ${socket.data.user.username} making move:`, move);
        // TODO: Integrate with game engine
        socket.emit('error', { message: 'Game moves not implemented yet' });
      });

      // Handle chat messages
      socket.on('send-chat-message', async (data) => {
        const { gameId, message } = data;
        console.log(`Chat in game ${gameId}: ${socket.data.user.username}: ${message}`);
        
        // Broadcast to all players in the game room
        io.to(`game:${gameId}`).emit('chat-message', {
          id: Date.now().toString(),
          gameId,
          playerId: socket.data.user.id,
          username: socket.data.user.username,
          message,
          timestamp: new Date().toISOString(),
        });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`User ${socket.data.user.username} disconnected`);
      });
    });

    console.log('Socket.io server initialized');
  }

  return NextResponse.json({ message: 'Socket.io server running' });
}