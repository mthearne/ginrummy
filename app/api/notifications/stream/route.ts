import { NextRequest } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { getUnreadNotifications } from '../../../../src/utils/notifications';

// Simple in-memory store for active SSE connections
const connections = new Map<string, { controller: ReadableStreamDefaultController; cleanup: () => void }>();

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

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        console.log(`SSE connection established for user ${userId}`);
        
        // Send connection confirmation
        controller.enqueue(encoder.encode('data: {"type":"connected","message":"SSE connection established"}\n\n'));

        // Send any unread notifications immediately
        try {
          const notifications = await getUnreadNotifications(userId);
          for (const notification of notifications) {
            const data = {
              id: notification.id,
              type: notification.type,
              title: notification.title,
              message: notification.message,
              data: notification.data,
              createdAt: notification.createdAt.toISOString(),
              read: notification.read
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          }
        } catch (error) {
          console.error('Failed to send initial notifications:', error);
        }

        // Keep-alive ping every 30 seconds
        const pingInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode('data: {"type":"ping"}\n\n'));
          } catch (error) {
            console.log(`SSE connection closed for user ${userId} (ping failed)`);
            clearInterval(pingInterval);
            connections.delete(userId);
          }
        }, 30000);

        // Store connection for sending notifications
        const cleanup = () => {
          clearInterval(pingInterval);
          connections.delete(userId);
          console.log(`Cleaned up SSE connection for user ${userId}`);
        };

        connections.set(userId, { controller, cleanup });
      },
      
      cancel() {
        console.log(`SSE stream cancelled for user ${userId}`);
        const connection = connections.get(userId);
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
    console.error('SSE stream error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

// Export function to send notifications to connected users
export function sendNotificationToUser(userId: string, data: any) {
  const connection = connections.get(userId);
  if (connection) {
    try {
      const encoder = new TextEncoder();
      const message = `data: ${JSON.stringify(data)}\n\n`;
      connection.controller.enqueue(encoder.encode(message));
      console.log(`Sent SSE notification to user ${userId}:`, data);
      return true;
    } catch (error) {
      console.log(`Failed to send SSE notification to user ${userId}, removing connection:`, error);
      connection.cleanup();
      return false;
    }
  }
  console.log(`No active SSE connection found for user ${userId}`);
  return false;
}