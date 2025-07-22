import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/database.js';
import { requireAuth, createAuthenticatedHandler } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import { sendFriendRequestNotification, sendFriendRequestAcceptedNotification } from '../services/notifications.js';

const router = Router();

const SendFriendRequestSchema = z.object({
  username: z.string().min(1).max(50),
});

const FriendActionSchema = z.object({
  friendshipId: z.string().uuid(),
});

/**
 * Get user's friends and friend requests
 */
router.get('/', requireAuth, createAuthenticatedHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    const [friends, sentRequests, receivedRequests] = await Promise.all([
      // Get accepted friendships
      prisma.friendship.findMany({
        where: {
          OR: [
            { requesterId: userId, status: 'ACCEPTED' },
            { receiverId: userId, status: 'ACCEPTED' }
          ]
        },
        include: {
          requester: {
            select: { id: true, username: true, elo: true, gamesPlayed: true }
          },
          receiver: {
            select: { id: true, username: true, elo: true, gamesPlayed: true }
          }
        }
      }),
      
      // Get sent friend requests
      prisma.friendship.findMany({
        where: {
          requesterId: userId,
          status: 'PENDING'
        },
        include: {
          receiver: {
            select: { id: true, username: true, elo: true, gamesPlayed: true }
          }
        }
      }),
      
      // Get received friend requests
      prisma.friendship.findMany({
        where: {
          receiverId: userId,
          status: 'PENDING'
        },
        include: {
          requester: {
            select: { id: true, username: true, elo: true, gamesPlayed: true }
          }
        }
      })
    ]);

    // Format friends list
    const friendsList = friends.map(friendship => {
      const friend = friendship.requesterId === userId ? friendship.receiver : friendship.requester;
      return {
        id: friendship.id,
        user: friend,
        since: friendship.createdAt
      };
    });

    res.json({
      friends: friendsList,
      sentRequests: sentRequests.map(req => ({
        id: req.id,
        user: req.receiver,
        sentAt: req.createdAt
      })),
      receivedRequests: receivedRequests.map(req => ({
        id: req.id,
        user: req.requester,
        receivedAt: req.createdAt
      }))
    });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Failed to get friends' });
  }
}));

/**
 * Send friend request
 */
router.post('/request', requireAuth, validateBody(SendFriendRequestSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { username } = req.body;
    const userId = req.user.id;

    // Find the user to befriend
    const targetUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.id === userId) {
      return res.status(400).json({ error: 'Cannot send friend request to yourself' });
    }

    // Check if friendship already exists
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: targetUser.id },
          { requesterId: targetUser.id, receiverId: userId }
        ]
      }
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') {
        return res.status(400).json({ error: 'Already friends' });
      } else if (existingFriendship.status === 'PENDING') {
        return res.status(400).json({ error: 'Friend request already sent' });
      } else if (existingFriendship.status === 'BLOCKED') {
        return res.status(400).json({ error: 'Cannot send friend request' });
      }
    }

    // Create friend request
    const friendship = await prisma.friendship.create({
      data: {
        requesterId: userId,
        receiverId: targetUser.id,
        status: 'PENDING'
      },
      include: {
        receiver: {
          select: { id: true, username: true, elo: true, gamesPlayed: true }
        }
      }
    });

    // Send real-time notification
    sendFriendRequestNotification(targetUser.id, {
      id: friendship.id,
      from: {
        id: userId,
        username: req.user.username
      },
      sentAt: friendship.createdAt.toISOString()
    });

    res.status(201).json({
      id: friendship.id,
      user: friendship.receiver,
      sentAt: friendship.createdAt
    });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
}));

/**
 * Accept friend request
 */
router.post('/accept', requireAuth, validateBody(FriendActionSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { friendshipId } = req.body;
    const userId = req.user.id;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
      include: {
        requester: {
          select: { id: true, username: true, elo: true, gamesPlayed: true }
        }
      }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to accept this request' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Friend request is not pending' });
    }

    // Accept the friendship
    const updatedFriendship = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: 'ACCEPTED' },
      include: {
        requester: {
          select: { id: true, username: true, elo: true, gamesPlayed: true }
        }
      }
    });

    // Send real-time notification to the original requester
    sendFriendRequestAcceptedNotification(updatedFriendship.requesterId, {
      id: updatedFriendship.id,
      friend: {
        id: userId,
        username: req.user.username
      },
      since: updatedFriendship.updatedAt.toISOString()
    });

    res.json({
      id: updatedFriendship.id,
      user: updatedFriendship.requester,
      since: updatedFriendship.updatedAt
    });
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
}));

/**
 * Decline friend request
 */
router.post('/decline', requireAuth, validateBody(FriendActionSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { friendshipId } = req.body;
    const userId = req.user.id;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friend request not found' });
    }

    if (friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to decline this request' });
    }

    if (friendship.status !== 'PENDING') {
      return res.status(400).json({ error: 'Friend request is not pending' });
    }

    // Delete the friendship request
    await prisma.friendship.delete({
      where: { id: friendshipId }
    });

    res.json({ message: 'Friend request declined' });
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
}));

/**
 * Remove friend
 */
router.delete('/:friendshipId', requireAuth, createAuthenticatedHandler(async (req, res) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user.id;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Friendship not found' });
    }

    if (friendship.requesterId !== userId && friendship.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to remove this friendship' });
    }

    if (friendship.status !== 'ACCEPTED') {
      return res.status(400).json({ error: 'Not currently friends' });
    }

    // Delete the friendship
    await prisma.friendship.delete({
      where: { id: friendshipId }
    });

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
}));

export default router;