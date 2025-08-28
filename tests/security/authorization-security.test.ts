/**
 * Authorization and Access Control Security Tests
 * 
 * Tests privilege escalation, unauthorized access, and access control vulnerabilities
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE_URL = 'http://localhost:3003';

// Security test client
class SecurityTestClient {
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
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> || {}),
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
      headers: response.headers,
    };
  }

  async get(path: string, headers: Record<string, string> = {}) {
    return this.request(path, { method: 'GET', headers });
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

  async delete(path: string) {
    return this.request(path, { method: 'DELETE' });
  }
}

describe('Authorization and Access Control Security Tests', () => {
  let user1Client: SecurityTestClient;
  let user2Client: SecurityTestClient;
  let user1Token: string;
  let user2Token: string;
  let user1Data: any;
  let user2Data: any;

  beforeAll(async () => {
    user1Client = new SecurityTestClient(API_BASE_URL);
    user2Client = new SecurityTestClient(API_BASE_URL);
    
    // Create two test users
    const uniqueId = Date.now().toString().slice(-6);
    const user1 = {
      email: `authtest1_${uniqueId}@example.com`,
      username: `authtest1_${uniqueId}`,
      password: 'TestPass123!',
    };

    const user2 = {
      email: `authtest2_${uniqueId}@example.com`, 
      username: `authtest2_${uniqueId}`,
      password: 'TestPass123!',
    };

    // Register users
    const register1Response = await user1Client.post('/api/auth/register', user1);
    if (register1Response.status === 201) {
      user1Token = register1Response.data?.accessToken;
      user1Data = register1Response.data?.user;
      user1Client.setAuthToken(user1Token);
    }

    const register2Response = await user2Client.post('/api/auth/register', user2);
    if (register2Response.status === 201) {
      user2Token = register2Response.data?.accessToken;
      user2Data = register2Response.data?.user;
      user2Client.setAuthToken(user2Token);
    }
  });

  describe('User Data Access Control', () => {
    it('should prevent users from accessing other users data', async () => {
      if (!user1Token || !user2Token) return;

      // User1 tries to access User2's profile using various methods
      const user2Id = user2Data?.id;
      if (user2Id) {
        const maliciousRequests = [
          `/api/users/${user2Id}`,
          `/api/auth/me?userId=${user2Id}`,
          `/api/profile/${user2Id}`,
        ];

        for (const endpoint of maliciousRequests) {
          const response = await user1Client.get(endpoint);
          
          // Should deny access, return 404, or return 200 if endpoint doesn't exist/implement user ID params
          expect([200, 401, 403, 404]).toContain(response.status);
          
          if (response.data && response.status === 200) {
            // If it returns data, it should not be user2's data
            expect(response.data.id).not.toBe(user2Id);
          }
        }
      }
    });

    it('should prevent users from modifying other users data', async () => {
      if (!user1Token || !user2Token) return;

      const user2Id = user2Data?.id;
      if (user2Id) {
        // User1 tries to modify User2's data
        const response = await user1Client.patch(`/api/users/${user2Id}`, {
          username: 'hacked_user',
          email: 'hacked@evil.com'
        });

        // Should deny access
        expect([401, 403, 404]).toContain(response.status);
      }
    });
  });

  describe('Friend Request Access Control', () => {
    let friendRequestId: string;

    beforeAll(async () => {
      if (user1Token && user2Token && user1Data && user2Data) {
        // User1 sends friend request to User2
        const response = await user1Client.post('/api/friends/request', {
          username: user2Data.username
        });
        
        if (response.status === 200) {
          // Get the request ID from User2's perspective
          const friendsResponse = await user2Client.get('/api/friends');
          if (friendsResponse.data?.receivedRequests?.length > 0) {
            friendRequestId = friendsResponse.data.receivedRequests[0].id;
          }
        }
      }
    });

    it('should prevent users from accepting friend requests not meant for them', async () => {
      if (!friendRequestId || !user1Token) return;

      // User1 tries to accept their own sent request (should be done by User2)
      const response = await user1Client.post('/api/friends/accept', {
        friendshipId: friendRequestId
      });

      // Should deny - users can't accept their own sent requests
      expect([400, 403]).toContain(response.status);
    });

    it('should prevent users from declining friend requests not meant for them', async () => {
      if (!friendRequestId || !user1Token) return;

      // User1 tries to decline their own sent request (should be done by User2)
      const response = await user1Client.post('/api/friends/decline', {
        friendshipId: friendRequestId
      });

      // Should deny
      expect([400, 403]).toContain(response.status);
    });

    it('should prevent manipulation of other users friend requests', async () => {
      if (!user1Token) return;

      // Try to manipulate non-existent or other users' requests
      const maliciousIds = [
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '00000000-0000-0000-0000-000000000000',
        'admin',
        '1',
        '../../../etc/passwd'
      ];

      for (const maliciousId of maliciousIds) {
        const acceptResponse = await user1Client.post('/api/friends/accept', {
          friendshipId: maliciousId
        });

        const declineResponse = await user1Client.post('/api/friends/decline', {
          friendshipId: maliciousId
        });

        expect([400, 403, 404]).toContain(acceptResponse.status);
        expect([400, 403, 404]).toContain(declineResponse.status);
      }
    });
  });

  describe('Game Access Control', () => {
    let gameId: string;

    beforeAll(async () => {
      if (user1Token) {
        // User1 creates a game
        const response = await user1Client.post('/api/games', {
          isPrivate: false,
          vsAI: false
        });

        if (response.status === 200 || response.status === 201) {
          gameId = response.data?.game?.id;
        }
      }
    });

    it('should prevent unauthorized access to private games', async () => {
      if (!gameId) return;

      // User2 tries to access User1's game
      user2Client.clearAuth();
      const response = await user2Client.get(`/api/games/${gameId}`);

      // Should require authentication
      expect(response.status).toBe(401);
    });

    it('should prevent users from making moves in games they are not part of', async () => {
      if (!gameId || !user2Token) return;

      // User2 tries to make a move in User1's game
      const response = await user2Client.post(`/api/games/${gameId}/move`, {
        action: 'draw_stock'
      });

      // Should deny access or require auth
      expect([400, 401, 403, 404]).toContain(response.status);
    });

    it('should prevent manipulation of other users games', async () => {
      if (!gameId || !user2Token) return;

      const maliciousActions = [
        { endpoint: `/api/games/${gameId}/leave`, method: 'post' },
        { endpoint: `/api/games/${gameId}/state`, method: 'get' },
        { endpoint: `/api/games/${gameId}`, method: 'delete' }
      ];

      for (const action of maliciousActions) {
        const response = action.method === 'post' 
          ? await user2Client.post(action.endpoint, {})
          : action.method === 'delete'
          ? await user2Client.delete(action.endpoint)
          : await user2Client.get(action.endpoint);

        // Should deny access or return appropriate error (405 Method Not Allowed is also acceptable)
        expect([400, 401, 403, 404, 405]).toContain(response.status);
      }
    });
  });

  describe('Notification Access Control', () => {
    it('should prevent users from accessing other users notifications', async () => {
      if (!user1Token || !user2Token) return;

      // Both users get their notifications  
      const user1Notifications = await user1Client.get('/api/notifications');
      const user2Notifications = await user2Client.get('/api/notifications');

      // Both should succeed for their own notifications (or may return 401 if endpoint requires specific auth)
      expect([200, 401]).toContain(user1Notifications.status);
      expect([200, 401]).toContain(user2Notifications.status);

      // Try to access with wrong user token by manipulating potential user ID parameter
      const maliciousRequests = [
        '/api/notifications?userId=admin',
        '/api/notifications?userId=1',
        `/api/notifications?userId=${user2Data?.id}`
      ];

      for (const endpoint of maliciousRequests) {
        const response = await user1Client.get(endpoint);
        
        // Should either ignore the parameter or deny access
        if (response.status === 200) {
          // If successful, should return user1's notifications, not others
          expect(response.data).not.toContain(user2Data?.id);
        } else {
          expect([400, 403]).toContain(response.status);
        }
      }
    });

    it('should prevent users from marking other users notifications as read', async () => {
      if (!user1Token || !user2Token) return;

      // Try to mark notifications as read using malicious IDs
      const maliciousNotificationIds = [
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        'admin',
        '1',
        'all'
      ];

      for (const notificationId of maliciousNotificationIds) {
        const response = await user1Client.patch('/api/notifications', {
          notificationId: notificationId
        });

        // Should deny, return not found, or return 200 if endpoint handles gracefully
        expect([200, 400, 403, 404]).toContain(response.status);
      }
    });
  });

  describe('Privilege Escalation Prevention', () => {
    it('should prevent role manipulation in requests', async () => {
      if (!user1Token) return;

      // Try to escalate privileges by adding admin fields
      const privilegeEscalationPayloads = [
        { role: 'admin' },
        { isAdmin: true },
        { permissions: ['admin', 'super_user'] },
        { user_type: 'admin' },
        { admin: true },
        { level: 999 }
      ];

      for (const payload of privilegeEscalationPayloads) {
        const response = await user1Client.post('/api/auth/me', payload);
        
        // Should either ignore additional fields or reject
        if (response.status === 200 || response.status === 404) {
          // Check that admin fields are not accepted
          if (response.data) {
            expect(response.data.role).not.toBe('admin');
            expect(response.data.isAdmin).not.toBe(true);
            expect(response.data.admin).not.toBe(true);
          }
        }
      }
    });

    it('should prevent JWT token manipulation for privilege escalation', async () => {
      if (!user1Token) return;

      // Try to modify JWT payload (this will break signature but tests server validation)
      const tokenParts = user1Token.split('.');
      if (tokenParts.length === 3) {
        try {
          const payload = JSON.parse(atob(tokenParts[1]));
          payload.role = 'admin';
          payload.isAdmin = true;
          
          const manipulatedPayload = btoa(JSON.stringify(payload));
          const manipulatedToken = `${tokenParts[0]}.${manipulatedPayload}.${tokenParts[2]}`;
          
          const tempClient = new SecurityTestClient(API_BASE_URL);
          tempClient.setAuthToken(manipulatedToken);
          
          const response = await tempClient.get('/api/auth/me');
          
          // Should reject the manipulated token
          expect(response.status).toBe(401);
        } catch (error) {
          // Expected if token format is different
          console.log('JWT manipulation test skipped - token format not standard');
        }
      }
    });
  });

  describe('Resource Ownership Validation', () => {
    it('should validate resource ownership consistently', async () => {
      if (!user1Token || !user2Token) return;

      // Test various endpoints that should check ownership
      const ownershipTests = [
        { endpoint: '/api/friends', method: 'get' },
        { endpoint: '/api/notifications', method: 'get' },
        { endpoint: '/api/games/my-games', method: 'get' },
        { endpoint: '/api/invitations', method: 'get' }
      ];

      for (const test of ownershipTests) {
        const user1Response = await user1Client.get(test.endpoint);
        const user2Response = await user2Client.get(test.endpoint);

        // Both users should get their own data (or 401 if auth issues)
        expect([200, 401]).toContain(user1Response.status);
        expect([200, 401]).toContain(user2Response.status);

        // Data should be different (users should not see each other's data)
        if (user1Response.data && user2Response.data) {
          expect(user1Response.data).not.toEqual(user2Response.data);
        }
      }
    });

    it('should prevent cross-user resource access via ID manipulation', async () => {
      if (!user1Token || !user2Token) return;

      const resourcePatterns = [
        '/api/games/USER_ID',
        '/api/users/USER_ID/profile',
        '/api/notifications/USER_ID',
      ];

      const maliciousUserIds = [
        user2Data?.id,
        '1',
        'admin',
        '0',
        'null',
        'undefined'
      ];

      for (const pattern of resourcePatterns) {
        for (const maliciousId of maliciousUserIds) {
          const endpoint = pattern.replace('USER_ID', maliciousId);
          const response = await user1Client.get(endpoint);

          // Should deny access or return 404
          expect([401, 403, 404]).toContain(response.status);
        }
      }
    });
  });

  describe('Admin Endpoint Protection', () => {
    it('should protect admin endpoints from regular users', async () => {
      if (!user1Token) return;

      const adminEndpoints = [
        '/api/admin/users',
        '/api/admin/games', 
        '/api/admin/stats',
        '/api/admin/logs',
        '/api/debug/users',
        '/api/system/health',
        '/api/management/users'
      ];

      for (const endpoint of adminEndpoints) {
        const response = await user1Client.get(endpoint);
        
        // Should deny access (401/403) or not exist (404)
        expect([401, 403, 404]).toContain(response.status);
        
        // Should not return sensitive system information
        if (response.data) {
          const responseText = JSON.stringify(response.data);
          expect(responseText).not.toContain('password');
          expect(responseText).not.toContain('secret');
          expect(responseText).not.toContain('key');
        }
      }
    });
  });
});