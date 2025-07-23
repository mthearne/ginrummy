import { Server as SocketIOServer } from 'socket.io';

// Global socket.io instance (set by socket route)
declare global {
  var socketInstance: SocketIOServer | undefined;
}

export function getSocketInstance(): SocketIOServer | null {
  return global.socketInstance || null;
}

export function setSocketInstance(io: SocketIOServer): void {
  global.socketInstance = io;
}

export function emitToUser(userId: string, event: string, data: any): boolean {
  const io = getSocketInstance();
  if (!io) {
    console.warn('Socket instance not available for notification');
    return false;
  }

  // Emit to user's personal room (they join this on connect)
  io.to(`user:${userId}`).emit(event, data);
  console.log(`Emitted ${event} to user ${userId}:`, data);
  return true;
}

export function emitToGame(gameId: string, event: string, data: any): boolean {
  const io = getSocketInstance();
  if (!io) {
    console.warn('Socket instance not available for notification');
    return false;
  }

  io.to(`game:${gameId}`).emit(event, data);
  console.log(`Emitted ${event} to game ${gameId}:`, data);
  return true;
}