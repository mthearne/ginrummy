import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  InterServerEvents,
  SocketData,
} from '@gin-rummy/common';
import { verifyAccessToken } from '../utils/jwt.js';
import { setupGameHandlers } from './game-handlers.js';
import { setupLobbyHandlers } from './lobby-handlers.js';
import { initializeNotifications } from '../services/notifications.js';

let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Initialize Socket.io server with authentication and handlers
 */
export function initializeSocket(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('No token provided'));
      }

      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      socket.data.username = payload.username;
      
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User ${socket.data.username} connected`);

    // Setup event handlers
    setupGameHandlers(socket, io);
    setupLobbyHandlers(socket, io);

    socket.on('disconnect', (reason) => {
      console.log(`User ${socket.data.username} disconnected: ${reason}`);
      
      // Handle cleanup when user disconnects
      if (socket.data.gameId) {
        socket.leave(socket.data.gameId);
        socket.to(socket.data.gameId).emit('player_left', socket.data.userId);
      }
    });
  });

  // Initialize notification service
  initializeNotifications(io);

  console.log('✅ Socket.io initialized');
  return io;
}

/**
 * Get Socket.io server instance
 */
export function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}