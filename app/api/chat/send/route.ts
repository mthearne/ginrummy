import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../lib/auth';

const prisma = new PrismaClient();

/**
 * POST /api/chat/send
 * Send a chat message to a friend
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const userId = authResult.user.id;
    const body = await request.json();
    const { receiverId, message } = body;

    if (!receiverId || !message?.trim()) {
      return NextResponse.json({ error: 'Receiver ID and message are required' }, { status: 400 });
    }

    if (message.length > 500) {
      return NextResponse.json({ error: 'Message too long (max 500 characters)' }, { status: 400 });
    }

    // Verify friendship exists OR users are in an active game together
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: receiverId, status: 'ACCEPTED' },
          { requesterId: receiverId, receiverId: userId, status: 'ACCEPTED' }
        ]
      }
    });

    // If not friends, check if they're in an active game together
    if (!friendship) {
      const activeGame = await prisma.game.findFirst({
        where: {
          OR: [
            { player1Id: userId, player2Id: receiverId },
            { player1Id: receiverId, player2Id: userId }
          ],
          status: { in: ['WAITING', 'ACTIVE'] }
        }
      });

      if (!activeGame) {
        return NextResponse.json({ error: 'You can only send messages to friends or active game opponents' }, { status: 403 });
      }
    }

    // Create the message
    const chatMessage = await prisma.chatMessage.create({
      data: {
        senderId: userId,
        receiverId,
        message: message.trim()
      },
      include: {
        sender: { select: { username: true } },
        receiver: { select: { username: true } }
      }
    });

    // Create a notification for the receiver
    try {
      await prisma.notification.create({
        data: {
          userId: receiverId,
          type: 'FRIEND_REQUEST_ACCEPTED', // Temporary: using existing enum until CHAT_MESSAGE is properly set up
          title: `New message from ${chatMessage.sender.username}`,
          message: message.length > 50 ? `${message.substring(0, 50)}...` : message,
          data: {
            type: 'chat_message',
            senderId: userId,
            senderUsername: chatMessage.sender.username,
            chatLink: `/lobby?chat=${userId}`
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Expire in 24 hours
        }
      });
    } catch (notifError) {
      console.error('Failed to create notification:', notifError);
      // Don't fail the whole request if notification creation fails
    }

    return NextResponse.json({
      id: chatMessage.id,
      senderId: chatMessage.senderId,
      senderUsername: chatMessage.sender.username,
      receiverId: chatMessage.receiverId,
      receiverUsername: chatMessage.receiver.username,
      message: chatMessage.message,
      sentAt: chatMessage.sentAt.toISOString(),
      readAt: chatMessage.readAt?.toISOString()
    });

  } catch (error) {
    console.error('Send chat message error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}