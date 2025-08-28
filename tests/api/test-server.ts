import { NextRequest, NextResponse } from 'next/server';
import { createServer } from 'http';
import { testUtils } from './setup';

/**
 * Test utilities for Next.js API routes
 */

// Mock request helper
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): NextRequest {
  const { method = 'GET', headers = {}, body } = options;
  
  const requestInit: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    requestInit.body = JSON.stringify(body);
  }

  // Create a proper NextRequest instance
  return new NextRequest(new URL(url, 'http://localhost:3000'), requestInit);
}

// Response helper to extract JSON data
export async function extractResponseData(response: NextResponse) {
  const data = await response.json();
  return {
    data,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

// Authentication helpers
export function createAuthHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
  };
}

// Test route handlers
export async function testRouteHandler(
  handler: (req: NextRequest) => Promise<NextResponse>,
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    auth?: string;
  } = {}
) {
  const { auth, ...requestOptions } = options;
  
  if (auth) {
    requestOptions.headers = {
      ...requestOptions.headers,
      ...createAuthHeaders(auth),
    };
  }

  const request = createMockRequest(url, requestOptions);
  const response = await handler(request);
  
  return extractResponseData(response);
}

// Database test helpers
export async function withTestDatabase<T>(fn: () => Promise<T>): Promise<T> {
  await testUtils.db.$connect();
  try {
    return await fn();
  } finally {
    await testUtils.db.$disconnect();
  }
}

// Mock JWT utilities for testing
export function createMockJWT(payload: any): string {
  // In real tests, this would create a proper JWT
  // For now, return a mock token
  return `mock.jwt.${Buffer.from(JSON.stringify(payload)).toString('base64')}`;
}

export function decodeMockJWT(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'mock' || parts[1] !== 'jwt') {
    throw new Error('Invalid mock JWT');
  }
  return JSON.parse(Buffer.from(parts[2], 'base64').toString());
}

// Integration test utilities
export class TestClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  setAuthToken(token: string) {
    this.defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  clearAuth() {
    delete this.defaultHeaders['Authorization'];
  }

  async request(
    path: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: any;
    } = {}
  ) {
    const { method = 'GET', headers = {}, body } = options;
    
    const url = `${this.baseUrl}${path}`;
    const requestHeaders = { ...this.defaultHeaders, ...headers };
    
    const requestOptions: RequestInit = {
      method,
      headers: requestHeaders,
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      requestOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, requestOptions);
    const data = await response.json();
    
    return {
      data,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
    };
  }

  // Convenience methods
  async get(path: string, headers?: Record<string, string>) {
    return this.request(path, { method: 'GET', headers });
  }

  async post(path: string, body?: any, headers?: Record<string, string>) {
    return this.request(path, { method: 'POST', body, headers });
  }

  async put(path: string, body?: any, headers?: Record<string, string>) {
    return this.request(path, { method: 'PUT', body, headers });
  }

  async delete(path: string, headers?: Record<string, string>) {
    return this.request(path, { method: 'DELETE', headers });
  }

  // Auth convenience methods
  async login(email: string, password: string) {
    const response = await this.post('/api/auth/login', { email, password });
    if (response.ok && response.data.accessToken) {
      this.setAuthToken(response.data.accessToken);
    }
    return response;
  }

  async register(email: string, username: string, password: string) {
    const response = await this.post('/api/auth/register', { email, username, password });
    if (response.ok && response.data.accessToken) {
      this.setAuthToken(response.data.accessToken);
    }
    return response;
  }

  async logout() {
    const response = await this.post('/api/auth/logout');
    this.clearAuth();
    return response;
  }

  // Game convenience methods
  async createGame(options: { vsAI?: boolean; isPrivate?: boolean } = {}) {
    return this.post('/api/games', options);
  }

  async joinGame(gameId: string) {
    return this.post(`/api/games/${gameId}/join`);
  }

  async makeMove(gameId: string, move: any) {
    return this.post(`/api/games/${gameId}/move`, move);
  }

  async getGameState(gameId: string) {
    return this.get(`/api/games/${gameId}/state`);
  }

  async getMyGames(filters?: Record<string, string>) {
    const queryParams = filters ? '?' + new URLSearchParams(filters).toString() : '';
    return this.get(`/api/games/my-games${queryParams}`);
  }
}

// Environment setup for tests
export function setupTestEnvironment() {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  // DATABASE_URL must be set in environment - no fallback to local PostgreSQL
  process.env.JWT_SECRET = 'test-secret-key';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
}

// Cleanup test environment
export function cleanupTestEnvironment() {
  // Reset environment variables if needed
  delete process.env.JWT_SECRET;
  delete process.env.JWT_REFRESH_SECRET;
}

// Export test utilities
export const apiTestUtils = {
  createMockRequest,
  extractResponseData,
  createAuthHeaders,
  testRouteHandler,
  withTestDatabase,
  createMockJWT,
  decodeMockJWT,
  TestClient,
  setupTestEnvironment,
  cleanupTestEnvironment,
};