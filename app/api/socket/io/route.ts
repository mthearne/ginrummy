import { NextRequest } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { prisma } from '../../../../src/utils/database';

// This approach works for development but needs modification for production
export async function GET(req: NextRequest) {
  const res = (req as any).socket?.server;
  
  if (!res) {
    console.log('Socket.io not available in this environment');
    return new Response('Socket.io not supported', { status: 501 });
  }

  if (!res.io) {
    console.log('Setting up Socket.io server...');
    
    const io = new SocketIOServer(res, {
      path: '/api/socket/io',
      addTrailingSlash: false,
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

    // Handle connections
    io.on('connection', (socket) => {
      console.log(`User ${socket.data.user.username} connected via Socket.io`);

      socket.on('join-game', async (gameId) => {
        // Join game logic here (similar to above)
        console.log(`User joining game ${gameId}`);
        socket.join(`game:${gameId}`);
        
        // For now, emit a simple game state
        socket.emit('game-state', {
          id: gameId,
          message: 'Socket.io connected successfully'
        });
      });

      socket.on('disconnect', () => {
        console.log(`User ${socket.data.user.username} disconnected`);
      });
    });

    res.io = io;
  }

  return new Response('Socket.io server running');
}