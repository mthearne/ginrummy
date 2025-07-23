import { Server as SocketIOServer } from 'socket.io';

// Import the socket instance from the socket route
async function getSocketInstance(): Promise<SocketIOServer | null> {
  try {
    const { getSocketIO } = await import('../../app/api/socket/route');
    return getSocketIO();
  } catch (error) {
    console.error('Failed to get socket instance:', error);
    return null;
  }
}

export async function emitToUser(userId: string, event: string, data: any): Promise<boolean> {
  console.log(`Attempting to emit ${event} to user ${userId}:`, data);
  
  const io = await getSocketInstance();
  if (!io) {
    console.warn('Socket instance not available for notification - Socket.io may not be initialized');
    // For now, just log the notification that would have been sent
    console.log(`Would have emitted ${event} notification to user ${userId}:`, JSON.stringify(data, null, 2));
    return false;
  }

  // Emit to user's personal room (they join this on connect)
  io.to(`user:${userId}`).emit(event, data);
  console.log(`Successfully emitted ${event} to user ${userId}:`, data);
  return true;
}

export async function emitToGame(gameId: string, event: string, data: any): Promise<boolean> {
  const io = await getSocketInstance();
  if (!io) {
    console.warn('Socket instance not available for notification');
    return false;
  }

  io.to(`game:${gameId}`).emit(event, data);
  console.log(`Emitted ${event} to game ${gameId}:`, data);
  return true;
}