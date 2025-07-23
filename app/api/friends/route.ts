import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../src/utils/jwt';
import { prisma } from '../../../src/utils/database';

export async function GET(request: NextRequest) {
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

    // Get user's friends from database
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: decoded.userId, status: 'ACCEPTED' },
          { receiverId: decoded.userId, status: 'ACCEPTED' }
        ]
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            email: true,
            elo: true,
            gamesPlayed: true,
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            elo: true,
            gamesPlayed: true,
          }
        }
      }
    });

    // Format friends list
    const friends = friendships.map(friendship => {
      const friend = friendship.requesterId === decoded.userId 
        ? friendship.receiver 
        : friendship.requester;
      
      return {
        id: friend.id,
        username: friend.username,
        email: friend.email,
        elo: friend.elo,
        status: 'online', // TODO: Implement real online status
      };
    });

    // Get sent friend requests
    const sentRequests = await prisma.friendship.findMany({
      where: {
        requesterId: decoded.userId,
        status: 'PENDING'
      },
      include: {
        receiver: {
          select: {
            id: true,
            username: true,
            elo: true,
            gamesPlayed: true,
          }
        }
      }
    });

    // Get received friend requests
    const receivedRequests = await prisma.friendship.findMany({
      where: {
        receiverId: decoded.userId,
        status: 'PENDING'
      },
      include: {
        requester: {
          select: {
            id: true,
            username: true,
            elo: true,
            gamesPlayed: true,
          }
        }
      }
    });

    // Format friend requests for frontend
    const formattedSentRequests = sentRequests.map(request => ({
      id: request.id,
      user: {
        id: request.receiver.id,
        username: request.receiver.username,
        elo: request.receiver.elo,
        gamesPlayed: request.receiver.gamesPlayed,
      },
      sentAt: request.createdAt.toISOString(),
    }));

    const formattedReceivedRequests = receivedRequests.map(request => ({
      id: request.id,
      user: {
        id: request.requester.id,
        username: request.requester.username,
        elo: request.requester.elo,
        gamesPlayed: request.requester.gamesPlayed,
      },
      receivedAt: request.createdAt.toISOString(),
    }));

    // Format friends for frontend 
    const formattedFriends = friendships.map(friendship => {
      const friend = friendship.requesterId === decoded.userId 
        ? friendship.receiver 
        : friendship.requester;
      
      return {
        id: friendship.id, // This is the friendship ID
        user: {
          id: friend.id,
          username: friend.username,
          elo: friend.elo,
          gamesPlayed: friend.gamesPlayed,
        },
        since: friendship.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      friends: formattedFriends,
      sentRequests: formattedSentRequests,
      receivedRequests: formattedReceivedRequests,
    });

  } catch (error) {
    console.error('Get friends error details:', {
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