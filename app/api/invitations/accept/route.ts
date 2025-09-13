import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { prisma } from '../../../../src/utils/database';
import { createNotification } from '../../../../src/utils/notifications';
import { EventStore } from '../../../../src/services/eventStore';
import { ReplayService } from '../../../../src/services/replay';
import crypto from 'crypto';

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

    // Get current user info for events
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true }
    });

    if (!currentUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Create PLAYER_JOINED event through EventStore first
    const joinEventData = {
      gameId: invitation.gameId,
      playerId: decoded.userId,
      playerUsername: currentUser.username
    };

    const joinRequestId = crypto.randomUUID();
    
    // Get current stream version for this game
    const currentVersion = await EventStore.getCurrentVersion(invitation.gameId);
    console.log(`📊 AcceptInvitation: Current stream version: ${currentVersion}`);
    
    const appendResult = await EventStore.appendEvent(
      invitation.gameId,
      joinRequestId,
      currentVersion, // Use current version, not 0
      'PLAYER_JOINED',
      joinEventData,
      decoded.userId
    );

    if (!appendResult.success) {
      console.log('❌ AcceptInvitation: Failed to create PLAYER_JOINED event:', appendResult.error);
      return NextResponse.json(
        { error: 'Failed to join game', details: appendResult.error },
        { status: 500 }
      );
    }

    // Only update invitation status after successful event creation
    await prisma.gameInvitation.update({
      where: { id: invitationId },
      data: { status: 'ACCEPTED' }
    });

    // Update game record to reflect new player but keep in WAITING status
    await prisma.game.update({
      where: { id: invitation.gameId },
      data: {
        player2Id: decoded.userId,
        status: 'WAITING' // Keep in waiting status until both players are ready
      }
    });

    // Create notification for sender about acceptance
    await createNotification({
      userId: invitation.senderId,
      type: 'INVITATION_RESPONSE',
      title: 'Invitation Accepted!',
      message: `${currentUser!.username} accepted your game invitation!`,
      data: {
        invitationId: invitation.id,
        gameId: invitation.gameId,
        responderUsername: currentUser!.username,
        responderId: currentUser!.id,
        response: 'accepted'
      }
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