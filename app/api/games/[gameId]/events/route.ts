import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';
import { GameEventsService } from '../../../../../src/services/gameEvents';

/**
 * Get game events for debugging and monitoring
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { gameId } = params;

    // Get game from database to verify access
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        player1Id: true,
        player2Id: true,
        vsAI: true
      }
    });

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Check if user is a player in this game
    const isPlayer = game.player1Id === decoded.userId || game.player2Id === decoded.userId;
    
    if (!isPlayer) {
      return NextResponse.json(
        { error: 'Access denied. You are not a player in this game.' },
        { status: 403 }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const eventType = url.searchParams.get('type') || 'all';

    // Get events based on type
    let events;
    if (eventType === 'moves') {
      events = await GameEventsService.getRecentMoves(gameId, limit);
    } else {
      events = await GameEventsService.getGameEvents(gameId);
      if (limit < events.length) {
        events = events.slice(-limit); // Get most recent events
      }
    }

    // Get move count
    const moveCount = await GameEventsService.getMoveCount(gameId);

    return NextResponse.json({
      gameId,
      totalMoves: moveCount,
      events: events.map(event => ({
        id: event.id,
        eventType: event.eventType,
        userId: event.userId,
        username: event.user?.username || (event.userId ? 'Unknown' : 'AI'),
        timestamp: event.timestamp,
        eventData: event.eventData
      }))
    });

  } catch (error) {
    console.error('Get game events error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}