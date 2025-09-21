import { NextRequest } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';

// Simple in-memory store for active game streaming connections
const gameConnections = new Map<string, { 
  controller: ReadableStreamDefaultController; 
  cleanup: () => void; 
  userId: string; 
  gameId?: string;
}>();

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header or query parameter
    const authHeader = request.headers.get('authorization');
    const tokenFromQuery = request.nextUrl.searchParams.get('token');
    
    let token: string | null = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (tokenFromQuery) {
      token = tokenFromQuery;
    }

    if (!token) {
      return new Response('Unauthorized', { status: 401 });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return new Response('Invalid token', { status: 401 });
    }

    const userId = decoded.userId;
    const encoder = new TextEncoder();

    // Create game streaming SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        console.log(`🎮 Game stream connection established for user ${userId}`);
        
        // Send connection confirmation
        controller.enqueue(encoder.encode('data: {"type":"game_connected","message":"Game stream connection established"}\n\n'));

        // Keep-alive ping every 30 seconds
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode('data: {"type":"ping"}\n\n'));
          } catch (error) {
            console.log(`🎮 Game stream connection closed for user ${userId} (ping failed)`);
            clearInterval(pingInterval);
            gameConnections.delete(userId);
          }
        }, 30000);

        // Store connection for sending game updates
        const cleanup = () => {
          clearInterval(pingInterval);
          gameConnections.delete(userId);
          console.log(`🎮 Cleaned up game stream connection for user ${userId}`);
        };

        gameConnections.set(userId, { controller, cleanup, userId });
      },
      
      cancel() {
        console.log(`🎮 Game stream cancelled for user ${userId}`);
        const connection = gameConnections.get(userId);
        if (connection) {
          connection.cleanup();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization',
      },
    });

  } catch (error) {
    console.error('🎮 Game stream error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

// Game stream events
export interface GameStreamEvent {
  type: 'game_state_updated' | 'player_state_updated' | 'player_joined' | 'player_left' | 'move_made' | 'turn_changed' | 'game_ended' | 'opponent_thinking' | 'game_connected' | 'ping';
  gameId?: string;
  data?: any;
  message?: string;
}

// Function to send game events to connected users (used internally)
function sendGameEventToUser(userId: string, event: GameStreamEvent) {
  console.log('🎮 [STREAM] Attempting to send game event to user:', userId);
  console.log('🎮 [STREAM] Active game connections:', Array.from(gameConnections.keys()));
  const connection = gameConnections.get(userId);
  if (connection) {
    try {
      const encoder = new TextEncoder();
      const message = `data: ${JSON.stringify(event)}\n\n`;
      connection.controller.enqueue(encoder.encode(message));
      console.log(`🎮 [STREAM] Sent game event to user ${userId}:`, event);
      return true;
    } catch (error) {
      console.log(`🎮 [STREAM] Failed to send game event to user ${userId}, removing connection:`, error);
      connection.cleanup();
      return false;
    }
  }
  console.log(`🎮 [STREAM] No active game stream connection found for user ${userId}`);
  return false;
}

// Function to send game events to all players in a game
function sendGameEventToGame(gameId: string, event: GameStreamEvent, playerIds: string[]) {
  console.log('🎮 [STREAM] Broadcasting game event to all players in game:', gameId);
  let successCount = 0;
  
  for (const playerId of playerIds) {
    const success = sendGameEventToUser(playerId, { ...event, gameId });
    if (success) successCount++;
  }
  
  console.log(`🎮 [STREAM] Broadcast completed: ${successCount}/${playerIds.length} players notified`);
  return successCount;
}

// Make the functions available globally for other modules
(global as any).sendGameEventToUser = sendGameEventToUser;
(global as any).sendGameEventToGame = sendGameEventToGame;
