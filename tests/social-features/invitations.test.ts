import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/utils/database';

describe('Game Invitations API Tests', () => {
  const API_BASE_URL = process.env.NEXTJS_URL || 'http://localhost:3003';
  
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let user1Token: string;
  let user2Token: string;
  let user3Token: string;
  let testGame: any;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.gameInvitation.deleteMany({
      where: {
        OR: [
          { sender: { username: { startsWith: 'invitetest_' } } },
          { receiver: { username: { startsWith: 'invitetest_' } } }
        ]
      }
    });

    await prisma.game.deleteMany({
      where: {
        OR: [
          { player1: { username: { startsWith: 'invitetest_' } } },
          { player2: { username: { startsWith: 'invitetest_' } } }
        ]
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'invitetest_' } }
    });

    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        username: 'invitetest_user1',
        email: 'invitetest1@test.com',
        password: 'hashedpassword1',
        elo: 1200,
        gamesPlayed: 5
      }
    });

    testUser2 = await prisma.user.create({
      data: {
        username: 'invitetest_user2',
        email: 'invitetest2@test.com',
        password: 'hashedpassword2',
        elo: 1350,
        gamesPlayed: 8
      }
    });

    testUser3 = await prisma.user.create({
      data: {
        username: 'invitetest_user3',
        email: 'invitetest3@test.com',
        password: 'hashedpassword3',
        elo: 1100,
        gamesPlayed: 3
      }
    });

    // Generate tokens
    user1Token = generateAccessToken({ userId: testUser1.id, username: testUser1.username });
    user2Token = generateAccessToken({ userId: testUser2.id, username: testUser2.username });
    user3Token = generateAccessToken({ userId: testUser3.id, username: testUser3.username });
  });

  beforeEach(async () => {
    // Clean up invitations and games between tests
    await prisma.gameInvitation.deleteMany({
      where: {
        OR: [
          { senderId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });

    await prisma.game.deleteMany({
      where: {
        OR: [
          { player1Id: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { player2Id: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });

    // Create a test game for invitations
    testGame = await prisma.game.create({
      data: {
        player1Id: testUser1.id,
        status: 'WAITING',
        gameState: JSON.stringify({ phase: 'waiting' })
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.gameInvitation.deleteMany({
      where: {
        OR: [
          { senderId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });

    await prisma.game.deleteMany({
      where: {
        OR: [
          { player1Id: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { player2Id: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'invitetest_' } }
    });
  });

  describe('GET /api/invitations - List Invitations', () => {
    it('should return empty lists for new user', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sent).toEqual([]);
      expect(data.received).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET'
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should list sent invitations', async () => {
      // Create a sent invitation
      const invitation = await prisma.gameInvitation.create({
        data: {
          gameId: testGame.id,
          senderId: testUser1.id,
          receiverId: testUser2.id,
          message: 'Join my game!',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sent).toHaveLength(1);
      expect(data.sent[0].game.id).toBe(testGame.id);
      expect(data.sent[0].receiver.username).toBe('invitetest_user2');
      expect(data.sent[0].message).toBe('Join my game!');
      expect(data.sent[0].status).toBe('PENDING');
      expect(data.received).toEqual([]);
    });

    it('should list received invitations', async () => {
      // Create a received invitation
      const invitation = await prisma.gameInvitation.create({
        data: {
          gameId: testGame.id,
          senderId: testUser1.id,
          receiverId: testUser2.id,
          message: 'Join my game!',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.sent).toEqual([]);
      expect(data.received).toHaveLength(1);
      expect(data.received[0].game.id).toBe(testGame.id);
      expect(data.received[0].sender.username).toBe('invitetest_user1');
      expect(data.received[0].message).toBe('Join my game!');
      expect(data.received[0].status).toBe('PENDING');
    });
  });

  describe('POST /api/invitations - Send Game Invitation', () => {
    it('should send invitation successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user2',
          message: 'Want to play a game?'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Game invitation sent successfully');
      expect(data.invitation.game.id).toBe(testGame.id);
      expect(data.invitation.receiver.username).toBe('invitetest_user2');
      expect(data.invitation.message).toBe('Want to play a game?');
      expect(data.invitation.status).toBe('PENDING');
      expect(data.invitation.expiresAt).toBeDefined();

      // Verify in database
      const invitation = await prisma.gameInvitation.findFirst({
        where: {
          gameId: testGame.id,
          senderId: testUser1.id,
          receiverId: testUser2.id
        }
      });
      expect(invitation).toBeTruthy();
      expect(invitation?.message).toBe('Want to play a game?');
    });

    it('should send invitation without message', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user2'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.invitation.message).toBeNull();
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user2'
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should validate required fields', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id
          // Missing receiverUsername
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Game ID and receiver username are required');
    });

    it('should return error for non-existent user', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'nonexistent_user'
        })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('User not found');
    });

    it('should prevent inviting self', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user1'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Cannot send invitation to yourself');
    });

    it('should return error for non-existent game', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: 'non-existent-game-id',
          receiverUsername: 'invitetest_user2'
        })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Game not found');
    });

    it('should prevent non-players from sending invitations', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`, // User2 is not in the game
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user3'
        })
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('You are not a player in this game');
    });

    it('should prevent duplicate invitations', async () => {
      // Send first invitation
      await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user2'
        })
      });

      // Try to send another invitation to the same user
      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user2'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toMatch(/Invitation already sent to this user/);
    });

    it('should handle active game status', async () => {
      // Update game to ACTIVE status
      await prisma.game.update({
        where: { id: testGame.id },
        data: { status: 'ACTIVE' }
      });

      const response = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user2'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Game is not waiting for players');
    });
  });

  describe('POST /api/invitations/accept - Accept Game Invitation', () => {
    let pendingInvitation: any;

    beforeEach(async () => {
      // Create a pending invitation for testing
      pendingInvitation = await prisma.gameInvitation.create({
        data: {
          gameId: testGame.id,
          senderId: testUser1.id,
          receiverId: testUser2.id,
          message: 'Join my game!',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });
    });

    it('should accept invitation successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Game invitation accepted successfully');
      expect(data.game.id).toBe(testGame.id);

      // Verify invitation status updated
      const invitation = await prisma.gameInvitation.findUnique({
        where: { id: pendingInvitation.id }
      });
      expect(invitation?.status).toBe('ACCEPTED');

      // Verify user was added to game
      const game = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(game?.player2Id).toBe(testUser2.id);
      expect(game?.status).toBe('ACTIVE');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should validate invitation ID', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation ID is required');
    });

    it('should return error for non-existent invitation', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: 'non-existent-id'
        })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Invitation not found');
    });
  });

  describe('POST /api/invitations/decline - Decline Game Invitation', () => {
    let pendingInvitation: any;

    beforeEach(async () => {
      // Create a pending invitation for testing
      pendingInvitation = await prisma.gameInvitation.create({
        data: {
          gameId: testGame.id,
          senderId: testUser1.id,
          receiverId: testUser2.id,
          message: 'Join my game!',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });
    });

    it('should decline invitation successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Game invitation declined successfully');

      // Verify invitation status updated
      const invitation = await prisma.gameInvitation.findUnique({
        where: { id: pendingInvitation.id }
      });
      expect(invitation?.status).toBe('DECLINED');

      // Verify game remains unchanged
      const game = await prisma.game.findUnique({
        where: { id: testGame.id }
      });
      expect(game?.player2Id).toBeNull();
      expect(game?.status).toBe('WAITING');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should validate invitation ID', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation ID is required');
    });
  });

  describe('POST /api/invitations/cancel - Cancel Game Invitation', () => {
    let pendingInvitation: any;

    beforeEach(async () => {
      // Create a pending invitation for testing
      pendingInvitation = await prisma.gameInvitation.create({
        data: {
          gameId: testGame.id,
          senderId: testUser1.id,
          receiverId: testUser2.id,
          message: 'Join my game!',
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        }
      });
    });

    it('should cancel invitation successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Game invitation cancelled successfully');

      // Verify invitation status updated
      const invitation = await prisma.gameInvitation.findUnique({
        where: { id: pendingInvitation.id }
      });
      expect(invitation?.status).toBe('CANCELLED');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should prevent non-sender from cancelling', async () => {
      const response = await fetch(`${API_BASE_URL}/api/invitations/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`, // Receiver, not sender
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: pendingInvitation.id
        })
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('You cannot cancel this invitation');
    });
  });

  describe('Game Invitation Workflow Integration', () => {
    it('should complete full game invitation acceptance workflow', async () => {
      // Step 1: User1 sends game invitation to User2
      const sendResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId: testGame.id,
          receiverUsername: 'invitetest_user2',
          message: "Let's play!"
        })
      });

      expect(sendResponse.status).toBe(200);

      // Step 2: User2 checks received invitations
      const invitationsResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      const invitationsData = await invitationsResponse.json();
      expect(invitationsData.received).toHaveLength(1);
      
      const invitationId = invitationsData.received[0].id;

      // Step 3: User2 accepts the invitation
      const acceptResponse = await fetch(`${API_BASE_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: invitationId
        })
      });

      expect(acceptResponse.status).toBe(200);

      // Step 4: Verify game is now active with both players
      const game = await prisma.game.findUnique({
        where: { id: testGame.id },
        include: {
          player1: true,
          player2: true
        }
      });

      expect(game?.status).toBe('ACTIVE');
      expect(game?.player1Id).toBe(testUser1.id);
      expect(game?.player2Id).toBe(testUser2.id);
    });

    it('should handle expired invitations', async () => {
      // Create an expired invitation
      const expiredInvitation = await prisma.gameInvitation.create({
        data: {
          gameId: testGame.id,
          senderId: testUser1.id,
          receiverId: testUser2.id,
          message: 'Join my game!',
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 60 * 1000) // Expired 1 minute ago
        }
      });

      // Try to accept expired invitation
      const response = await fetch(`${API_BASE_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invitationId: expiredInvitation.id
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invitation has expired');
    });
  });
});