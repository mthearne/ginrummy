import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { prisma } from '../../../../src/utils/database';
import { createNotification } from '../../../../src/utils/notifications';

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
        { error: 'You can only decline invitations sent to you' },
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

    // Decline the invitation
    await prisma.gameInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' }
    });

    // Get current user info for notification
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true }
    });

    // Create notification for sender about decline
    await createNotification({
      userId: invitation.senderId,
      type: 'INVITATION_RESPONSE',
      title: 'Invitation Declined',
      message: `${currentUser!.username} declined your game invitation.`,
      data: {
        invitationId: invitation.id,
        gameId: invitation.gameId,
        responderUsername: currentUser!.username,
        responderId: currentUser!.id,
        response: 'declined'
      }
    });

    return NextResponse.json({
      message: 'Invitation declined successfully'
    });

  } catch (error) {
    console.error('Decline invitation error:', {
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