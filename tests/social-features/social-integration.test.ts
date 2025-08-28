import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/utils/database';

describe('Social Features Integration Tests', () => {
  const API_BASE_URL = process.env.NEXTJS_URL || 'http://localhost:3003';
  
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let user1Token: string;
  let user2Token: string;
  let user3Token: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.gameInvitation.deleteMany({
      where: {
        OR: [
          { sender: { username: { startsWith: 'socialint_' } } },
          { receiver: { username: { startsWith: 'socialint_' } } }
        ]
      }
    });

    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requester: { username: { startsWith: 'socialint_' } } },
          { receiver: { username: { startsWith: 'socialint_' } } }
        ]
      }
    });

    await prisma.notification.deleteMany({
      where: {
        user: { username: { startsWith: 'socialint_' } }
      }
    });

    await prisma.game.deleteMany({
      where: {
        OR: [
          { player1: { username: { startsWith: 'socialint_' } } },
          { player2: { username: { startsWith: 'socialint_' } } }
        ]
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'socialint_' } }
    });

    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        username: 'socialint_alice',
        email: 'socialint_alice@test.com',
        password: 'hashedpassword1',
        elo: 1200,
        gamesPlayed: 5
      }
    });

    testUser2 = await prisma.user.create({
      data: {
        username: 'socialint_bob',
        email: 'socialint_bob@test.com',
        password: 'hashedpassword2',
        elo: 1350,
        gamesPlayed: 8
      }
    });

    testUser3 = await prisma.user.create({
      data: {
        username: 'socialint_charlie',
        email: 'socialint_charlie@test.com',
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
    // Clean up between tests
    await prisma.gameInvitation.deleteMany({
      where: {
        OR: [
          { senderId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });

    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });

    await prisma.notification.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id, testUser3.id] }
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
  });

  afterAll(async () => {
    // Final cleanup
    await prisma.gameInvitation.deleteMany({
      where: {
        OR: [
          { senderId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });

    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });

    await prisma.notification.deleteMany({
      where: {
        userId: { in: [testUser1.id, testUser2.id, testUser3.id] }
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
      where: { username: { startsWith: 'socialint_' } }
    });
  });

  describe('Complete Social Feature Workflows', () => {
    it('should complete friend request to game invitation workflow', async () => {
      // Step 1: Alice sends friend request to Bob
      const friendRequestResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'socialint_bob'
        })
      });

      expect(friendRequestResponse.status).toBe(200);

      // Step 2: Bob checks his friend requests
      const bobFriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      const bobFriendsData = await bobFriendsResponse.json();
      expect(bobFriendsData.receivedRequests).toHaveLength(1);
      expect(bobFriendsData.receivedRequests[0].user.username).toBe('socialint_alice');

      // Step 3: Bob accepts the friend request
      const requestId = bobFriendsData.receivedRequests[0].id;
      const acceptResponse = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId })
      });

      expect(acceptResponse.status).toBe(200);

      // Step 4: Alice creates a game
      const gameResponse = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          isAI: false
        })
      });

      expect(gameResponse.status).toBe(201);
      const gameData = await gameResponse.json();
      const gameId = gameData.game.id;

      // Step 5: Alice invites Bob to the game
      const inviteResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId,
          receiverUsername: 'socialint_bob',
          message: 'Let\'s play a game!'
        })
      });

      expect(inviteResponse.status).toBe(200);

      // Step 6: Bob checks his invitations
      const bobInvitationsResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      const bobInvitationsData = await bobInvitationsResponse.json();
      expect(bobInvitationsData.received).toHaveLength(1);
      expect(bobInvitationsData.received[0].sender.username).toBe('socialint_alice');
      expect(bobInvitationsData.received[0].message).toBe('Let\'s play a game!');

      // Step 7: Bob accepts the game invitation
      const invitationId = bobInvitationsData.received[0].id;
      const acceptInviteResponse = await fetch(`${API_BASE_URL}/api/invitations/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invitationId })
      });

      expect(acceptInviteResponse.status).toBe(200);

      // Step 8: Verify game is now active with both players
      const finalGameResponse = await fetch(`${API_BASE_URL}/api/games/${gameId}/state`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user1Token}` }
      });

      expect(finalGameResponse.status).toBe(200);
      const finalGameData = await finalGameResponse.json();
      expect(finalGameData.game.status).toBe('ACTIVE');
      expect(finalGameData.game.player1Id).toBe(testUser1.id);
      expect(finalGameData.game.player2Id).toBe(testUser2.id);
    });

    it('should handle friend request decline and alternative invitation', async () => {
      // Step 1: Alice sends friend request to Bob
      await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'socialint_bob' })
      });

      // Step 2: Bob declines the friend request
      const bobFriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      const bobFriendsData = await bobFriendsResponse.json();
      const requestId = bobFriendsData.receivedRequests[0].id;

      const declineResponse = await fetch(`${API_BASE_URL}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId })
      });

      expect(declineResponse.status).toBe(200);

      // Step 3: Alice becomes friends with Charlie instead
      await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'socialint_charlie' })
      });

      const charlieFriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user3Token}` }
      });

      const charlieFriendsData = await charlieFriendsResponse.json();
      const charlieRequestId = charlieFriendsData.receivedRequests[0].id;

      await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user3Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId: charlieRequestId })
      });

      // Step 4: Verify Alice and Charlie are friends, but Alice and Bob are not
      const aliceFriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user1Token}` }
      });

      const aliceFriendsData = await aliceFriendsResponse.json();
      expect(aliceFriendsData.friends).toHaveLength(1);
      expect(aliceFriendsData.friends[0].user.username).toBe('socialint_charlie');

      const finalBobFriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      const finalBobFriendsData = await finalBobFriendsResponse.json();
      expect(finalBobFriendsData.friends).toHaveLength(0);
      expect(finalBobFriendsData.receivedRequests).toHaveLength(0);
    });

    it('should handle invitation expiration and cancellation', async () => {
      // Step 1: Alice creates a game
      const gameResponse = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isAI: false })
      });

      const gameData = await gameResponse.json();
      const gameId = gameData.game.id;

      // Step 2: Alice invites Bob
      const inviteResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId,
          receiverUsername: 'socialint_bob',
          message: 'Quick game?'
        })
      });

      expect(inviteResponse.status).toBe(200);

      // Step 3: Alice checks her sent invitations
      const aliceInvitationsResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user1Token}` }
      });

      const aliceInvitationsData = await aliceInvitationsResponse.json();
      expect(aliceInvitationsData.sent).toHaveLength(1);
      expect(aliceInvitationsData.sent[0].status).toBe('PENDING');

      const invitationId = aliceInvitationsData.sent[0].id;

      // Step 4: Alice cancels the invitation
      const cancelResponse = await fetch(`${API_BASE_URL}/api/invitations/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invitationId })
      });

      expect(cancelResponse.status).toBe(200);

      // Step 5: Bob should not see the cancelled invitation
      const bobInvitationsResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      const bobInvitationsData = await bobInvitationsResponse.json();
      expect(bobInvitationsData.received).toHaveLength(0);

      // Step 6: Alice can send a new invitation
      const newInviteResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId,
          receiverUsername: 'socialint_bob',
          message: 'New invitation!'
        })
      });

      expect(newInviteResponse.status).toBe(200);
    });

    it('should handle notifications throughout social workflows', async () => {
      // Step 1: Alice sends friend request to Bob (should create notification)
      await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'socialint_bob' })
      });

      // Step 2: Bob should have a friend request notification
      let bobNotificationsResponse = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      let bobNotificationsData = await bobNotificationsResponse.json();
      expect(bobNotificationsData.notifications.length).toBeGreaterThan(0);
      
      // Find friend request notification
      const friendNotification = bobNotificationsData.notifications.find(
        n => n.type === 'FRIEND_REQUEST'
      );
      expect(friendNotification).toBeTruthy();

      // Step 3: Bob accepts friend request
      const bobFriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      const bobFriendsData = await bobFriendsResponse.json();
      const requestId = bobFriendsData.receivedRequests[0].id;

      await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requestId })
      });

      // Step 4: Create game and send invitation (should create game invitation notification)
      const gameResponse = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isAI: false })
      });

      const gameData = await gameResponse.json();
      const gameId = gameData.game.id;

      await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId,
          receiverUsername: 'socialint_bob',
          message: 'Game time!'
        })
      });

      // Step 5: Bob should now have a game invitation notification
      bobNotificationsResponse = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      bobNotificationsData = await bobNotificationsResponse.json();
      
      const gameNotification = bobNotificationsData.notifications.find(
        n => n.type === 'GAME_INVITATION'
      );
      expect(gameNotification).toBeTruthy();
      expect(gameNotification.message).toContain('socialint_alice');

      // Step 6: Bob marks friend request notification as read
      if (friendNotification) {
        const markReadResponse = await fetch(`${API_BASE_URL}/api/notifications`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${user2Token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ notificationId: friendNotification.id })
        });

        expect(markReadResponse.status).toBe(200);
      }

      // Step 7: Verify only unread notifications remain
      bobNotificationsResponse = await fetch(`${API_BASE_URL}/api/notifications`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      bobNotificationsData = await bobNotificationsResponse.json();
      
      // Should only have game invitation notification now (friend request was marked as read)
      expect(bobNotificationsData.notifications.every(n => n.type !== 'FRIEND_REQUEST')).toBe(true);
      expect(bobNotificationsData.notifications.some(n => n.type === 'GAME_INVITATION')).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle multiple friend requests between same users', async () => {
      // Step 1: Alice sends friend request to Bob
      const firstRequest = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'socialint_bob' })
      });

      expect(firstRequest.status).toBe(200);

      // Step 2: Alice tries to send another friend request to Bob
      const secondRequest = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'socialint_bob' })
      });

      expect(secondRequest.status).toBe(400);
      const data = await secondRequest.json();
      expect(data.error).toBe('Friend request already sent or received');

      // Step 3: Bob also cannot send request to Alice
      const reverseRequest = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username: 'socialint_alice' })
      });

      expect(reverseRequest.status).toBe(400);
    });

    it('should handle game invitations with invalid game states', async () => {
      // Step 1: Create a game and make it active
      const gameResponse = await fetch(`${API_BASE_URL}/api/games`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isAI: true }) // AI game will be active immediately
      });

      const gameData = await gameResponse.json();
      const gameId = gameData.game.id;

      // Step 2: Try to invite someone to an active game
      const inviteResponse = await fetch(`${API_BASE_URL}/api/invitations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          gameId,
          receiverUsername: 'socialint_bob'
        })
      });

      expect(inviteResponse.status).toBe(400);
      const data = await inviteResponse.json();
      expect(data.error).toBe('Game is not waiting for players');
    });

    it('should handle concurrent friend request operations', async () => {
      // This test simulates race conditions
      const promises = [
        fetch(`${API_BASE_URL}/api/friends`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user1Token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username: 'socialint_bob' })
        }),
        fetch(`${API_BASE_URL}/api/friends`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user1Token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username: 'socialint_bob' })
        })
      ];

      const results = await Promise.allSettled(promises);
      
      // One should succeed, one should fail
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 200
      ).length;
      
      const failCount = results.filter(r => 
        r.status === 'fulfilled' && r.value.status === 400
      ).length;

      expect(successCount).toBe(1);
      expect(failCount).toBe(1);
    });
  });
});