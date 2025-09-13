import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { verifyAuth } from '../../../../lib/auth';

const prisma = new PrismaClient();

/**
 * GET /api/chat/conversations
 * Get all chat conversations for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const userId = authResult.user.id;

    // Get friends with their latest messages and unread counts
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { receiverId: userId, status: 'ACCEPTED' }
        ]
      },
      include: {
        requester: { select: { id: true, username: true, elo: true } },
        receiver: { select: { id: true, username: true, elo: true } }
      }
    });

    const conversations = await Promise.all(
      friendships.map(async (friendship) => {
        const friendId = friendship.requesterId === userId ? friendship.receiverId : friendship.requesterId;
        const friend = friendship.requesterId === userId ? friendship.receiver : friendship.requester;

        // Get latest message
        const latestMessage = await prisma.chatMessage.findFirst({
          where: {
            OR: [
              { senderId: userId, receiverId: friendId },
              { senderId: friendId, receiverId: userId }
            ]
          },
          orderBy: { sentAt: 'desc' },
          include: {
            sender: { select: { username: true } },
            receiver: { select: { username: true } }
          }
        });

        // Get unread count
        const unreadCount = await prisma.chatMessage.count({
          where: {
            senderId: friendId,
            receiverId: userId,
            readAt: null
          }
        });

        // Get recent messages for this conversation
        const messages = await prisma.chatMessage.findMany({
          where: {
            OR: [
              { senderId: userId, receiverId: friendId },
              { senderId: friendId, receiverId: userId }
            ]
          },
          orderBy: { sentAt: 'asc' },
          take: 50,
          include: {
            sender: { select: { username: true } },
            receiver: { select: { username: true } }
          }
        });

        return {
          friendId,
          friendUsername: friend.username,
          friendElo: friend.elo,
          lastMessage: latestMessage ? {
            id: latestMessage.id,
            senderId: latestMessage.senderId,
            senderUsername: latestMessage.sender.username,
            receiverId: latestMessage.receiverId,
            receiverUsername: latestMessage.receiver.username,
            message: latestMessage.message,
            sentAt: latestMessage.sentAt.toISOString(),
            readAt: latestMessage.readAt?.toISOString()
          } : undefined,
          unreadCount,
          messages: messages.map(msg => ({
            id: msg.id,
            senderId: msg.senderId,
            senderUsername: msg.sender.username,
            receiverId: msg.receiverId,
            receiverUsername: msg.receiver.username,
            message: msg.message,
            sentAt: msg.sentAt.toISOString(),
            readAt: msg.readAt?.toISOString()
          }))
        };
      })
    );

    return NextResponse.json({ conversations });

  } catch (error) {
    console.error('Chat conversations error:', error);
    return NextResponse.json(
      { error: 'Failed to load conversations' },
      { status: 500 }
    );
  }
}