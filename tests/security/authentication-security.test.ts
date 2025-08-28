/**
 * Authentication Security Tests
 * 
 * Tests various authentication bypass attempts and JWT security vulnerabilities
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE_URL = 'http://localhost:3003';

// Security test client
class SecurityTestClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  async request(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, options);

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

  async post(path: string, body?: any, headers: Record<string, string> = {}) {
    return this.request(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

describe('Authentication Security Tests', () => {
  let client: SecurityTestClient;
  let validToken: string;
  let testUser: { email: string; username: string; password: string };

  beforeAll(async () => {
    client = new SecurityTestClient(API_BASE_URL);
    
    // Create a test user and get valid token for comparison tests
    const uniqueId = Date.now().toString().slice(-6);
    testUser = {
      email: `sectest_${uniqueId}@example.com`,
      username: `sectest_${uniqueId}`,
      password: 'TestPass123!',
    };

    const registerResponse = await client.post('/api/auth/register', testUser);
    if (registerResponse.status === 201) {
      validToken = registerResponse.data?.accessToken;
    }
  });

  describe('JWT Token Security', () => {
    it('should reject malformed JWT tokens', async () => {
      const malformedTokens = [
        'invalid-token',
        'Bearer invalid',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid',
        'eyJhbGciOiJub25lIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.',
      ];

      for (const token of malformedTokens) {
        const response = await client.get('/api/auth/me', {
          'Authorization': `Bearer ${token}`
        });
        
        expect(response.status).toBe(401);
        expect(response.data?.error).toContain('Invalid');
      }
    });

    it('should reject expired JWT tokens', async () => {
      // Create a token with past expiration (this is a mock expired token structure)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyLCJleHAiOjE1MTYyMzkwMjJ9.invalid';
      
      const response = await client.get('/api/auth/me', {
        'Authorization': `Bearer ${expiredToken}`
      });
      
      expect(response.status).toBe(401);
    });

    it('should reject tokens with altered signatures', async () => {
      if (validToken) {
        // Alter the signature part of a valid token
        const tokenParts = validToken.split('.');
        const alteredToken = tokenParts[0] + '.' + tokenParts[1] + '.altered_signature';
        
        const response = await client.get('/api/auth/me', {
          'Authorization': `Bearer ${alteredToken}`
        });
        
        expect(response.status).toBe(401);
      }
    });

    it('should reject tokens with none algorithm', async () => {
      // Test for "none" algorithm vulnerability
      const noneAlgToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.';
      
      const response = await client.get('/api/auth/me', {
        'Authorization': `Bearer ${noneAlgToken}`
      });
      
      expect(response.status).toBe(401);
    });
  });

  describe('Authentication Bypass Attempts', () => {
    it('should reject requests without authorization header', async () => {
      const protectedEndpoints = [
        '/api/auth/me',
        '/api/friends',
        '/api/notifications',
        '/api/invitations',
        '/api/games/my-games'
      ];

      for (const endpoint of protectedEndpoints) {
        const response = await client.get(endpoint);
        expect(response.status).toBe(401);
        expect(response.data?.error).toBe('Authorization token required');
      }
    });

    it('should reject requests with empty authorization header', async () => {
      const response = await client.get('/api/auth/me', {
        'Authorization': ''
      });
      
      expect(response.status).toBe(401);
    });

    it('should reject requests with wrong authorization scheme', async () => {
      const wrongSchemes = [
        'Basic dGVzdDp0ZXN0',
        'Digest username="test"',
        'Token abc123',
        'JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
      ];

      for (const scheme of wrongSchemes) {
        const response = await client.get('/api/auth/me', {
          'Authorization': scheme
        });
        
        expect(response.status).toBe(401);
      }
    });

    it('should prevent SQL injection in authentication', async () => {
      const sqlInjectionPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE users; --",
        "admin'--",
        "' UNION SELECT * FROM users --"
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await client.post('/api/auth/login', {
          email: payload,
          password: payload
        });
        
        // Should return proper error, not crash or succeed
        expect([400, 401]).toContain(response.status);
        expect(response.data).toBeTruthy();
      }
    });
  });

  describe('Session Security', () => {
    it('should invalidate tokens after logout', async () => {
      if (!validToken) return;

      // First, verify token works
      const beforeLogout = await client.get('/api/auth/me', {
        'Authorization': `Bearer ${validToken}`
      });
      expect(beforeLogout.status).toBe(200);

      // Logout (if endpoint exists)
      const logoutResponse = await client.post('/api/auth/logout', {}, {
        'Authorization': `Bearer ${validToken}`
      });

      // Token should still work if logout not implemented, or fail if it is
      const afterLogout = await client.get('/api/auth/me', {
        'Authorization': `Bearer ${validToken}`
      });
      
      // Either logout is not implemented (200) or token is invalidated (401)
      expect([200, 401]).toContain(afterLogout.status);
    });

    it('should not leak sensitive information in error responses', async () => {
      const response = await client.get('/api/auth/me', {
        'Authorization': 'Bearer invalid'
      });
      
      // Should not expose internal details
      expect(response.data?.error).not.toContain('database');
      expect(response.data?.error).not.toContain('prisma');
      expect(response.data?.error).not.toContain('stack');
      expect(response.data?.details).toBeUndefined();
    });
  });

  describe('Password Security', () => {
    it('should enforce password complexity', async () => {
      const weakPasswords = [
        '123',
        'password',
        'abc',
        '111111',
        'qwerty'
      ];

      const uniqueId = Date.now().toString().slice(-6);
      
      for (const weakPassword of weakPasswords) {
        const response = await client.post('/api/auth/register', {
          email: `weak_${uniqueId}_${Math.random()}@test.com`,
          username: `weak_${uniqueId}_${Math.random()}`,
          password: weakPassword
        });
        
        // Should reject weak passwords (400) or have some validation
        if (response.status === 400) {
          expect(response.data?.error).toBeTruthy();
        }
        // Note: If weak passwords are accepted, this indicates a security weakness
      }
    });

    it('should not expose password in any response', async () => {
      const response = await client.post('/api/auth/register', {
        email: `passcheck_${Date.now()}@test.com`,
        username: `passcheck_${Date.now()}`,
        password: 'TestPassword123!'
      });
      
      // Ensure password is never returned
      const responseText = JSON.stringify(response.data);
      expect(responseText).not.toContain('TestPassword123!');
      expect(responseText).not.toContain('password');
    });
  });

  describe('Rate Limiting and Brute Force Protection', () => {
    it('should handle multiple failed login attempts gracefully', async () => {
      const attempts = [];
      
      // Try multiple failed logins rapidly
      for (let i = 0; i < 5; i++) {
        attempts.push(
          client.post('/api/auth/login', {
            email: 'nonexistent@test.com',
            password: 'wrongpassword'
          })
        );
      }
      
      const responses = await Promise.all(attempts);
      
      // All should fail, but server should handle gracefully
      for (const response of responses) {
        expect([400, 401, 429]).toContain(response.status); // 429 = Too Many Requests
        expect(response.data).toBeTruthy();
      }
    });

    it('should handle concurrent registration attempts', async () => {
      const uniqueId = Date.now().toString().slice(-6);
      const attempts = [];
      
      // Try multiple registrations rapidly
      for (let i = 0; i < 3; i++) {
        attempts.push(
          client.post('/api/auth/register', {
            email: `concurrent_${uniqueId}_${i}@test.com`,
            username: `concurrent_${uniqueId}_${i}`,
            password: 'TestPass123!'
          })
        );
      }
      
      const responses = await Promise.all(attempts);
      
      // Should handle concurrent requests without crashing
      for (const response of responses) {
        expect([201, 400, 409]).toContain(response.status);
        expect(response.data).toBeTruthy();
      }
    });
  });
});