import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '../../src/utils/database';

describe('Friends API Tests', () => {
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
          { requester: { username: { startsWith: 'socialtest_' } } },
          { receiver: { username: { startsWith: 'socialtest_' } } }
        ]
      }
    });
    
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'socialtest_' } }
    });

    // Register test users via API to get proper password hashing
    const uniqueId = Date.now().toString().slice(-6);
    
    const user1Data = {
      username: `socialtest_user1_${uniqueId}`,
      email: `socialtest1_${uniqueId}@test.com`,
      password: 'TestPass123!'
    };

    const register1Response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user1Data)
    });
    const register1Data = await register1Response.json();
    testUser1 = register1Data.user;
    user1Token = register1Data.accessToken;

    const user2Data = {
      username: `socialtest_user2_${uniqueId}`,
      email: `socialtest2_${uniqueId}@test.com`,
      password: 'TestPass123!'
    };

    const register2Response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user2Data)
    });
    const register2Data = await register2Response.json();
    testUser2 = register2Data.user;
    user2Token = register2Data.accessToken;

    const user3Data = {
      username: `socialtest_user3_${uniqueId}`,
      email: `socialtest3_${uniqueId}@test.com`,
      password: 'TestPass123!'
    };

    const register3Response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user3Data)
    });
    const register3Data = await register3Response.json();
    testUser3 = register3Data.user;
    user3Token = register3Data.accessToken;
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
      where: { username: { startsWith: 'socialtest_' } }
    });
  });

  describe('GET /api/friends - List Friends and Requests', () => {
    it('should return empty lists for new user', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.friends).toEqual([]);
      expect(data.sentRequests).toEqual([]);
      expect(data.receivedRequests).toEqual([]);
    });

    it('should require authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET'
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should reject invalid token', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer invalid_token'
        }
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Invalid or expired token');
    });

    it('should list accepted friendships correctly', async () => {
      // Create an accepted friendship
      await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'ACCEPTED'
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.friends).toHaveLength(1);
      expect(data.friends[0].user.username).toBe('socialtest_user2');
      expect(data.friends[0].user.elo).toBe(1350);
      expect(data.sentRequests).toEqual([]);
      expect(data.receivedRequests).toEqual([]);
    });

    it('should list sent friend requests', async () => {
      // Create a pending friend request sent by user1
      await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'PENDING'
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.friends).toEqual([]);
      expect(data.sentRequests).toHaveLength(1);
      expect(data.sentRequests[0].user.username).toBe('socialtest_user2');
      expect(data.receivedRequests).toEqual([]);
    });

    it('should list received friend requests', async () => {
      // Create a pending friend request received by user1
      await prisma.friendship.create({
        data: {
          requesterId: testUser2.id,
          receiverId: testUser1.id,
          status: 'PENDING'
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${user1Token}`
        }
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.friends).toEqual([]);
      expect(data.sentRequests).toEqual([]);
      expect(data.receivedRequests).toHaveLength(1);
      expect(data.receivedRequests[0].user.username).toBe('socialtest_user2');
    });
  });

  describe('POST /api/friends - Send Friend Request', () => {
    it('should send friend request successfully', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'socialtest_user2'
        })
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.message).toBe('Friend request sent successfully');
      expect(data.request.user.username).toBe('socialtest_user2');
      expect(data.request.sentAt).toBeDefined();

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
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'socialtest_user2'
        })
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Authorization token required');
    });

    it('should require username field', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Username is required');
    });

    it('should return error for non-existent user', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'nonexistent_user'
        })
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('User not found');
    });

    it('should prevent sending friend request to self', async () => {
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'socialtest_user1'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Cannot send friend request to yourself');
    });

    it('should prevent duplicate friend requests', async () => {
      // Send initial friend request
      await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'socialtest_user2'
        })
      });

      // Try to send another request
      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'socialtest_user2'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Friend request already sent or received');
    });

    it('should prevent request if already friends', async () => {
      // Create accepted friendship
      await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'ACCEPTED'
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user1Token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'socialtest_user2'
        })
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('You are already friends with this user');
    });
  });

  describe('Complex Friend Scenarios', () => {
    it('should handle bidirectional friendship correctly', async () => {
      // Create friendship where user1 requested user2
      await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'ACCEPTED'
        }
      });

      // Both users should see each other as friends
      const user1Response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user1Token}` }
      });

      const user2Response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user2Token}` }
      });

      expect(user1Response.status).toBe(200);
      expect(user2Response.status).toBe(200);

      const user1Data = await user1Response.json();
      const user2Data = await user2Response.json();

      expect(user1Data.friends).toHaveLength(1);
      expect(user1Data.friends[0].user.username).toBe('socialtest_user2');
      
      expect(user2Data.friends).toHaveLength(1);
      expect(user2Data.friends[0].user.username).toBe('socialtest_user1');
    });

    it('should handle multiple friend requests and friends', async () => {
      // User1 sends request to User2
      await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser2.id,
          status: 'PENDING'
        }
      });

      // User1 is friends with User3
      await prisma.friendship.create({
        data: {
          requesterId: testUser1.id,
          receiverId: testUser3.id,
          status: 'ACCEPTED'
        }
      });

      const response = await fetch(`${API_BASE_URL}/api/friends`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${user1Token}` }
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.friends).toHaveLength(1);
      expect(data.friends[0].user.username).toBe('socialtest_user3');
      expect(data.sentRequests).toHaveLength(1);
      expect(data.sentRequests[0].user.username).toBe('socialtest_user2');
      expect(data.receivedRequests).toHaveLength(0);
    });
  });
});