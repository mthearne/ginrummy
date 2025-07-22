import { Socket, Server } from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '@gin-rummy/common';
import { prisma } from '../utils/database.js';

/**
 * Setup lobby-related socket event handlers
 */
export function setupLobbyHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>,
  io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
) {
  /**
   * User connects to lobby
   */
  socket.on('disconnect', async () => {
    // Handle disconnection if needed
  });

  // Handle initial connection setup
  socket.join('lobby');
  sendLobbyUpdate();

  /**
   * Send lobby update to all connected users
   */
  async function sendLobbyUpdate() {
    try {
      // Get waiting games
      const waitingGames = await prisma.game.findMany({
        where: {
          status: 'WAITING',
          isPrivate: false,
        },
        include: {
          player1: {
            select: { username: true, elo: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20, // Limit to 20 most recent
      });

      const gameList = waitingGames.map((game: any) => ({
        id: game.id,
        status: game.status,
        playerCount: 1,
        maxPlayers: game.maxPlayers,
        isPrivate: game.isPrivate,
        vsAI: game.vsAI,
        createdAt: game.createdAt.toISOString(),
        players: [
          {
            username: game.player1.username,
            elo: game.player1.elo,
          },
        ],
      }));

      // Get online players count
      const onlineCount = io.sockets.sockets.size;

      io.to('lobby').emit('lobby_update', {
        games: gameList,
        onlineUsers: onlineCount,
      });
    } catch (error) {
      console.error('Lobby update error:', error);
    }
  }

  // Periodically send lobby updates
  const lobbyUpdateInterval = setInterval(sendLobbyUpdate, 10000); // Every 10 seconds

  socket.on('disconnect', () => {
    clearInterval(lobbyUpdateInterval);
  });
}