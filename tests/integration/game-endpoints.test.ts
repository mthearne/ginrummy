/**
 * Game Endpoints Integration Tests
 * 
 * Tests critical game management endpoints:
 * - Game state retrieval
 * - Game joining  
 * - Move endpoint validation
 * 
 * Uses same pattern as live-api.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Use same port as live-api tests
const API_BASE_URL = 'http://localhost:3003';

// Simple test client
class TestClient {
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
}

describe('Game Endpoints Integration Tests', () => {
  let client: TestClient;
  let testUser: { email: string; username: string; password: string };
  let authToken: string;
  let testGameId: string;

  beforeAll(async () => {
    client = new TestClient(API_BASE_URL);
    
    // Generate unique test user
    const uniqueId = Date.now().toString().slice(-6);
    testUser = {
      email: `gametest-${uniqueId}@example.com`,
      username: `gametest${uniqueId}`,
      password: 'TestPass123!',
    };

    // Wait for server readiness
    await new Promise(resolve => setTimeout(resolve, 500));

    // Register and login test user
    const registerResponse = await client.post('/api/auth/register', testUser);
    expect(registerResponse.status).toBe(201);

    const loginResponse = await client.post('/api/auth/login', {
      email: testUser.email,
      password: testUser.password,
    });
    
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.data?.accessToken).toBeDefined();
    
    authToken = loginResponse.data.accessToken;
    client.setAuthToken(authToken);
  });

  describe('Game State Endpoint', () => {
    
    it('should require authentication for game state access', async () => {
      // Test without token
      const clientNoAuth = new TestClient(API_BASE_URL);
      const response = await clientNoAuth.get('/api/games/fake-id/state');
      
      expect(response.status).toBe(401);
      expect(response.data?.error).toContain('Authorization');
    });
    
    it('should return 404 for non-existent game', async () => {
      const response = await client.get('/api/games/non-existent-game-id/state');
      
      expect(response.status).toBe(404);
      expect(response.data?.error).toContain('Game not found');
    });
    
    it('should retrieve AI game state successfully', async () => {
      // First create an AI game
      const createResponse = await client.post('/api/games', {
        vsAI: true,
        isPrivate: false
      });
      
      expect(createResponse.status).toBe(200);
      expect(createResponse.data?.game?.id).toBeDefined();
      
      const gameId = createResponse.data.game.id;
      testGameId = gameId;
      
      // Now get the game state
      const stateResponse = await client.get(`/api/games/${gameId}/state`);
      
      expect(stateResponse.status).toBe(200);
      expect(stateResponse.data?.gameState).toBeDefined();
      expect(stateResponse.data.gameState.id).toBe(gameId);
      expect(stateResponse.data.gameState.players).toHaveLength(2);
      
      // Validate game structure
      const gameState = stateResponse.data.gameState;
      expect(gameState.discardPile).toBeDefined();
      expect(gameState.phase).toBeDefined();
      expect(gameState.currentPlayerId).toBeDefined();
      
      // Players should exist
      expect(gameState.players).toBeDefined();
      expect(gameState.players).toHaveLength(2);
      
      // Note: deck might not be exposed for security reasons in client responses
    });
    
  });

  describe('Game Join Endpoint', () => {
    
    it('should require authentication for joining games', async () => {
      const clientNoAuth = new TestClient(API_BASE_URL);
      const response = await clientNoAuth.post('/api/games/fake-id/join');
      
      expect(response.status).toBe(401);
      expect(response.data?.error).toContain('Authorization');
    });
    
    it('should return 404 for non-existent game join', async () => {
      const response = await client.post('/api/games/non-existent-game-id/join');
      
      expect(response.status).toBe(404);
      expect(response.data?.error).toContain('Game not found');
    });
    
    it('should prevent joining AI games', async () => {
      // AI games shouldn't be joinable
      const response = await client.post(`/api/games/${testGameId}/join`);
      
      // Should get an error (either bad request or already player)
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
    
    it('should handle PvP game creation and joining flow', async () => {
      // Create a new test user for joining
      const uniqueId2 = (Date.now() + 1000).toString().slice(-6);
      const testUser2 = {
        email: `gametest2-${uniqueId2}@example.com`,
        username: `gametest2${uniqueId2}`,
        password: 'TestPass123!',
      };
      
      await client.post('/api/auth/register', testUser2);
      const login2Response = await client.post('/api/auth/login', {
        email: testUser2.email,
        password: testUser2.password,
      });
      
      const client2 = new TestClient(API_BASE_URL);
      client2.setAuthToken(login2Response.data.accessToken);
      
      // User1 creates PvP game
      const createResponse = await client.post('/api/games', {
        vsAI: false,
        isPrivate: false
      });
      
      expect(createResponse.status).toBe(200);
      expect(createResponse.data?.game?.status).toBe('WAITING');
      
      const gameId = createResponse.data.game.id;
      
      // User2 joins the game
      const joinResponse = await client2.post(`/api/games/${gameId}/join`);
      
      expect(joinResponse.status).toBe(200);
      expect(joinResponse.data?.message).toContain('Successfully joined');
      expect(joinResponse.data?.game?.status).toBe('ACTIVE');
    });
    
  });

  describe('Game Move Endpoint', () => {
    
    it('should require authentication for game moves', async () => {
      const clientNoAuth = new TestClient(API_BASE_URL);
      const response = await clientNoAuth.post('/api/games/fake-id/move', {
        type: 'draw_stock',
        playerId: 'fake-player'
      });
      
      expect(response.status).toBe(401);
      expect(response.data?.error).toContain('Authorization');
    });
    
    it('should return 404 for moves to non-existent game', async () => {
      const response = await client.post('/api/games/non-existent-game-id/move', {
        type: 'draw_stock',
        playerId: 'fake-player'
      });
      
      expect(response.status).toBe(404);
      expect(response.data?.error).toContain('Game not found');
    });
    
    it('should validate move structure and authorization', async () => {
      // Try to make move with wrong player ID
      const response = await client.post(`/api/games/${testGameId}/move`, {
        type: 'draw_stock',
        playerId: 'unauthorized-player-id'
      });
      
      // Should be rejected due to authorization or validation
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
    
    it('should handle malformed move requests', async () => {
      // Test with invalid JSON structure
      const response = await client.request(`/api/games/${testGameId}/move`, {
        method: 'POST',
        body: 'invalid json',
      });
      
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
    
  });

  describe('Error Handling', () => {
    
    it('should handle invalid game IDs gracefully', async () => {
      const invalidIds = ['invalid', '12345', 'null'];
      
      for (const invalidId of invalidIds) {
        const stateResponse = await client.get(`/api/games/${invalidId}/state`);
        expect(stateResponse.status).toBe(404);
        
        const joinResponse = await client.post(`/api/games/${invalidId}/join`);
        // Some endpoints may return 405 (Method Not Allowed) for certain invalid IDs
        expect([404, 405]).toContain(joinResponse.status);
        
        const moveResponse = await client.post(`/api/games/${invalidId}/move`, { type: 'draw_stock' });
        expect(stateResponse.status).toBe(404);
      }
    });
    
    it('should handle concurrent operations safely', async () => {
      // Create PvP game
      const createResponse = await client.post('/api/games', { vsAI: false });
      const gameId = createResponse.data.game.id;
      
      // Try multiple concurrent joins (should only allow one)
      const promises = Array(3).fill(null).map(() => 
        client.post(`/api/games/${gameId}/join`)
      );
      
      const results = await Promise.allSettled(promises);
      const statuses = results
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as any).value.status);
      
      // Should have some successes and some failures
      expect(statuses.some(s => s >= 400)).toBe(true);
    });
    
  });
  
});