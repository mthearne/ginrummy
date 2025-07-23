import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../src/utils/jwt';
import { prisma } from '../../../src/utils/database';
import { emitToUser } from '../../../src/utils/socket';

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

    // Get sent and received invitations
    const [sentInvitations, receivedInvitations] = await Promise.all([
      prisma.gameInvitation.findMany({
        where: { senderId: decoded.userId },
        include: {
          game: {
            select: {
              id: true,
              status: true,
              createdAt: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.gameInvitation.findMany({
        where: { receiverId: decoded.userId },
        include: {
          game: {
            select: {
              id: true,
              status: true,
              createdAt: true
            }
          },
          sender: {
            select: {
              id: true,
              username: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    return NextResponse.json({
      sent: sentInvitations.map(inv => ({
        id: inv.id,
        game: inv.game,
        receiver: inv.receiver,
        message: inv.message,
        status: inv.status,
        sentAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt.toISOString()
      })),
      received: receivedInvitations.map(inv => ({
        id: inv.id,
        game: inv.game,
        sender: inv.sender,
        message: inv.message,
        status: inv.status,
        receivedAt: inv.createdAt.toISOString(),
        expiresAt: inv.expiresAt.toISOString()
      }))
    });

  } catch (error) {
    console.error('Get invitations error:', {
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
    const { gameId, receiverUsername, message } = body;

    if (!gameId || !receiverUsername) {
      return NextResponse.json(
        { error: 'Game ID and receiver username are required' },
        { status: 400 }
      );
    }

    // Find receiver by username
    const receiver = await prisma.user.findUnique({
      where: { username: receiverUsername },
      select: { id: true, username: true }
    });

    if (!receiver) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user is trying to invite themselves
    if (receiver.id === decoded.userId) {
      return NextResponse.json(
        { error: 'Cannot send invitation to yourself' },
        { status: 400 }
      );
    }

    // Verify game exists and user is a player
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        player1Id: true,
        player2Id: true
      }
    });

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Check if user is a player in the game
    if (game.player1Id !== decoded.userId && game.player2Id !== decoded.userId) {
      return NextResponse.json(
        { error: 'You are not a player in this game' },
        { status: 403 }
      );
    }

    // Check if game is in a state that allows invitations (waiting for player)
    if (game.status !== 'WAITING') {
      return NextResponse.json(
        { error: 'Game is not waiting for players' },
        { status: 400 }
      );
    }

    // Check if invitation already exists
    const existingInvitation = await prisma.gameInvitation.findFirst({
      where: {
        gameId,
        receiverId: receiver.id,
        status: 'PENDING'
      }
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'Invitation already sent to this user' },
        { status: 400 }
      );
    }

    // Create invitation (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    const invitation = await prisma.gameInvitation.create({
      data: {
        gameId,
        senderId: decoded.userId,
        receiverId: receiver.id,
        message: message || null,
        status: 'PENDING',
        expiresAt
      },
      include: {
        game: {
          select: {
            id: true,
            status: true,
            createdAt: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true
          }
        },
        sender: {
          select: {
            id: true,
            username: true
          }
        }
      }
    });

    // Send socket notification to receiver
    await emitToUser(receiver.id, 'game_invitation', {
      id: invitation.id,
      from: {
        id: invitation.sender.id,
        username: invitation.sender.username
      },
      gameId: invitation.gameId,
      message: invitation.message,
      sentAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString()
    });

    return NextResponse.json({
      message: 'Game invitation sent successfully',
      invitation: {
        id: invitation.id,
        game: invitation.game,
        receiver: invitation.receiver,
        message: invitation.message,
        status: invitation.status,
        sentAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString()
      }
    });

  } catch (error) {
    console.error('Send invitation error:', {
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