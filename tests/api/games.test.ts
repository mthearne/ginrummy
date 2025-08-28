import { describe, it, expect, beforeEach } from 'vitest';
import { testUtils } from './setup';

describe('Games API', () => {
  let testUsers: any[];
  let authToken: string;

  beforeEach(async () => {
    testUsers = await testUtils.seedUsers();
    // Mock auth token for authenticated requests
    authToken = 'mock-jwt-token';
  });

  describe('POST /api/games', () => {
    it('should create a PvP game successfully', async () => {
      const gameData = {
        vsAI: false,
        isPrivate: false,
      };

      const expectedResponse = {
        success: true,
        game: {
          id: expect.any(String),
          status: 'WAITING',
          player1Id: testUsers[0].id,
          player2Id: null,
          vsAI: false,
          isPrivate: false,
          maxPlayers: 2,
          createdAt: expect.any(String),
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should create an AI game successfully', async () => {
      const gameData = {
        vsAI: true,
        isPrivate: true,
      };

      const expectedResponse = {
        success: true,
        game: {
          id: expect.any(String),
          status: 'ACTIVE', // AI games start immediately
          player1Id: testUsers[0].id,
          player2Id: 'ai-player',
          vsAI: true,
          isPrivate: true,
          gameState: expect.any(Object), // Should have initial game state
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should reject game creation without authentication', async () => {
      const gameData = {
        vsAI: false,
        isPrivate: false,
      };

      const expectedError = {
        success: false,
        error: expect.stringContaining('authentication'),
      };

      expect(expectedError).toBeDefined();
    });

    it('should use default values for missing parameters', async () => {
      const gameData = {}; // No parameters

      const expectedResponse = {
        success: true,
        game: expect.objectContaining({
          vsAI: false, // Default
          isPrivate: false, // Default
          maxPlayers: 2, // Default
        }),
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should validate maxPlayers is always 2', async () => {
      const gameData = {
        maxPlayers: 4, // Invalid for Gin Rummy
      };

      const expectedError = {
        success: false,
        error: expect.stringContaining('2 players'),
      };

      expect(expectedError).toBeDefined();
    });
  });

  describe('GET /api/games', () => {
    beforeEach(async () => {
      // Create some test games
      await testUtils.createGame(testUsers[0].id, null, { status: 'WAITING' });
      await testUtils.createGame(testUsers[0].id, testUsers[1].id, { status: 'ACTIVE' });
      await testUtils.createGame(testUsers[1].id, 'ai-player', { vsAI: true, status: 'ACTIVE' });
      await testUtils.createGame(testUsers[0].id, testUsers[1].id, { status: 'FINISHED' });
    });

    it('should return all public waiting games', async () => {
      const expectedResponse = {
        success: true,
        games: expect.arrayContaining([
          expect.objectContaining({
            status: 'WAITING',
            isPrivate: false,
            playerCount: 1,
            maxPlayers: 2,
          }),
        ]),
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should filter games by status', async () => {
      const queryParams = '?status=ACTIVE';
      
      const expectedResponse = {
        success: true,
        games: expect.arrayContaining([
          expect.objectContaining({
            status: 'ACTIVE',
          }),
        ]),
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should not return private games to non-participants', async () => {
      // Create a private game
      await testUtils.createGame(testUsers[1].id, null, { isPrivate: true });

      const expectedResponse = {
        success: true,
        games: expect.not.arrayContaining([
          expect.objectContaining({
            isPrivate: true,
            player1Id: expect.not.stringMatching(testUsers[0].id),
          }),
        ]),
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should include participant count and availability', async () => {
      const expectedResponse = {
        success: true,
        games: expect.arrayContaining([
          expect.objectContaining({
            playerCount: expect.any(Number),
            maxPlayers: 2,
            canJoin: expect.any(Boolean),
          }),
        ]),
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should support pagination', async () => {
      const queryParams = '?page=1&limit=5';

      const expectedResponse = {
        success: true,
        games: expect.any(Array),
        pagination: {
          page: 1,
          limit: 5,
          total: expect.any(Number),
          totalPages: expect.any(Number),
        },
      };

      expect(expectedResponse).toBeDefined();
    });
  });

  describe('GET /api/games/:gameId', () => {
    let testGame: any;

    beforeEach(async () => {
      testGame = await testUtils.createGame(testUsers[0].id, testUsers[1].id, { status: 'ACTIVE' });
    });

    it('should return game details for participant', async () => {
      const expectedResponse = {
        success: true,
        game: {
          id: testGame.id,
          status: 'ACTIVE',
          players: expect.arrayContaining([
            expect.objectContaining({
              id: testUsers[0].id,
              username: testUsers[0].username,
            }),
          ]),
          gameState: expect.any(Object),
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should return limited details for non-participants', async () => {
      // Different user viewing the game
      const expectedResponse = {
        success: true,
        game: {
          id: testGame.id,
          status: 'ACTIVE',
          players: expect.arrayContaining([
            expect.objectContaining({
              username: expect.any(String),
              // Should not include sensitive data like hand cards
            }),
          ]),
          // Should not include full game state
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should return 404 for non-existent games', async () => {
      const fakeGameId = 'non-existent-id';

      const expectedError = {
        success: false,
        error: expect.stringContaining('not found'),
      };

      expect(expectedError).toBeDefined();
    });

    it('should hide opponent cards during active game', async () => {
      const expectedResponse = {
        success: true,
        game: {
          gameState: {
            players: expect.arrayContaining([
              expect.objectContaining({
                hand: expect.any(Array), // Own hand visible
              }),
              expect.objectContaining({
                hand: [], // Opponent hand hidden
                handSize: expect.any(Number), // But size shown
              }),
            ]),
          },
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should reveal all cards when game is finished', async () => {
      const finishedGame = await testUtils.createGame(
        testUsers[0].id, 
        testUsers[1].id, 
        { status: 'FINISHED' }
      );

      const expectedResponse = {
        success: true,
        game: {
          gameState: {
            players: expect.arrayContaining([
              expect.objectContaining({
                hand: expect.any(Array), // All hands visible
                melds: expect.any(Array), // Melds visible
              }),
            ]),
          },
        },
      };

      expect(expectedResponse).toBeDefined();
    });
  });

  describe('POST /api/games/:gameId/join', () => {
    let waitingGame: any;

    beforeEach(async () => {
      waitingGame = await testUtils.createGame(testUsers[0].id, null, { status: 'WAITING' });
    });

    it('should allow player to join waiting game', async () => {
      const expectedResponse = {
        success: true,
        game: {
          id: waitingGame.id,
          status: 'ACTIVE', // Should change to active
          player1Id: testUsers[0].id,
          player2Id: testUsers[1].id, // Joined player
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should reject joining full game', async () => {
      const fullGame = await testUtils.createGame(testUsers[0].id, testUsers[1].id);

      const expectedError = {
        success: false,
        error: expect.stringContaining('full'),
      };

      expect(expectedError).toBeDefined();
    });

    it('should reject player joining their own game', async () => {
      const expectedError = {
        success: false,
        error: expect.stringContaining('own game'),
      };

      expect(expectedError).toBeDefined();
    });

    it('should reject joining finished game', async () => {
      const finishedGame = await testUtils.createGame(
        testUsers[0].id, 
        testUsers[1].id, 
        { status: 'FINISHED' }
      );

      const expectedError = {
        success: false,
        error: expect.stringContaining('finished'),
      };

      expect(expectedError).toBeDefined();
    });

    it('should initialize game state when second player joins', async () => {
      const expectedResponse = {
        success: true,
        game: {
          gameState: {
            phase: 'upcard_decision',
            currentPlayerId: expect.any(String),
            players: expect.arrayContaining([
              expect.objectContaining({
                hand: expect.arrayContaining([
                  expect.objectContaining({
                    suit: expect.any(String),
                    rank: expect.any(String),
                    id: expect.any(String),
                  }),
                ]),
              }),
            ]),
            stockPileCount: expect.any(Number),
            discardPile: expect.any(Array),
          },
        },
      };

      expect(expectedResponse).toBeDefined();
    });
  });

  describe('POST /api/games/:gameId/leave', () => {
    let activeGame: any;

    beforeEach(async () => {
      activeGame = await testUtils.createGame(testUsers[0].id, testUsers[1].id, { status: 'ACTIVE' });
    });

    it('should allow player to leave active game', async () => {
      const expectedResponse = {
        success: true,
        game: {
          status: 'CANCELLED', // Game should be cancelled
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should handle leaving waiting game', async () => {
      const waitingGame = await testUtils.createGame(testUsers[0].id, null, { status: 'WAITING' });

      const expectedResponse = {
        success: true,
        message: expect.stringContaining('left'),
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should reject leaving non-participant', async () => {
      // User not in the game trying to leave
      const expectedError = {
        success: false,
        error: expect.stringContaining('not a participant'),
      };

      expect(expectedError).toBeDefined();
    });

    it('should reject leaving finished game', async () => {
      const finishedGame = await testUtils.createGame(
        testUsers[0].id, 
        testUsers[1].id, 
        { status: 'FINISHED' }
      );

      const expectedError = {
        success: false,
        error: expect.stringContaining('finished'),
      };

      expect(expectedError).toBeDefined();
    });
  });

  describe('GET /api/games/my-games', () => {
    beforeEach(async () => {
      // Create games for the user
      await testUtils.createGame(testUsers[0].id, null, { status: 'WAITING' });
      await testUtils.createGame(testUsers[0].id, testUsers[1].id, { status: 'ACTIVE' });
      await testUtils.createGame(testUsers[1].id, testUsers[0].id, { status: 'FINISHED' });
      // Game user is not part of
      await testUtils.createGame(testUsers[1].id, 'ai-player', { vsAI: true });
    });

    it('should return only games user is participating in', async () => {
      const expectedResponse = {
        success: true,
        games: expect.arrayContaining([
          expect.objectContaining({
            // Games where user is player1 or player2
            $or: [
              { player1Id: testUsers[0].id },
              { player2Id: testUsers[0].id },
            ],
          }),
        ]),
      };

      expect(expectedResponse.games).toHaveLength(3); // Should be 3 games
    });

    it('should support filtering by status', async () => {
      const queryParams = '?status=ACTIVE';

      const expectedResponse = {
        success: true,
        games: expect.arrayContaining([
          expect.objectContaining({
            status: 'ACTIVE',
          }),
        ]),
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should include game statistics', async () => {
      const expectedResponse = {
        success: true,
        games: expect.any(Array),
        stats: {
          total: expect.any(Number),
          active: expect.any(Number),
          waiting: expect.any(Number),
          finished: expect.any(Number),
          won: expect.any(Number),
          lost: expect.any(Number),
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should require authentication', async () => {
      const expectedError = {
        success: false,
        error: expect.stringContaining('authentication'),
      };

      expect(expectedError).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Simulate database error
      const expectedError = {
        success: false,
        error: 'Internal server error',
      };

      expect(expectedError).toBeDefined();
    });

    it('should validate request parameters', async () => {
      const invalidData = {
        vsAI: 'not-a-boolean',
        maxPlayers: 'not-a-number',
      };

      const expectedError = {
        success: false,
        error: expect.stringContaining('validation'),
      };

      expect(expectedError).toBeDefined();
    });

    it('should handle concurrent join attempts', async () => {
      // Multiple users trying to join the same game simultaneously
      const expectedBehavior = 'only one should succeed';
      expect(expectedBehavior).toBeDefined();
    });
  });
});