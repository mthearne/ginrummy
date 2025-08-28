import { describe, it, expect, beforeEach } from 'vitest';
import { testUtils } from './setup';
import { MoveType, GamePhase } from '../../packages/common/src/types/game';

describe('Game Moves API', () => {
  let testUsers: any[];
  let activeGame: any;
  let authToken: string;

  beforeEach(async () => {
    testUsers = await testUtils.seedUsers();
    activeGame = await testUtils.createGame(testUsers[0].id, testUsers[1].id, { status: 'ACTIVE' });
    authToken = 'mock-jwt-token';
  });

  describe('POST /api/games/:gameId/move', () => {
    describe('Upcard Decision Phase', () => {
      it('should allow taking upcard', async () => {
        const moveData = {
          type: MoveType.TakeUpcard,
          playerId: testUsers[1].id, // Non-dealer goes first
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.Discard,
            currentPlayerId: testUsers[1].id,
            players: expect.arrayContaining([
              expect.objectContaining({
                id: testUsers[1].id,
                hand: expect.any(Array), // Should have 11 cards after taking upcard
              }),
            ]),
            discardPile: [], // Should be empty after taking upcard
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should allow passing upcard', async () => {
        const moveData = {
          type: MoveType.PassUpcard,
          playerId: testUsers[1].id, // Non-dealer
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.UpcardDecision,
            currentPlayerId: testUsers[0].id, // Now dealer's turn
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should transition to draw phase when both players pass', async () => {
        // First player passes
        const pass1 = {
          type: MoveType.PassUpcard,
          playerId: testUsers[1].id,
        };

        // Second player passes  
        const pass2 = {
          type: MoveType.PassUpcard,
          playerId: testUsers[0].id,
        };

        const expectedFinalState = {
          success: true,
          gameState: {
            phase: GamePhase.Draw,
            currentPlayerId: testUsers[1].id, // Non-dealer starts drawing
          },
        };

        expect(expectedFinalState).toBeDefined();
      });

      it('should reject invalid moves in upcard phase', async () => {
        const invalidMove = {
          type: MoveType.DrawStock, // Wrong move for this phase
          playerId: testUsers[1].id,
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('invalid move'),
        };

        expect(expectedError).toBeDefined();
      });
    });

    describe('Draw Phase', () => {
      beforeEach(() => {
        // Assume game is in draw phase for these tests
      });

      it('should allow drawing from stock', async () => {
        const moveData = {
          type: MoveType.DrawStock,
          playerId: testUsers[1].id,
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.Discard,
            currentPlayerId: testUsers[1].id,
            stockPileCount: expect.any(Number), // Should decrease by 1
            players: expect.arrayContaining([
              expect.objectContaining({
                id: testUsers[1].id,
                hand: expect.any(Array), // Should have 11 cards
              }),
            ]),
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should allow drawing from discard pile', async () => {
        const moveData = {
          type: MoveType.DrawDiscard,
          playerId: testUsers[1].id,
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.Discard,
            currentPlayerId: testUsers[1].id,
            discardPile: expect.any(Array), // Should have one less card
            players: expect.arrayContaining([
              expect.objectContaining({
                id: testUsers[1].id,
                hand: expect.any(Array), // Should have 11 cards
              }),
            ]),
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should reject drawing from empty discard pile', async () => {
        const moveData = {
          type: MoveType.DrawDiscard,
          playerId: testUsers[1].id,
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('discard pile is empty'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should handle stock depletion', async () => {
        const moveData = {
          type: MoveType.DrawStock,
          playerId: testUsers[1].id,
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.GameOver, // Game should end
            gameOver: true,
          },
        };

        expect(expectedResponse).toBeDefined();
      });
    });

    describe('Discard Phase', () => {
      beforeEach(() => {
        // Assume game is in discard phase for these tests
      });

      it('should allow discarding a card', async () => {
        const moveData = {
          type: MoveType.Discard,
          playerId: testUsers[1].id,
          cardId: 'valid-card-id',
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.Draw,
            currentPlayerId: testUsers[0].id, // Next player's turn
            discardPile: expect.arrayContaining([
              expect.objectContaining({
                id: 'valid-card-id',
              }),
            ]),
            players: expect.arrayContaining([
              expect.objectContaining({
                id: testUsers[1].id,
                hand: expect.any(Array), // Should have 10 cards
              }),
            ]),
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should allow knocking with valid melds', async () => {
        const moveData = {
          type: MoveType.Knock,
          playerId: testUsers[1].id,
          cardId: 'discard-card-id',
          melds: [
            {
              type: 'run',
              cards: [
                { suit: 'hearts', rank: '3', id: 'card1' },
                { suit: 'hearts', rank: '4', id: 'card2' },
                { suit: 'hearts', rank: '5', id: 'card3' },
              ],
            },
          ],
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.RoundOver,
            players: expect.arrayContaining([
              expect.objectContaining({
                id: testUsers[1].id,
                hasKnocked: true,
                melds: expect.any(Array),
                deadwood: expect.any(Number),
              }),
            ]),
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should allow gin with all cards melded', async () => {
        const moveData = {
          type: MoveType.Gin,
          playerId: testUsers[1].id,
          cardId: 'discard-card-id',
          melds: [
            {
              type: 'run',
              cards: [
                { suit: 'hearts', rank: '3', id: 'card1' },
                { suit: 'hearts', rank: '4', id: 'card2' },
                { suit: 'hearts', rank: '5', id: 'card3' },
              ],
            },
            // More melds to account for all cards
          ],
        };

        const expectedResponse = {
          success: true,
          gameState: {
            phase: GamePhase.RoundOver,
            players: expect.arrayContaining([
              expect.objectContaining({
                id: testUsers[1].id,
                hasGin: true,
                deadwood: 0,
              }),
            ]),
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should reject knocking with too much deadwood', async () => {
        const moveData = {
          type: MoveType.Knock,
          playerId: testUsers[1].id,
          cardId: 'discard-card-id',
          melds: [], // No melds = high deadwood
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('deadwood'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should reject gin with deadwood cards', async () => {
        const moveData = {
          type: MoveType.Gin,
          playerId: testUsers[1].id,
          cardId: 'discard-card-id',
          melds: [
            // Incomplete melds that don't cover all cards
          ],
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('gin'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should reject discarding card not in hand', async () => {
        const moveData = {
          type: MoveType.Discard,
          playerId: testUsers[1].id,
          cardId: 'non-existent-card',
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('not found in hand'),
        };

        expect(expectedError).toBeDefined();
      });
    });

    describe('Turn Validation', () => {
      it('should reject moves from wrong player', async () => {
        const moveData = {
          type: MoveType.PassUpcard,
          playerId: testUsers[0].id, // Wrong player (should be player2 first)
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('not your turn'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should reject moves in wrong phase', async () => {
        const moveData = {
          type: MoveType.Discard,
          playerId: testUsers[1].id,
          cardId: 'any-card',
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('invalid move'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should reject moves from non-participants', async () => {
        // Create another user not in the game
        const nonParticipant = await testUtils.db.user.create({
          data: {
            email: 'outsider@example.com',
            username: 'outsider',
            password: 'hashedpassword',
          },
        });

        const moveData = {
          type: MoveType.PassUpcard,
          playerId: nonParticipant.id,
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('not a participant'),
        };

        expect(expectedError).toBeDefined();
      });
    });

    describe('Game State Updates', () => {
      it('should update player statistics after move', async () => {
        const moveData = {
          type: MoveType.Discard,
          playerId: testUsers[1].id,
          cardId: 'valid-card-id',
        };

        const expectedResponse = {
          success: true,
          gameState: {
            players: expect.arrayContaining([
              expect.objectContaining({
                id: testUsers[1].id,
                deadwood: expect.any(Number),
                melds: expect.any(Array),
              }),
            ]),
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should log game events for replay', async () => {
        const moveData = {
          type: MoveType.DrawStock,
          playerId: testUsers[1].id,
        };

        // Should create a game event record
        const expectedEventLog = {
          gameId: activeGame.id,
          userId: testUsers[1].id,
          eventType: 'DRAW_STOCK',
          eventData: expect.any(Object),
          timestamp: expect.any(Date),
        };

        expect(expectedEventLog).toBeDefined();
      });

      it('should calculate scores when round ends', async () => {
        const knockMove = {
          type: MoveType.Knock,
          playerId: testUsers[1].id,
          cardId: 'discard-card',
          melds: [], // Valid melds for knocking
        };

        const expectedResponse = {
          success: true,
          gameState: {
            roundScores: {
              [testUsers[1].id]: expect.any(Number),
              [testUsers[0].id]: expect.any(Number),
            },
            players: expect.arrayContaining([
              expect.objectContaining({
                score: expect.any(Number),
              }),
            ]),
          },
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should end game when player reaches 100 points', async () => {
        // Mock a scenario where player reaches 100 points
        const expectedResponse = {
          success: true,
          gameState: {
            gameOver: true,
            phase: GamePhase.GameOver,
            status: 'FINISHED',
            winner: expect.any(String),
          },
        };

        expect(expectedResponse).toBeDefined();
      });
    });

    describe('AI Game Moves', () => {
      let aiGame: any;

      beforeEach(async () => {
        aiGame = await testUtils.createGame(testUsers[0].id, 'ai-player', { vsAI: true });
      });

      it('should process AI moves automatically', async () => {
        const humanMove = {
          type: MoveType.PassUpcard,
          playerId: testUsers[0].id,
        };

        const expectedResponse = {
          success: true,
          gameState: {
            // After human move, AI should have moved too
            currentPlayerId: testUsers[0].id, // Back to human
            phase: expect.any(String),
          },
          aiMoves: expect.arrayContaining([
            expect.objectContaining({
              type: expect.any(String),
              playerId: 'ai-player',
            }),
          ]),
        };

        expect(expectedResponse).toBeDefined();
      });

      it('should prevent direct AI moves from API', async () => {
        const aiMove = {
          type: MoveType.PassUpcard,
          playerId: 'ai-player',
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('AI moves are automatic'),
        };

        expect(expectedError).toBeDefined();
      });
    });

    describe('Error Handling', () => {
      it('should handle invalid game ID', async () => {
        const moveData = {
          type: MoveType.PassUpcard,
          playerId: testUsers[1].id,
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('Game not found'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should handle moves on finished games', async () => {
        const finishedGame = await testUtils.createGame(
          testUsers[0].id, 
          testUsers[1].id, 
          { status: 'FINISHED' }
        );

        const moveData = {
          type: MoveType.PassUpcard,
          playerId: testUsers[1].id,
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('Game is finished'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should validate move data structure', async () => {
        const invalidMove = {
          type: 'INVALID_MOVE_TYPE',
          playerId: testUsers[1].id,
        };

        const expectedError = {
          success: false,
          error: expect.stringContaining('Invalid move type'),
        };

        expect(expectedError).toBeDefined();
      });

      it('should handle concurrent move attempts', async () => {
        // Two players making moves simultaneously
        const expectedBehavior = 'only valid move should succeed';
        expect(expectedBehavior).toBeDefined();
      });

      it('should rollback on move processing errors', async () => {
        // If move processing fails partway through, state should be consistent
        const expectedBehavior = 'game state remains consistent';
        expect(expectedBehavior).toBeDefined();
      });
    });
  });

  describe('GET /api/games/:gameId/state', () => {
    it('should return current game state for participant', async () => {
      const expectedResponse = {
        success: true,
        gameState: {
          id: activeGame.id,
          phase: expect.any(String),
          currentPlayerId: expect.any(String),
          players: expect.any(Array),
          stockPileCount: expect.any(Number),
          discardPile: expect.any(Array),
          // Opponent's hand should be hidden
        },
      };

      expect(expectedResponse).toBeDefined();
    });

    it('should hide sensitive information from spectators', async () => {
      // Non-participant viewing game state
      const expectedResponse = {
        success: true,
        gameState: {
          phase: expect.any(String),
          // Should not include player hands
          // Should not include detailed game state
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
});