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
            lastSeen: true,
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            elo: true,
            gamesPlayed: true,
            lastSeen: true,
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
      
      // Calculate online status - user is online if they were active within the last 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const isOnline = friend.lastSeen && new Date(friend.lastSeen) > fiveMinutesAgo;
      
      return {
        id: friendship.id, // This is the friendship ID
        user: {
          id: friend.id,
          username: friend.username,
          elo: friend.elo,
          gamesPlayed: friend.gamesPlayed,
          isOnline: Boolean(isOnline),
          lastSeen: friend.lastSeen?.toISOString(),
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
    const { username } = body;

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Find user by username
    const targetUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true }
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is trying to add themselves
    if (targetUser.id === decoded.userId) {
      return NextResponse.json(
        { error: 'Cannot send friend request to yourself' },
        { status: 400 }
      );
    }

    // Check if friendship already exists
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: decoded.userId, receiverId: targetUser.id },
          { requesterId: targetUser.id, receiverId: decoded.userId }
        ]
      }
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') {
        return NextResponse.json(
          { error: 'You are already friends with this user' },
          { status: 400 }
        );
      } else if (existingFriendship.status === 'PENDING') {
        return NextResponse.json(
          { error: 'Friend request already sent or received' },
          { status: 400 }
        );
      }
    }

    // Create friend request
    const friendRequest = await prisma.friendship.create({
      data: {
        requesterId: decoded.userId,
        receiverId: targetUser.id,
        status: 'PENDING'
      },
      include: {
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

    return NextResponse.json({
      message: 'Friend request sent successfully',
      request: {
        id: friendRequest.id,
        user: friendRequest.receiver,
        sentAt: friendRequest.createdAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Send friend request error:', {
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