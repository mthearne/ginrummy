import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { testUtils } from './setup';
import { apiTestUtils } from './test-server';
import { POST as loginHandler } from '../../app/api/auth/login/route';
import { POST as registerHandler } from '../../app/api/auth/register/route';
import { GET as meHandler } from '../../app/api/auth/me/route';

describe('Authentication Integration Tests', () => {
  let testUsers: any[];

  beforeAll(async () => {
    apiTestUtils.setupTestEnvironment();
  });

  afterAll(async () => {
    apiTestUtils.cleanupTestEnvironment();
  });

  beforeEach(async () => {
    await testUtils.db.$connect();
    await testUtils.cleanupTestDatabase();
    testUsers = await testUtils.seedTestUsers();
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid email and password', async () => {
      const loginData = {
        email: testUtils.users.user1.email,
        password: testUtils.users.user1.password,
      };

      const result = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: loginData,
        }
      );

      expect(result.status).toBe(200);
      expect(result.data).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({
            email: loginData.email,
            username: testUtils.users.user1.username,
          }),
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        })
      );
      
      // Password should not be included
      expect(result.data.user.password).toBeUndefined();
    });

    it('should reject login with invalid credentials', async () => {
      const loginData = {
        email: testUtils.users.user1.email,
        password: 'wrongpassword',
      };

      const result = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: loginData,
        }
      );

      expect(result.status).toBe(401);
      expect(result.data).toEqual(
        expect.objectContaining({
          error: 'Invalid credentials',
        })
      );
    });

    it('should reject login with non-existent user', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'anypassword',
      };

      const result = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: loginData,
        }
      );

      expect(result.status).toBe(401);
      expect(result.data).toEqual(
        expect.objectContaining({
          error: 'Invalid credentials',
        })
      );
    });

    it('should validate request body schema', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '',
      };

      const result = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: invalidData,
        }
      );

      expect(result.status).toBe(400);
      expect(result.data).toEqual(
        expect.objectContaining({
          error: 'Invalid request data',
          details: expect.any(Array),
        })
      );
    });

    it('should handle missing request body', async () => {
      const result = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          // No body
        }
      );

      expect(result.status).toBe(400);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register new user successfully', async () => {
      const registerData = testUtils.generateUser();

      const result = await apiTestUtils.testRouteHandler(
        registerHandler,
        '/api/auth/register',
        {
          method: 'POST',
          body: registerData,
        }
      );

      expect(result.status).toBe(201);
      expect(result.data).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({
            email: registerData.email,
            username: registerData.username,
            elo: 1200, // Default ELO
          }),
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        })
      );

      // Verify user was created in database
      const createdUser = await testUtils.db.user.findUnique({
        where: { email: registerData.email },
      });
      expect(createdUser).toBeTruthy();
      expect(createdUser?.username).toBe(registerData.username);
    });

    it('should reject registration with existing email', async () => {
      const registerData = testUtils.generateUser({
        email: testUtils.users.user1.email, // Existing email
      });

      const result = await apiTestUtils.testRouteHandler(
        registerHandler,
        '/api/auth/register',
        {
          method: 'POST',
          body: registerData,
        }
      );

      expect(result.status).toBe(400);
      expect(result.data.error).toContain('already exists');
    });

    it('should reject registration with existing username', async () => {
      const registerData = testUtils.generateUser({
        username: testUtils.users.user1.username, // Existing username
      });

      const result = await apiTestUtils.testRouteHandler(
        registerHandler,
        '/api/auth/register',
        {
          method: 'POST',
          body: registerData,
        }
      );

      expect(result.status).toBe(400);
      expect(result.data.error).toContain('already exists');
    });

    it('should validate password requirements', async () => {
      const registerData = testUtils.generateUser({
        password: 'weak', // Doesn't meet requirements
      });

      const result = await apiTestUtils.testRouteHandler(
        registerHandler,
        '/api/auth/register',
        {
          method: 'POST',
          body: registerData,
        }
      );

      expect(result.status).toBe(400);
      expect(result.data).toEqual(
        expect.objectContaining({
          error: 'Invalid request data',
          details: expect.arrayContaining([
            expect.objectContaining({
              path: ['password'],
            }),
          ]),
        })
      );
    });

    it('should validate email format', async () => {
      const registerData = testUtils.generateUser({
        email: 'invalid-email-format',
      });

      const result = await apiTestUtils.testRouteHandler(
        registerHandler,
        '/api/auth/register',
        {
          method: 'POST',
          body: registerData,
        }
      );

      expect(result.status).toBe(400);
      expect(result.data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['email'],
            message: 'Invalid email format',
          }),
        ])
      );
    });

    it('should validate username requirements', async () => {
      const registerData = testUtils.generateUser({
        username: 'a', // Too short
      });

      const result = await apiTestUtils.testRouteHandler(
        registerHandler,
        '/api/auth/register',
        {
          method: 'POST',
          body: registerData,
        }
      );

      expect(result.status).toBe(400);
      expect(result.data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: ['username'],
          }),
        ])
      );
    });
  });

  describe('GET /api/auth/me', () => {
    let authToken: string;

    beforeEach(async () => {
      // Login to get auth token
      const loginResult = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: {
            email: testUtils.users.user1.email,
            password: testUtils.users.user1.password,
          },
        }
      );
      authToken = loginResult.data.accessToken;
    });

    it('should return current user info with valid token', async () => {
      const result = await apiTestUtils.testRouteHandler(
        meHandler,
        '/api/auth/me',
        {
          method: 'GET',
          auth: authToken,
        }
      );

      expect(result.status).toBe(200);
      expect(result.data).toEqual(
        expect.objectContaining({
          user: expect.objectContaining({
            email: testUtils.users.user1.email,
            username: testUtils.users.user1.username,
            elo: expect.any(Number),
          }),
        })
      );
      
      // Should not include password
      expect(result.data.user.password).toBeUndefined();
    });

    it('should reject request without authorization header', async () => {
      const result = await apiTestUtils.testRouteHandler(
        meHandler,
        '/api/auth/me',
        {
          method: 'GET',
          // No auth token
        }
      );

      expect(result.status).toBe(401);
      expect(result.data.error).toContain('authorization');
    });

    it('should reject request with invalid token', async () => {
      const result = await apiTestUtils.testRouteHandler(
        meHandler,
        '/api/auth/me',
        {
          method: 'GET',
          auth: 'invalid-token',
        }
      );

      expect(result.status).toBe(401);
      expect(result.data.error).toContain('Invalid token');
    });

    it('should reject request with malformed authorization header', async () => {
      const result = await apiTestUtils.testRouteHandler(
        meHandler,
        '/api/auth/me',
        {
          method: 'GET',
          headers: {
            'Authorization': 'InvalidFormat token-here',
          },
        }
      );

      expect(result.status).toBe(401);
    });
  });

  describe('Database Integration', () => {
    it('should properly hash passwords on registration', async () => {
      const registerData = testUtils.generateUser();

      await apiTestUtils.testRouteHandler(
        registerHandler,
        '/api/auth/register',
        {
          method: 'POST',
          body: registerData,
        }
      );

      const createdUser = await testUtils.db.user.findUnique({
        where: { email: registerData.email },
      });

      expect(createdUser?.password).toBeTruthy();
      expect(createdUser?.password).not.toBe(registerData.password); // Should be hashed
      expect(createdUser?.password.length).toBeGreaterThan(50); // bcrypt hashes are long
    });

    it('should create refresh token on login', async () => {
      const loginResult = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: {
            email: testUtils.users.user1.email,
            password: testUtils.users.user1.password,
          },
        }
      );

      expect(loginResult.data.refreshToken).toBeTruthy();

      // Check that refresh token was stored in database
      const refreshTokens = await testUtils.db.refreshToken.findMany({
        where: { userId: testUsers[0].id },
      });

      expect(refreshTokens.length).toBeGreaterThan(0);
    });

    it('should handle database connection errors gracefully', async () => {
      // Temporarily disconnect from database to simulate connection error
      await testUtils.db.$disconnect();

      const result = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: {
            email: testUtils.users.user1.email,
            password: testUtils.users.user1.password,
          },
        }
      );

      expect(result.status).toBe(500);
      expect(result.data.error).toContain('failed');

      // Reconnect for cleanup
      await testUtils.db.$connect();
    });
  });

  describe('Security Tests', () => {
    it('should not expose sensitive information in error responses', async () => {
      const result = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: {
            email: 'nonexistent@example.com',
            password: 'anypassword',
          },
        }
      );

      expect(result.data.error).toBe('Invalid credentials');
      expect(result.data.error).not.toContain('user not found');
      expect(result.data.error).not.toContain('email');
      expect(result.data.error).not.toContain('password');
    });

    it('should properly validate JWT token structure', async () => {
      const loginResult = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: {
            email: testUtils.users.user1.email,
            password: testUtils.users.user1.password,
          },
        }
      );

      const { accessToken } = loginResult.data;
      expect(accessToken).toBeTruthy();
      
      // JWT should have 3 parts separated by dots
      const jwtParts = accessToken.split('.');
      expect(jwtParts).toHaveLength(3);
    });

    it('should generate different tokens for different users', async () => {
      const login1 = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: {
            email: testUtils.users.user1.email,
            password: testUtils.users.user1.password,
          },
        }
      );

      const login2 = await apiTestUtils.testRouteHandler(
        loginHandler,
        '/api/auth/login',
        {
          method: 'POST',
          body: {
            email: testUtils.users.user2.email,
            password: testUtils.users.user2.password,
          },
        }
      );

      expect(login1.data.accessToken).not.toBe(login2.data.accessToken);
      expect(login1.data.refreshToken).not.toBe(login2.data.refreshToken);
    });
  });
});