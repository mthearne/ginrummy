import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../../lib/auth';

const prisma = new PrismaClient();

/**
 * GET /api/chat/messages/[friendId]
 * Get chat messages with a specific friend or game opponent
 */
export async function GET(
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
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!friendId) {
      return NextResponse.json({ error: 'Friend ID is required' }, { status: 400 });
    }

    // Verify friendship exists OR users are in an active game together
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: friendId, status: 'ACCEPTED' },
          { requesterId: friendId, receiverId: userId, status: 'ACCEPTED' }
        ]
      }
    });

    // If not friends, check if they're in an active game together
    if (!friendship) {
      const activeGame = await prisma.game.findFirst({
        where: {
          OR: [
            { player1Id: userId, player2Id: friendId },
            { player1Id: friendId, player2Id: userId }
          ],
          status: { in: ['WAITING', 'ACTIVE'] }
        }
      });

      if (!activeGame) {
        return NextResponse.json({ error: 'You can only view messages with friends or active game opponents' }, { status: 403 });
      }
    }

    // Get messages between the two users
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: friendId },
          { senderId: friendId, receiverId: userId }
        ]
      },
      orderBy: { sentAt: 'asc' },
      skip: offset,
      take: limit,
      include: {
        sender: { select: { username: true } },
        receiver: { select: { username: true } }
      }
    });

    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      senderId: msg.senderId,
      senderUsername: msg.sender.username,
      receiverId: msg.receiverId,
      receiverUsername: msg.receiver.username,
      message: msg.message,
      sentAt: msg.sentAt.toISOString(),
      readAt: msg.readAt?.toISOString()
    }));

    return NextResponse.json(formattedMessages);

  } catch (error) {
    console.error('Get chat messages error:', error);
    return NextResponse.json(
      { error: 'Failed to load messages' },
      { status: 500 }
    );
  }
}