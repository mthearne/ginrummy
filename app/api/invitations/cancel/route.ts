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
    const { invitationId } = body;

    if (!invitationId) {
      return NextResponse.json(
        { error: 'Invitation ID is required' },
        { status: 400 }
      );
    }

    // Find the invitation
    const invitation = await prisma.gameInvitation.findUnique({
      where: { id: invitationId }
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    // Check if current user is the sender
    if (invitation.senderId !== decoded.userId) {
      return NextResponse.json(
        { error: 'You can only cancel invitations you sent' },
        { status: 403 }
      );
    }

    // Check if invitation is still pending
    if (invitation.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Only pending invitations can be cancelled' },
        { status: 400 }
      );
    }

    // Cancel the invitation
    await prisma.gameInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' } // Mark as declined to indicate cancellation
    });

    return NextResponse.json({
      message: 'Invitation cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel invitation error:', {
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