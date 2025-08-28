import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/utils/database';
import { generateAccessToken } from '../utils/test-jwt';

describe('Friend Request Management Tests', () => {
  const API_BASE_URL = process.env.NEXTJS_URL || 'http://localhost:3003';
  
  let testUser1: any;
  let testUser2: any;
  let testUser3: any;
  let user1Token: string;
  let user2Token: string;
  let user3Token: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requester: { username: { startsWith: 'friendreq_' } } },
          { receiver: { username: { startsWith: 'friendreq_' } } }
        ]
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'friendreq_' } }
    });

    // Create test users
    testUser1 = await prisma.user.create({
      data: {
        username: 'friendreq_user1',
        email: 'friendreq1@test.com',
        password: 'hashedpassword1',
        elo: 1200,
        gamesPlayed: 5
      }
    });

    testUser2 = await prisma.user.create({
      data: {
        username: 'friendreq_user2',
        email: 'friendreq2@test.com',
        password: 'hashedpassword2',
        elo: 1350,
        gamesPlayed: 8
      }
    });

    testUser3 = await prisma.user.create({
      data: {
        username: 'friendreq_user3',
        email: 'friendreq3@test.com',
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
    // Clean up friendships between tests
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: { in: [testUser1.id, testUser2.id, testUser3.id] } },
          { receiverId: { in: [testUser1.id, testUser2.id, testUser3.id] } }
        ]
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'friendreq_' } }
    });
  });

  describe('POST /api/friends/request - Send Friend Request', () => {
    it('should send friend request successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receiverUsername: 'friendreq_user2'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Friend request sent successfully');
      expect(data.request.user.username).toBe('friendreq_user2');

      // Verify in database
      const friendship = await prisma.friendship.findFirst({
        where: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'PENDING'
        }
      });
      expect(friendship).toBeTruthy();
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receiverUsername: 'friendreq_user2'
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should validate receiver username', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Receiver username is required');
    });
  });

  describe('POST /api/friends/accept - Accept Friend Request', () => {
    let pendingFriendship: any;

    beforeEach(async () => {
      // Create a pending friend request for testing
      pendingFriendship = await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'PENDING'
        }
      });
    });

    it('should accept friend request successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Friend request accepted successfully');
      expect(data.friendship.user.username).toBe('friendreq_user1');

      // Verify in database
      const friendship = await prisma.friendship.findUnique({
        where: { id: pendingFriendship.id }
      });
      expect(friendship?.status).toBe('ACCEPTED');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should validate request ID', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Request ID is required');
    });

    it('should return error for non-existent request', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: 'non-existent-id'
        })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Friend request not found');
    });

    it('should prevent accepting own friend request', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`, // Wrong user (sender trying to accept)
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('You cannot accept this friend request');
    });

    it('should prevent accepting already accepted request', async () => {
      // First accept the request
      await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      // Try to accept again
      const response = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Friend request is not pending');
    });
  });

  describe('POST /api/friends/decline - Decline Friend Request', () => {
    let pendingFriendship: any;

    beforeEach(async () => {
      // Create a pending friend request for testing
      pendingFriendship = await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'PENDING'
        }
      });
    });

    it('should decline friend request successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Friend request declined successfully');

      // Verify in database that request is marked as declined
      const friendship = await prisma.friendship.findUnique({
        where: { id: pendingFriendship.id }
      });
      expect(friendship?.status).toBe('DECLINED');
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should validate request ID', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Request ID is required');
    });

    it('should prevent declining by non-receiver', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user3Token}`, // Different user
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: pendingFriendship.id
        })
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('You cannot decline this friend request');
    });
  });

  describe('Friend Request Workflow Integration', () => {
    it('should complete full friend request workflow', async () => {
      // Step 1: User1 sends friend request to User2
      const sendResponse = await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receiverUsername: 'friendreq_user2'
        })
      });

      expect(sendResponse.status).toBe(200);

      // Step 2: User2 checks received requests
      const friendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      expect(friendsResponse.status).toBe(200);
      const friendsData = await friendsResponse.json();
      expect(friendsData.receivedRequests).toHaveLength(1);
      
      const requestId = friendsData.receivedRequests[0].id;

      // Step 3: User2 accepts the request
      const acceptResponse = await fetch(`${API_BASE_URL}/api/friends/accept`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: requestId
        })
      });

      expect(acceptResponse.status).toBe(200);

      // Step 4: Both users should now see each other as friends
      const user1FriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      const user2FriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      const user1FriendsData = await user1FriendsResponse.json();
      const user2FriendsData = await user2FriendsResponse.json();

      expect(user1FriendsData.friends).toHaveLength(1);
      expect(user2FriendsData.friends).toHaveLength(1);
      expect(user1FriendsData.friends[0].user.username).toBe('friendreq_user2');
      expect(user2FriendsData.friends[0].user.username).toBe('friendreq_user1');
    });

    it('should handle friend request decline workflow', async () => {
      // Step 1: User1 sends friend request to User2
      await fetch(`${API_BASE_URL}/api/friends/request`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          receiverUsername: 'friendreq_user2'
        })
      });

      // Step 2: User2 gets the request ID
      const friendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      const friendsData = await friendsResponse.json();
      const requestId = friendsData.receivedRequests[0].id;

      // Step 3: User2 declines the request
      const declineResponse = await fetch(`${API_BASE_URL}/api/friends/decline`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user2Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: requestId
        })
      });

      expect(declineResponse.status).toBe(200);

      // Step 4: Both users should have empty friend lists and requests
      const user1FriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      const user2FriendsResponse = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user2Token}`
        }
      });

      const user1FriendsData = await user1FriendsResponse.json();
      const user2FriendsData = await user2FriendsResponse.json();

      expect(user1FriendsData.friends).toHaveLength(0);
      expect(user2FriendsData.friends).toHaveLength(0);
      expect(user1FriendsData.sentRequests).toHaveLength(0); // Declined requests are filtered out
      expect(user2FriendsData.receivedRequests).toHaveLength(0); // Declined requests are filtered out
    });
  });
});