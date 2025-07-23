import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { prisma } from '../../../../src/utils/database';
import { emitToUser } from '../../../../src/utils/socket';

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
    const { invitationId } = body;

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
        { status: 400 }
      );
    }

    // Find the invitation
    const invitation = await prisma.gameInvitation.findUnique({
      where: { id: invitationId },
      include: {
        game: {
          select: {
            id: true,
            status: true,
            player1Id: true,
            player2Id: true
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

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Check if current user is the receiver
    if (invitation.receiverId !== decoded.userId) {
      return NextResponse.json(
        { error: 'You can only accept invitations sent to you' },
        { status: 403 }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Invitation has already been processed' },
        { status: 400 }
      );
    }

    // Check if invitation has expired
    if (invitation.expiresAt < new Date()) {
      await prisma.gameInvitation.update({
        where: { id: invitationId },
        data: { status: 'EXPIRED' }
      });
      
      return NextResponse.json(
        { error: 'Invitation has expired' },
        { status: 400 }
      );
    }

    // Check if game is still waiting for players
    if (invitation.game.status !== 'WAITING') {
      return NextResponse.json(
        { error: 'Game is no longer waiting for players' },
        { status: 400 }
      );
    }

    // Accept the invitation and join the game
    await Promise.all([
      // Update invitation status
      prisma.gameInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED' }
      }),
      // Add user to game
      prisma.game.update({
        where: { id: invitation.gameId },
        data: {
          player2Id: decoded.userId,
          status: 'ACTIVE'
        }
      })
    ]);

    // Get current user info for notification
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true }
    });

    // Send socket notification to sender about acceptance
    await emitToUser(invitation.senderId, 'invitation_response', {
      invitationId: invitation.id,
      gameId: invitation.gameId,
      from: {
        id: currentUser!.id,
        username: currentUser!.username
      },
      response: 'accepted'
    });

    return NextResponse.json({
      message: 'Invitation accepted successfully',
      gameId: invitation.gameId
    });

  } catch (error) {
    console.error('Accept invitation error:', {
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