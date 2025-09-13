import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../../lib/auth';

const prisma = new PrismaClient();

/**
 * POST /api/chat/read/[friendId]
 * Mark all messages from a friend as read
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { friendId: string } }
) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const userId = authResult.user.id;
    const { friendId } = params;

    // Mark all unread messages from this friend as read
    await prisma.chatMessage.updateMany({
      where: {
        senderId: friendId,
        receiverId: userId,
        readAt: null
      },
      data: {
        readAt: new Date()
      }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Mark messages as read error:', error);
    return NextResponse.json(
      { error: 'Failed to mark messages as read' },
      { status: 500 }
    );
  }
}