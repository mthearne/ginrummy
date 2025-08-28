import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';
import bcrypt from 'bcryptjs';

// Test database instance - uses Supabase from environment
export const testDb = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Test user credentials
export const TEST_USERS = {
  user1: {
    email: 'test1@example.com',
    username: 'testuser1',
    password: 'password123',
    hashedPassword: '', // Will be set during setup
  },
  user2: {
    email: 'test2@example.com',
    username: 'testuser2', 
    password: 'password123',
    hashedPassword: '', // Will be set during setup
  },
  admin: {
    email: 'admin@example.com',
    username: 'admin',
    password: 'admin123',
    hashedPassword: '', // Will be set during setup
  },
};

// Helper to generate test user data
export function generateTestUser(overrides: Partial<typeof TEST_USERS.user1> = {}) {
  return {
    email: faker.internet.email(),
    username: faker.internet.userName(),
    password: 'testpass123',
    ...overrides,
  };
}

// Database cleanup and setup
export async function setupTestDatabase() {
  try {
    await testDb.$connect();
    console.log('Connected to test database');

    // Hash passwords for test users
    for (const user of Object.values(TEST_USERS)) {
      user.hashedPassword = await bcrypt.hash(user.password, 10);
    }
  } catch (error) {
    console.error('Failed to connect to test database:', error);
    throw error;
  }
}

export async function cleanupTestDatabase() {
  try {
    // Clean up test data in correct order (respect foreign keys)
    await testDb.gameEvent.deleteMany({});
    await testDb.eloHistory.deleteMany({});
    await testDb.gameInvitation.deleteMany({});
    await testDb.friendship.deleteMany({});
    await testDb.notification.deleteMany({});
    await testDb.refreshToken.deleteMany({});
    await testDb.game.deleteMany({});
    await testDb.user.deleteMany({});
    
    console.log('Test database cleaned');
  } catch (error) {
    console.warn('Failed to clean test database:', error);
  }
}

export async function teardownTestDatabase() {
  try {
    await cleanupTestDatabase();
    await testDb.$disconnect();
    console.log('Disconnected from test database');
  } catch (error) {
    console.error('Failed to disconnect from test database:', error);
  }
}

// Seed test data
export async function seedTestUsers() {
  const users = [];
  
  for (const [key, userData] of Object.entries(TEST_USERS)) {
    const user = await testDb.user.create({
      data: {
        email: userData.email,
        username: userData.username,
        password: userData.hashedPassword,
        elo: key === 'admin' ? 1500 : 1200,
      },
    });
    users.push(user);
  }
  
  return users;
}

// Create test game
export async function createTestGame(
  player1Id: string,
  player2Id?: string,
  options: {
    vsAI?: boolean;
    isPrivate?: boolean;
    status?: 'WAITING' | 'ACTIVE' | 'FINISHED';
  } = {}
) {
  return await testDb.game.create({
    data: {
      player1Id,
      player2Id: player2Id || (options.vsAI ? 'ai-player' : null),
      vsAI: options.vsAI || false,
      isPrivate: options.isPrivate || false,
      status: options.status || 'WAITING',
    },
  });
}

// JWT test helpers
export function extractTokenFromResponse(response: any): string | null {
  if (response.body && response.body.accessToken) {
    return response.body.accessToken;
  }
  
  if (response.body && response.body.token) {
    return response.body.token;
  }
  
  return null;
}

// Test hooks for vitest
beforeAll(async () => {
  await setupTestDatabase();
});

afterAll(async () => {
  await teardownTestDatabase();
});

beforeEach(async () => {
  await cleanupTestDatabase();
});

// Global test utilities
export const testUtils = {
  db: testDb,
  users: TEST_USERS,
  generateUser: generateTestUser,
  seedUsers: seedTestUsers,
  createGame: createTestGame,
  extractToken: extractTokenFromResponse,
};