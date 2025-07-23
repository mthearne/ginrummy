import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../src/utils/jwt';
import { createNotification } from '../../../src/utils/notifications';

export async function POST(request: NextRequest) {
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

    // Create a test GAME_INVITATION notification
    const testNotification = await createNotification({
      userId: decoded.userId,
      type: 'GAME_INVITATION',
      title: 'Test Game Invitation from mhearne',
      message: 'mhearne invited you to join a Gin Rummy game! (This is a test notification)',
      data: {
        invitationId: 'test-invitation-123',
        gameId: 'test-game-456',
        senderUsername: 'mhearne',
        senderId: 'test-sender-789'
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
    });

    return NextResponse.json({
      success: true,
      message: 'Test notification created successfully',
      notification: {
        id: testNotification.id,
        type: testNotification.type,
        title: testNotification.title,
        message: testNotification.message
      }
    });

  } catch (error) {
    console.error('Test notification error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create test notification',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}