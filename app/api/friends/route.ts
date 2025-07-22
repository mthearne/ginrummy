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
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            email: true,
            elo: true,
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

    return NextResponse.json({
      friends
    });

  } catch (error) {
    console.error('Get friends error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}