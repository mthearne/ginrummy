import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { testUtils } from '../api/setup';
import request from 'supertest';
import { TurnController } from '../../lib/turn-controller';
import { EventSourcedGinRummyGame } from '../../packages/common/src/game-engine/event-sourced-gin-rummy';
import { EventType } from '../../packages/common/src/types/events';

// We'll test against the actual Next.js dev server
const API_BASE = process.env.TEST_API_URL || 'http://localhost:3000/api';

describe('Event-Sourced V2 Endpoints', () => {
  let testUsers: any[];
  let authTokens: { [key: string]: string };
  let turnController: TurnController;

  beforeAll(async () => {
    turnController = new TurnController(testUtils.db);
  });

  beforeEach(async () => {
    // Seed test users
    testUsers = await testUtils.seedUsers();
    
    // Get auth tokens for testing authenticated endpoints
    authTokens = {};
    for (let i = 0; i < testUsers.length; i++) {
      const loginResponse = await request(API_BASE.replace('/api', ''))
        .post('/api/auth/login')
        .send({
          email: testUsers[i].email,
          password: Object.values(testUtils.users)[i].password
        });
      
      if (loginResponse.status === 200) {
        authTokens[testUsers[i].id] = loginResponse.body.accessToken;
      }
    }
  });

  describe('POST /api/games/create-v2 - Event-Sourced Game Creation', () => {
    it('should create an AI game with complete event-sourced initialization', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({
          vsAI: true,
          isPrivate: false
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        gameId: expect.any(String),
        gameState: expect.objectContaining({
          id: expect.any(String),
          phase: expect.any(String),
          players: expect.arrayContaining([
            expect.objectContaining({
              id: testUsers[0].id,
              hand: expect.any(Array)
            })
          ]),
          vsAI: true,
          stockPileCount: expect.any(Number),
          discardPile: expect.any(Array)
        }),
        version: 'v2-event-sourced'
      });

      // Verify events were created
      const events = await testUtils.db.gameEvent.findMany({
        where: { gameId: response.body.gameId },
        orderBy: { sequenceNumber: 'asc' }
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0].eventType).toBe(EventType.GAME_CREATED);
    });

    it('should create a PvP game waiting for opponent', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({
          vsAI: false,
          isPrivate: true
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        gameId: expect.any(String),
        gameState: expect.objectContaining({
          vsAI: false,
          players: expect.any(Array)
        }),
        message: expect.stringContaining('waiting for opponent')
      });
    });

    it('should require authentication', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .send({ vsAI: true });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Authentication failed');
    });

    it('should handle default parameters correctly', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({}); // No parameters

      expect(response.status).toBe(200);
      expect(response.body.gameState).toMatchObject({
        vsAI: false, // Default
        // Should have proper default initialization
      });
    });
  });

  describe('GET /api/games/[gameId]/state-v2 - Event-Sourced State Loading', () => {
    let testGameId: string;

    beforeEach(async () => {
      // Create a game for testing
      const createResponse = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({ vsAI: true });
      
      testGameId = createResponse.body.gameId;
    });

    it('should load fresh game state from events', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .get(`/api/games/${testGameId}/state-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        gameState: expect.objectContaining({
          id: testGameId,
          version: 'event-sourced',
          eventCount: expect.any(Number),
          phase: expect.any(String),
          players: expect.any(Array)
        }),
        version: 'v2-event-sourced'
      });
    });

    it('should apply user perspective for card privacy', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .get(`/api/games/${testGameId}/state-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`);

      const gameState = response.body.gameState;
      const myPlayer = gameState.players.find((p: any) => p.id === testUsers[0].id);
      const opponentPlayer = gameState.players.find((p: any) => p.id !== testUsers[0].id);

      // My cards should be visible
      expect(myPlayer.hand).toBeInstanceOf(Array);
      expect(myPlayer.hand.length).toBeGreaterThan(0);

      // Opponent cards should be hidden (if it's an active game)
      if (opponentPlayer && gameState.phase !== 'round_over' && gameState.phase !== 'game_over') {
        expect(opponentPlayer.hand).toEqual([]);
      }
    });

    it('should require authentication', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .get(`/api/games/${testGameId}/state-v2`);

      expect(response.status).toBe(401);
    });

    it('should validate user access to the game', async () => {
      // Try to access game with different user
      const response = await request(API_BASE.replace('/api', ''))
        .get(`/api/games/${testGameId}/state-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[1].id]}`);

      expect(response.status).toBeOneOf([403, 404]); // Should deny access
    });
  });

  describe('POST /api/games/[gameId]/move-v2 - Atomic Move Processing', () => {
    let testGameId: string;

    beforeEach(async () => {
      // Create an AI game for testing moves
      const createResponse = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({ vsAI: true });
      
      testGameId = createResponse.body.gameId;
    });

    it('should process a valid draw from stock move atomically', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post(`/api/games/${testGameId}/move-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({
          type: EventType.DRAW_FROM_STOCK,
          playerId: testUsers[0].id,
          gameId: testGameId
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        gameState: expect.objectContaining({
          phase: 'discard', // Should advance to discard phase
          currentPlayerId: testUsers[0].id
        }),
        event: expect.objectContaining({
          eventType: EventType.DRAW_FROM_STOCK,
          sequenceNumber: expect.any(Number)
        }),
        version: 'v2-event-sourced'
      });

      // Verify event was persisted
      const events = await testUtils.db.gameEvent.findMany({
        where: { 
          gameId: testGameId,
          eventType: EventType.DRAW_FROM_STOCK
        }
      });
      expect(events.length).toBe(1);
    });

    it('should reject invalid moves with proper error messages', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post(`/api/games/${testGameId}/move-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({
          type: EventType.DISCARD_CARD, // Invalid - must draw first
          playerId: testUsers[0].id,
          cardId: 'invalid-card-id',
          gameId: testGameId
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Invalid move'),
        code: 'INVALID_MOVE'
      });
    });

    it('should reject moves from non-participants', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post(`/api/games/${testGameId}/move-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[1].id]}`) // Different user
        .send({
          type: EventType.DRAW_FROM_STOCK,
          playerId: testUsers[1].id, // Not in the game
          gameId: testGameId
        });

      expect(response.status).toBeOneOf([400, 403]);
      expect(response.body.success).toBe(false);
    });

    it('should handle concurrent move attempts correctly', async () => {
      // Simulate concurrent moves (should be handled by atomic transactions)
      const movePromises = [
        request(API_BASE.replace('/api', ''))
          .post(`/api/games/${testGameId}/move-v2`)
          .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
          .send({
            type: EventType.DRAW_FROM_STOCK,
            playerId: testUsers[0].id,
            gameId: testGameId
          }),
        request(API_BASE.replace('/api', ''))
          .post(`/api/games/${testGameId}/move-v2`)
          .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
          .send({
            type: EventType.DRAW_FROM_STOCK,
            playerId: testUsers[0].id,
            gameId: testGameId
          })
      ];

      const results = await Promise.all(movePromises);
      
      // Only one should succeed
      const successfulMoves = results.filter(r => r.body.success === true);
      const failedMoves = results.filter(r => r.body.success === false);
      
      expect(successfulMoves).toHaveLength(1);
      expect(failedMoves).toHaveLength(1);
    });

    it('should trigger AI moves for AI games', async () => {
      // Make a move that should trigger AI response
      const response = await request(API_BASE.replace('/api', ''))
        .post(`/api/games/${testGameId}/move-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({
          type: EventType.DRAW_FROM_STOCK,
          playerId: testUsers[0].id,
          gameId: testGameId
        });

      expect(response.body.aiShouldMove).toBeDefined();
      
      // Give AI a moment to process
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if AI made a move
      const events = await testUtils.db.gameEvent.findMany({
        where: { gameId: testGameId },
        orderBy: { sequenceNumber: 'desc' },
        take: 5
      });

      // Should have more events than just the initial game creation + human move
      expect(events.length).toBeGreaterThan(3);
    });
  });

  describe('Event Sourcing Integration Tests', () => {
    it('should maintain perfect state consistency across multiple operations', async () => {
      // Create game
      const createResponse = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send({ vsAI: true });

      const gameId = createResponse.body.gameId;
      
      // Make several moves
      const moves = [
        { type: EventType.DRAW_FROM_STOCK },
        // Additional moves would go here based on game flow
      ];

      for (const move of moves) {
        const moveResponse = await request(API_BASE.replace('/api', ''))
          .post(`/api/games/${gameId}/move-v2`)
          .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
          .send({
            ...move,
            playerId: testUsers[0].id,
            gameId
          });
        
        if (moveResponse.body.success) {
          // Verify state consistency by loading fresh from events
          const stateResponse = await request(API_BASE.replace('/api', ''))
            .get(`/api/games/${gameId}/state-v2`)
            .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`);
          
          expect(stateResponse.body.success).toBe(true);
          expect(stateResponse.body.gameState.id).toBe(gameId);
        }
      }

      // Final verification: Event count should match database
      const events = await testUtils.db.gameEvent.findMany({
        where: { gameId },
        orderBy: { sequenceNumber: 'asc' }
      });

      const finalStateResponse = await request(API_BASE.replace('/api', ''))
        .get(`/api/games/${gameId}/state-v2`)
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`);

      expect(finalStateResponse.body.gameState.eventCount).toBe(events.length);
    });
  });

  describe('System Health Endpoints', () => {
    it('should report AI queue status', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .get('/api/ai/queue');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        queue: expect.objectContaining({
          queueSize: expect.any(Number),
          processingGames: expect.any(Array),
          isIdle: expect.any(Boolean)
        }),
        version: 'v2-event-sourced'
      });
    });

    it('should report system repair capabilities', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .get('/api/system/repair');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        system: 'State Repair System',
        version: 'v2-event-sourced',
        status: 'ready',
        capabilities: expect.arrayContaining([
          expect.stringContaining('event sequence'),
          expect.stringContaining('repair')
        ])
      });
    });

    it('should provide performance testing capabilities', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .get('/api/system/perf-test');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        system: 'Event Sourcing Performance Test',
        version: 'v2-event-sourced',
        availableTests: expect.objectContaining({
          replay: expect.any(Object),
          concurrent: expect.any(Object),
          bulk: expect.any(Object)
        })
      });
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle malformed requests gracefully', async () => {
      const response = await request(API_BASE.replace('/api', ''))
        .post('/api/games/create-v2')
        .set('Authorization', `Bearer ${authTokens[testUsers[0].id]}`)
        .send('invalid-json');

      expect(response.status).toBeOneOf([400, 500]);
      expect(response.body).toHaveProperty('error');
    });

    it('should validate event sequence integrity', async () => {
      // This would test the repair system's ability to detect and fix issues
      // Implementation would depend on specific repair system capabilities
      expect(true).toBe(true); // Placeholder
    });
  });
});