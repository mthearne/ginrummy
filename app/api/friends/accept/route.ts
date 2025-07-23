import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { prisma } from '../../../../src/utils/database';

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

    // Parse request body
    const body = await request.json();
    const { requestId } = body;

    if (!requestId) {
      return NextResponse.json(
        { error: 'Request ID is required' },
        { status: 400 }
      );
    }

    // Find the friend request
    const friendRequest = await prisma.friendship.findUnique({
      where: { id: requestId },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            elo: true,
            gamesPlayed: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            elo: true,
            gamesPlayed: true
          }
        }
      }
    });

    if (!friendRequest) {
      return NextResponse.json(
        { error: 'Friend request not found' },
        { status: 404 }
      );
    }

    // Check if the current user is the receiver of the request
    if (friendRequest.receiverId !== decoded.userId) {
      return NextResponse.json(
        { error: 'You can only accept friend requests sent to you' },
        { status: 403 }
      );
    }

    // Check if request is still pending
    if (friendRequest.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Friend request has already been processed' },
        { status: 400 }
      );
    }

    // Accept the friend request
    const updatedFriendship = await prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            elo: true,
            gamesPlayed: true
          }
        }
      }
    });

    return NextResponse.json({
      message: 'Friend request accepted successfully',
      friendship: {
        id: updatedFriendship.id,
        friend: updatedFriendship.requester,
        acceptedAt: updatedFriendship.updatedAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Accept friend request error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: error.message })
      },
      { status: 500 }
    );
  }
}