import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/database.js';
import { requireAuth, createAuthenticatedHandler } from '../middleware/auth.js';
import { validateBody, validateParams } from '../middleware/validation.js';
import { sendGameInvitationNotification, sendInvitationResponseNotification } from '../services/notifications.js';

const router = Router();

const SendInvitationSchema = z.object({
  gameId: z.string().uuid(),
  receiverUsername: z.string().min(1).max(50),
  message: z.string().max(200).optional(),
});

const InvitationActionSchema = z.object({
  invitationId: z.string().uuid(),
});

/**
 * Get user's invitations
 */
router.get('/', requireAuth, createAuthenticatedHandler(async (req, res) => {
  try {
    const userId = req.user.id;

    const [sentInvitations, receivedInvitations] = await Promise.all([
      // Get sent invitations
      prisma.gameInvitation.findMany({
        where: {
          senderId: userId,
          status: { in: ['PENDING', 'ACCEPTED', 'DECLINED'] },
          expiresAt: { gt: new Date() }
        },
        include: {
          receiver: {
            select: { id: true, username: true }
          },
          game: {
            select: { id: true, status: true, createdAt: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      
      // Get received invitations
      prisma.gameInvitation.findMany({
        where: {
          receiverId: userId,
          status: 'PENDING',
          expiresAt: { gt: new Date() }
        },
        include: {
          sender: {
            select: { id: true, username: true }
          },
          game: {
            select: { id: true, status: true, createdAt: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    res.json({
      sent: sentInvitations.map(inv => ({
        id: inv.id,
        game: inv.game,
        receiver: inv.receiver,
        message: inv.message,
        status: inv.status,
        sentAt: inv.createdAt,
        expiresAt: inv.expiresAt
      })),
      received: receivedInvitations.map(inv => ({
        id: inv.id,
        game: inv.game,
        sender: inv.sender,
        message: inv.message,
        receivedAt: inv.createdAt,
        expiresAt: inv.expiresAt
      }))
    });
  } catch (error) {
    console.error('Get invitations error:', error);
    res.status(500).json({ error: 'Failed to get invitations' });
  }
}));

/**
 * Send game invitation
 */
router.post('/', requireAuth, validateBody(SendInvitationSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { gameId, receiverUsername, message } = req.body;
    const userId = req.user.id;

    // Verify the game exists and sender is the creator
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        player1: { select: { id: true, username: true } }
      }
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.player1Id !== userId) {
      return res.status(403).json({ error: 'Only the game creator can send invitations' });
    }

    if (game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game is not waiting for players' });
    }

    if (game.vsAI) {
      return res.status(400).json({ error: 'Cannot invite players to AI games' });
    }

    // Find the receiver
    const receiver = await prisma.user.findUnique({
      where: { username: receiverUsername },
      select: { id: true, username: true }
    });

    if (!receiver) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (receiver.id === userId) {
      return res.status(400).json({ error: 'Cannot invite yourself' });
    }

    // Check if they are friends
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, receiverId: receiver.id, status: 'ACCEPTED' },
          { requesterId: receiver.id, receiverId: userId, status: 'ACCEPTED' }
        ]
      }
    });

    if (!friendship) {
      return res.status(400).json({ error: 'Can only invite friends to games' });
    }

    // Check if invitation already exists
    const existingInvitation = await prisma.gameInvitation.findFirst({
      where: {
        gameId,
        receiverId: receiver.id,
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      }
    });

    if (existingInvitation) {
      return res.status(400).json({ error: 'Invitation already sent to this user' });
    }

    // Create invitation (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    const invitation = await prisma.gameInvitation.create({
      data: {
        gameId,
        senderId: userId,
        receiverId: receiver.id,
        message,
        expiresAt
      },
      include: {
        receiver: {
          select: { id: true, username: true }
        },
        game: {
          select: { id: true, status: true, createdAt: true }
        }
      }
    });

    // Send real-time notification
    sendGameInvitationNotification(receiver.id, {
      id: invitation.id,
      from: {
        id: userId,
        username: req.user.username
      },
      gameId: invitation.gameId,
      message: invitation.message || undefined,
      sentAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString()
    });

    res.status(201).json({
      id: invitation.id,
      game: invitation.game,
      receiver: invitation.receiver,
      message: invitation.message,
      status: invitation.status,
      sentAt: invitation.createdAt,
      expiresAt: invitation.expiresAt
    });
  } catch (error) {
    console.error('Send invitation error:', error);
    res.status(500).json({ error: 'Failed to send invitation' });
  }
}));

/**
 * Accept game invitation
 */
router.post('/accept', requireAuth, validateBody(InvitationActionSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { invitationId } = req.body;
    const userId = req.user.id;

    const invitation = await prisma.gameInvitation.findUnique({
      where: { id: invitationId },
      include: {
        game: true,
        sender: {
          select: { id: true, username: true }
        }
      }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to accept this invitation' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invitation is not pending' });
    }

    if (invitation.expiresAt < new Date()) {
      // Mark as expired
      await prisma.gameInvitation.update({
        where: { id: invitationId },
        data: { status: 'EXPIRED' }
      });
      return res.status(400).json({ error: 'Invitation has expired' });
    }

    if (invitation.game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game is no longer waiting for players' });
    }

    if (invitation.game.player2Id) {
      return res.status(400).json({ error: 'Game is already full' });
    }

    // Accept the invitation and join the game
    await prisma.$transaction(async (tx) => {
      // Update invitation status
      await tx.gameInvitation.update({
        where: { id: invitationId },
        data: { status: 'ACCEPTED' }
      });

      // Add player to game
      await tx.game.update({
        where: { id: invitation.gameId },
        data: {
          player2Id: userId,
          status: 'ACTIVE'
        }
      });

      // Expire other pending invitations for this game
      await tx.gameInvitation.updateMany({
        where: {
          gameId: invitation.gameId,
          status: 'PENDING',
          id: { not: invitationId }
        },
        data: { status: 'EXPIRED' }
      });
    });

    // Send real-time notification to the invitation sender
    sendInvitationResponseNotification(invitation.senderId, {
      invitationId: invitationId,
      gameId: invitation.gameId,
      from: {
        id: userId,
        username: req.user.username
      },
      response: 'accepted'
    });

    res.json({
      gameId: invitation.gameId,
      message: 'Invitation accepted successfully'
    });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
}));

/**
 * Decline game invitation
 */
router.post('/decline', requireAuth, validateBody(InvitationActionSchema), createAuthenticatedHandler(async (req, res) => {
  try {
    const { invitationId } = req.body;
    const userId = req.user.id;

    const invitation = await prisma.gameInvitation.findUnique({
      where: { id: invitationId }
    });

    if (!invitation) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    if (invitation.receiverId !== userId) {
      return res.status(403).json({ error: 'Not authorized to decline this invitation' });
    }

    if (invitation.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invitation is not pending' });
    }

    // Decline the invitation
    const declinedInvitation = await prisma.gameInvitation.update({
      where: { id: invitationId },
      data: { status: 'DECLINED' },
      include: {
        sender: {
          select: { id: true, username: true }
        }
      }
    });

    // Send real-time notification to the invitation sender
    sendInvitationResponseNotification(declinedInvitation.senderId, {
      invitationId: invitationId,
      gameId: declinedInvitation.gameId,
      from: {
        id: userId,
        username: req.user.username
      },
      response: 'declined'
    });

    res.json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('Decline invitation error:', error);
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
}));

export default router;