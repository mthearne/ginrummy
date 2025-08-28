/**
 * Comprehensive Social Features Tests
 * 
 * Tests friends, invitations, and notifications using the working auth pattern
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE_URL = 'http://localhost:3003';

// Simple test client (copied from working auth tests)
class TestClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string) {
    this.authToken = token;
  }

  clearAuth() {
    this.authToken = undefined;
  }

  async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    let data;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    return {
      status: response.status,
      ok: response.ok,
      data,
    };
  }

  async get(path: string) {
    return this.request(path, { method: 'GET' });
  }

  async post(path: string, body?: any) {
    return this.request(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch(path: string, body?: any) {
    return this.request(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

describe('Comprehensive Social Features Tests', () => {
  let client1: TestClient;
  let client2: TestClient;
  let testUser1: { email: string; username: string; password: string };
  let testUser2: { email: string; username: string; password: string };
  let user1Token: string;
  let user2Token: string;

  beforeAll(async () => {
    client1 = new TestClient(API_BASE_URL);
    client2 = new TestClient(API_BASE_URL);
    
    // Generate unique test users
    const uniqueId = Date.now().toString().slice(-6);
    testUser1 = {
      email: `social1_${uniqueId}@example.com`,
      username: `social1_${uniqueId}`,
      password: 'TestPass123!',
    };

    testUser2 = {
      email: `social2_${uniqueId}@example.com`, 
      username: `social2_${uniqueId}`,
      password: 'TestPass123!',
    };

    // Wait for server readiness
    await new Promise(resolve => setTimeout(resolve, 500));

    // Register test users
    const register1Response = await client1.post('/api/auth/register', testUser1);
    expect(register1Response.status).toBe(201);
    expect(register1Response.data?.accessToken).toBeDefined();
    user1Token = register1Response.data.accessToken;
    client1.setAuthToken(user1Token);

    const register2Response = await client2.post('/api/auth/register', testUser2);  
    expect(register2Response.status).toBe(201);
    expect(register2Response.data?.accessToken).toBeDefined();
    user2Token = register2Response.data.accessToken;
    client2.setAuthToken(user2Token);
  });

  describe('Friends API - GET /api/friends', () => {
    it('should return empty friends list for new users', async () => {
      const response = await client1.get('/api/friends');
      
      expect(response.status).toBe(200);
      expect(response.data?.friends).toEqual([]);
      expect(response.data?.sentRequests).toEqual([]);
      expect(response.data?.receivedRequests).toEqual([]);
    });

    it('should require authentication', async () => {
      const tempClient = new TestClient(API_BASE_URL);
      const response = await tempClient.get('/api/friends');
      
      expect(response.status).toBe(401);
      expect(response.data?.error).toBe('Authorization token required');
    });
  });

  describe('Friend Requests API - POST /api/friends/request', () => {
    it('should send friend request successfully', async () => {
      const response = await client1.post('/api/friends/request', {
        username: testUser2.username
      });
      
      expect(response.status).toBe(200);
      expect(response.data?.message).toBe('Friend request sent successfully');
      expect(response.data?.request).toBeDefined();
    });

    it('should show sent request in user1 friends list', async () => {
      const response = await client1.get('/api/friends');
      
      expect(response.status).toBe(200);
      expect(response.data?.sentRequests).toHaveLength(1);
      expect(response.data?.sentRequests[0].user.username).toBe(testUser2.username);
    });

    it('should show received request in user2 friends list', async () => {
      const response = await client2.get('/api/friends');
      
      expect(response.status).toBe(200);
      expect(response.data?.receivedRequests).toHaveLength(1);
      expect(response.data?.receivedRequests[0].user.username).toBe(testUser1.username);
    });

    it('should prevent duplicate friend requests', async () => {
      const response = await client1.post('/api/friends/request', {
        username: testUser2.username
      });
      
      expect(response.status).toBe(400);
      expect(response.data?.error).toContain('already sent');
    });
  });

  describe('Friend Request Management', () => {
    let requestId: string;

    beforeAll(async () => {
      // Get the request ID from user2's received requests
      const friendsResponse = await client2.get('/api/friends');
      expect(friendsResponse.data?.receivedRequests).toHaveLength(1);
      requestId = friendsResponse.data.receivedRequests[0].id;
    });

    it('should accept friend request successfully', async () => {
      const response = await client2.post('/api/friends/accept', {
        friendshipId: requestId
      });
      
      expect(response.status).toBe(200);
      expect(response.data?.message).toBe('Friend request accepted successfully');
    });

    it('should show friendship in both users lists', async () => {
      const user1Response = await client1.get('/api/friends');
      const user2Response = await client2.get('/api/friends');
      
      expect(user1Response.data?.friends).toHaveLength(1);
      expect(user1Response.data?.friends[0].user.username).toBe(testUser2.username);
      
      expect(user2Response.data?.friends).toHaveLength(1);  
      expect(user2Response.data?.friends[0].user.username).toBe(testUser1.username);
    });
  });

  describe('Notifications API', () => {
    it('should return notifications list', async () => {
      const response = await client1.get('/api/notifications');
      
      // Should work whether notifications exist or not
      expect([200, 200]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data?.notifications).toBeDefined();
      }
    });

    it('should require authentication', async () => {
      const tempClient = new TestClient(API_BASE_URL);
      const response = await tempClient.get('/api/notifications');
      
      expect(response.status).toBe(401);
      expect(response.data?.error).toBe('Authorization token required');
    });
  });

  describe('Game Invitations API', () => {
    it('should return invitations list', async () => {
      const response = await client1.get('/api/invitations');
      
      // Should work whether invitations exist or not
      expect([200, 200]).toContain(response.status);
      if (response.status === 200) {
        expect(response.data).toBeDefined();
      }
    });

    it('should require authentication', async () => {
      const tempClient = new TestClient(API_BASE_URL);
      const response = await tempClient.get('/api/invitations');
      
      expect(response.status).toBe(401);
      expect(response.data?.error).toBe('Authorization token required');
    });
  });
});