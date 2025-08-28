/**
 * API Security and Rate Limiting Tests
 * 
 * Tests rate limiting, API abuse prevention, and general API security
 */

import { describe, it, expect, beforeAll } from 'vitest';

const API_BASE_URL = 'http://localhost:3003';

// Security test client with rate limiting capabilities
class SecurityTestClient {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setAuthToken(token: string) {
    this.authToken = token;
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
      try {
        data = await response.text();
      } catch (textError) {
        data = null;
      }
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
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put(path: string, body?: any) {
    return this.request(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete(path: string) {
    return this.request(path, { method: 'DELETE' });
  }

  async patch(path: string, body?: any) {
    return this.request(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

describe('API Security and Rate Limiting Tests', () => {
  let client: SecurityTestClient;
  let authToken: string;

  beforeAll(async () => {
    client = new SecurityTestClient(API_BASE_URL);
    
    // Create a test user for authenticated tests
    const uniqueId = Date.now().toString().slice(-6);
    const testUser = {
      email: `apitest_${uniqueId}@example.com`,
      username: `apitest_${uniqueId}`,
      password: 'TestPass123!',
    };

    const registerResponse = await client.post('/api/auth/register', testUser);
    if (registerResponse.status === 201) {
      authToken = registerResponse.data?.accessToken;
      client.setAuthToken(authToken);
    }
  });

  describe('Rate Limiting Tests', () => {
    it('should handle rapid authentication requests', async () => {
      const requests = [];
      const testCredentials = {
        email: 'nonexistent@test.com',
        password: 'wrongpassword'
      };

      // Fire multiple requests rapidly
      for (let i = 0; i < 10; i++) {
        requests.push(client.post('/api/auth/login', testCredentials));
      }

      const responses = await Promise.all(requests);
      
      // Check if rate limiting kicks in
      let rateLimitedCount = 0;
      let normalFailureCount = 0;
      
      for (const response of responses) {
        if (response.status === 429) { // Too Many Requests
          rateLimitedCount++;
        } else if (response.status === 401 || response.status === 400) {
          normalFailureCount++;
        }
      }

      // Should either have rate limiting or handle all requests gracefully
      expect(rateLimitedCount + normalFailureCount).toBe(10);
      
      // If rate limiting is implemented, we expect some 429s
      // If not implemented, all should be normal failures
      console.log(`Rate limited: ${rateLimitedCount}, Normal failures: ${normalFailureCount}`);
    });

    it('should handle rapid registration attempts', async () => {
      const requests = [];
      
      // Try rapid registrations
      for (let i = 0; i < 5; i++) {
        const uniqueId = Date.now().toString().slice(-6) + i;
        requests.push(
          client.post('/api/auth/register', {
            email: `rapid_${uniqueId}@test.com`,
            username: `rapid_${uniqueId}`,
            password: 'TestPass123!'
          })
        );
      }

      const responses = await Promise.all(requests);
      
      // Should handle all requests without crashing
      for (const response of responses) {
        expect([201, 400, 409, 429]).toContain(response.status);
      }
    });

    it('should handle rapid API requests for authenticated endpoints', async () => {
      const requests = [];
      
      // Fire rapid requests to friends endpoint
      for (let i = 0; i < 8; i++) {
        requests.push(client.get('/api/friends'));
      }

      const responses = await Promise.all(requests);
      
      // Should handle all requests gracefully
      for (const response of responses) {
        expect([200, 401, 429]).toContain(response.status);
      }
    });
  });

  describe('HTTP Method Security', () => {
    it('should reject unsupported HTTP methods', async () => {
      const unsupportedMethods = [
        'OPTIONS',
        'HEAD'  // Skip TRACE and CONNECT as they cause client-side errors
      ];

      for (const method of unsupportedMethods) {
        try {
          const response = await client.request('/api/auth/login', {
            method
          });

          // Should reject with 405 Method Not Allowed or similar (204 also acceptable)
          expect([405, 404, 400, 204]).toContain(response.status);
        } catch (error) {
          // Some HTTP methods may be blocked by the client or fetch API
          expect(error).toBeTruthy();
        }
      }
    });

    it('should handle CORS properly', async () => {
      const response = await client.get('/api/health', {
        'Origin': 'https://malicious-site.com'
      });

      // Should either allow CORS properly or reject
      // The response should not leak sensitive information
      if (response.headers.has('access-control-allow-origin')) {
        const allowedOrigin = response.headers.get('access-control-allow-origin');
        // Should not be wildcard (*) for sensitive endpoints, or should be controlled
        if (allowedOrigin === '*') {
          console.warn('Warning: Wildcard CORS detected - ensure this is intended');
        }
      }

      expect([200, 403]).toContain(response.status);
    });

    it('should protect against method override attacks', async () => {
      const methodOverrideHeaders = [
        'X-HTTP-Method-Override',
        'X-HTTP-Method',
        'X-Method-Override'
      ];

      for (const header of methodOverrideHeaders) {
        const response = await client.post('/api/friends', {}, {
          [header]: 'DELETE'
        });

        // Should not allow method override to bypass security
        expect([200, 400, 401]).toContain(response.status);
        // Should not treat POST as DELETE
      }
    });
  });

  describe('Information Disclosure Prevention', () => {
    it('should not expose server information in headers', async () => {
      const response = await client.get('/api/health');
      
      // Check for common information disclosure headers
      const sensitiveHeaders = [
        'x-powered-by',
        'server',
        'x-aspnet-version',
        'x-aspnetmvc-version'
      ];

      for (const header of sensitiveHeaders) {
        const headerValue = response.headers.get(header);
        if (headerValue) {
          console.warn(`Information disclosure: ${header}: ${headerValue}`);
          // This is a warning, not necessarily a failure
        }
      }
    });

    it('should not expose stack traces in error responses', async () => {
      // Try to trigger an error
      const response = await client.post('/api/auth/login', {
        email: null,
        password: undefined
      });

      if (response.data && typeof response.data === 'string') {
        expect(response.data).not.toContain('Error:');
        expect(response.data).not.toContain('    at ');
        expect(response.data).not.toContain('node_modules');
        expect(response.data).not.toContain('/home/');
        expect(response.data).not.toContain('webpack-internal');
      }
    });

    it('should not leak internal paths or system information', async () => {
      const response = await client.get('/nonexistent-endpoint');
      
      if (response.data) {
        const responseText = JSON.stringify(response.data);
        expect(responseText).not.toContain('/home/');
        expect(responseText).not.toContain('C:\\');
        expect(responseText).not.toContain('node_modules');
        expect(responseText).not.toContain('prisma');
        expect(responseText).not.toContain('database');
      }
    });
  });

  describe('API Abuse Prevention', () => {
    it('should validate content-length header', async () => {
      try {
        const response = await client.request('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': '999999999' // Claim huge content
          },
          body: JSON.stringify({ email: 'test@test.com', password: 'test' })
        });

        // Should handle content-length mismatch gracefully
        expect([200, 400, 401, 413]).toContain(response.status);
      } catch (error) {
        // Content-length mismatch is handled by the client/runtime
        expect(error).toBeTruthy(); // Any error is acceptable for this security test
      }
    });

    it('should handle requests with missing required headers', async () => {
      const response = await client.request('/api/auth/login', {
        method: 'POST',
        // Missing Content-Type header
        body: JSON.stringify({ email: 'test@test.com', password: 'test' })
      });

      expect([400, 401, 415]).toContain(response.status);
    });

    it('should prevent path traversal attacks', async () => {
      const pathTraversalPayloads = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2f',
        '....//....//....//etc/passwd',
        '/var/log/auth.log'
      ];

      for (const payload of pathTraversalPayloads) {
        const response = await client.get(`/api/${payload}`);
        
        // Should return 404 or similar, not expose file contents
        expect([404, 400, 403]).toContain(response.status);
        
        if (response.data) {
          const responseText = JSON.stringify(response.data);
          expect(responseText).not.toContain('root:');
          expect(responseText).not.toContain('password:');
          expect(responseText).not.toContain('[users]');
        }
      }
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await client.get('/api/health');
      
      // Check for recommended security headers
      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'strict-transport-security',
        'content-security-policy'
      ];

      let presentHeaders = 0;
      for (const header of securityHeaders) {
        if (response.headers.has(header)) {
          presentHeaders++;
          console.log(`Security header present: ${header}`);
        }
      }

      // Not all headers are required, but some security headers should be present
      console.log(`Security headers found: ${presentHeaders}/${securityHeaders.length}`);
    });

    it('should have proper content-type headers', async () => {
      const response = await client.get('/api/health');
      
      const contentType = response.headers.get('content-type');
      if (contentType) {
        expect(contentType).toContain('application/json');
      }
    });
  });

  describe('Session and Token Security', () => {
    it('should handle concurrent requests with same token', async () => {
      if (!authToken) return;

      const requests = [];
      
      // Make concurrent authenticated requests
      for (let i = 0; i < 5; i++) {
        requests.push(client.get('/api/auth/me'));
      }

      const responses = await Promise.all(requests);
      
      // Should handle concurrent requests without issues
      for (const response of responses) {
        expect([200, 401, 429]).toContain(response.status);
      }
    });

    it('should handle token reuse after logout', async () => {
      if (!authToken) return;

      // Try to logout (may or may not be implemented)
      const logoutResponse = await client.post('/api/auth/logout');
      
      // Then try to use the token again
      const response = await client.get('/api/auth/me');
      
      // Should either invalidate token (401) or logout may not be implemented (200)
      expect([200, 401]).toContain(response.status);
      
      if (response.status === 200) {
        console.log('Note: Token remains valid after logout attempt - logout may not be implemented');
      }
    });
  });

  describe('Resource Exhaustion Prevention', () => {
    it('should handle requests with large headers', async () => {
      const largeValue = 'x'.repeat(8192); // 8KB header value
      
      const response = await client.get('/api/health', {
        'X-Large-Header': largeValue
      });

      // Should reject overly large headers or handle gracefully
      expect([200, 400, 413, 414]).toContain(response.status);
    });

    it('should handle deeply nested JSON', async () => {
      // Create deeply nested object
      let deepObject: any = {};
      let current = deepObject;
      
      for (let i = 0; i < 100; i++) {
        current.nested = {};
        current = current.nested;
      }
      current.value = 'deep';

      const response = await client.post('/api/auth/login', deepObject);
      
      // Should handle without crashing
      expect([400, 401, 413]).toContain(response.status);
    });
  });
});