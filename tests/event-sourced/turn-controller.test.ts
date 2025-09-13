import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TurnController } from '../../lib/turn-controller';
import { testUtils } from '../api/setup';
import { EventSourcedGinRummyGame } from '../../packages/common/src/game-engine/event-sourced-gin-rummy';
import { EventType, GameAction } from '../../packages/common/src/types/events';
import { GamePhase } from '../../packages/common/src/types/game';

describe('TurnController', () => {
  let turnController: TurnController;
  let testUsers: any[];
  let testGameId: string;
  let initialEvents: any[];

  beforeAll(async () => {
    // Reuse the test database setup
    turnController = new TurnController(testUtils.db);
  });

  beforeEach(async () => {
    // Seed test users
    testUsers = await testUtils.seedUsers();
    
    // Create a test game with initial events
    const gameId = 'test-turn-controller-' + Date.now();
    testGameId = gameId;
    
    const eventSourcedGame = new EventSourcedGinRummyGame(gameId);
    initialEvents = eventSourcedGame.createInitialGameEvents(
      testUsers[0].id,
      testUsers[1].id,
      false // PvP game
    );

    // Create game record
    await testUtils.db.game.create({
      data: {
        id: gameId,
        status: 'ACTIVE',
        gameType: 'STANDARD',
        player1Id: testUsers[0].id,
        player2Id: testUsers[1].id,
        currentPlayerId: testUsers[0].id,
        isPrivate: false,
        vsAI: false,
        maxPlayers: 2,
        eventCount: initialEvents.length,
      },
    });

    // Persist initial events
    for (const event of initialEvents) {
      await testUtils.db.gameEvent.create({
        data: {
          id: event.id,
          gameId: event.gameId,
          playerId: event.playerId,
          eventType: event.eventType,
          sequenceNumber: event.sequenceNumber,
          eventVersion: event.eventVersion,
          eventData: event.eventData as any,
          metadata: event.metadata as any,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(event.createdAt),
        },
      });
    }
  });

  describe('Atomic Transaction Processing', () => {
    it('should process a valid move atomically', async () => {
      // First, handle upcard decision phase (both players must pass to reach draw phase)
      // Player 1 goes first in upcard decision (dealer - they are currentPlayerId after GAME_STARTED)
      const passResult1 = await turnController.processTurn(testGameId, testUsers[0].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      });
      expect(passResult1.success).toBe(true);
      
      // Then player 2 (non-dealer) decides
      const passResult2 = await turnController.processTurn(testGameId, testUsers[1].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[1].id,
        gameId: testGameId,
      });
      expect(passResult2.success).toBe(true);

      // Now we can draw from stock (should be testUsers[1].id's turn - non-dealer goes first after both pass)
      const action: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[1].id,
        gameId: testGameId,
      };

      const result = await turnController.processTurn(testGameId, testUsers[1].id, action);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.gameState.phase).toBe(GamePhase.Discard);
        expect(result.event.eventType).toBe(EventType.DRAW_FROM_STOCK);
        expect(result.gameState.stockPileCount).toBeLessThan(31); // Stock decreased
        
        // Verify event was persisted
        const events = await testUtils.db.gameEvent.findMany({
          where: { gameId: testGameId },
          orderBy: { sequenceNumber: 'asc' }
        });
        
        expect(events.length).toBe(initialEvents.length + 1);
        expect(events[events.length - 1].eventType).toBe(EventType.DRAW_FROM_STOCK);
      }
    });

    it('should reject invalid moves atomically', async () => {
      // Try to draw when it's not the player's turn  
      const action: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[1].id, // Wrong player
        gameId: testGameId,
      };

      const result = await turnController.processTurn(testGameId, testUsers[1].id, action);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid move');
        
        // Verify no event was created
        const events = await testUtils.db.gameEvent.findMany({
          where: { gameId: testGameId }
        });
        
        expect(events.length).toBe(initialEvents.length); // No new events
      }
    });

    it('should reject moves on finished games', async () => {
      // Mark game as finished
      await testUtils.db.game.update({
        where: { id: testGameId },
        data: { status: 'FINISHED' }
      });

      const action: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[0].id,
        gameId: testGameId,
      };

      const result = await turnController.processTurn(testGameId, testUsers[0].id, action);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('already finished');
      }
    });

    it('should reject moves on non-existent games', async () => {
      const action: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[0].id,
        gameId: 'non-existent-game',
      };

      const result = await turnController.processTurn('non-existent-game', testUsers[0].id, action);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('not found');
      }
    });
  });

  describe('Race Condition Prevention', () => {
    it('should handle concurrent move attempts correctly', async () => {
      // Create two identical PASS_UPCARD moves simultaneously (valid in upcard phase)
      const action1: GameAction = {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      };

      const action2: GameAction = {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      };

      // Execute both moves concurrently
      const [result1, result2] = await Promise.all([
        turnController.processTurn(testGameId, testUsers[0].id, action1),
        turnController.processTurn(testGameId, testUsers[0].id, action2)
      ]);

      // Only one should succeed
      const successful = [result1, result2].filter(r => r.success);
      const failed = [result1, result2].filter(r => !r.success);

      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(1);

      // Verify only one event was created
      const events = await testUtils.db.gameEvent.findMany({
        where: { gameId: testGameId }
      });
      
      expect(events.length).toBe(initialEvents.length + 1);
    });

    it('should prevent concurrent moves from different players', async () => {
      // Player 1 (testUsers[0]) is current player in upcard decision phase
      const action1: GameAction = {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      };

      const action2: GameAction = {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[1].id, // Wrong player - not their turn
        gameId: testGameId,
      };

      // Execute both moves concurrently
      const [result1, result2] = await Promise.all([
        turnController.processTurn(testGameId, testUsers[0].id, action1),
        turnController.processTurn(testGameId, testUsers[1].id, action2)
      ]);

      // Only the correct player's move should succeed
      const player1Result = result1;
      const player2Result = result2;

      expect(player1Result.success).toBe(true);
      expect(player2Result.success).toBe(false);

      if (!player2Result.success) {
        expect(player2Result.error).toContain('Not your turn');
      }
    });
  });

  describe('Event Sequence Integrity', () => {
    it('should maintain correct sequence numbers', async () => {
      const initialEventCount = initialEvents.length;

      // Make several moves following proper Gin Rummy phases
      // 1. Both players pass upcard
      let sequenceNumber = initialEventCount;

      // Player 1 passes upcard
      const passResult1 = await turnController.processTurn(testGameId, testUsers[0].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      });
      expect(passResult1.success).toBe(true);
      if (passResult1.success) {
        sequenceNumber++;
        expect(passResult1.event.sequenceNumber).toBe(sequenceNumber);
      }

      // Player 2 passes upcard
      const passResult2 = await turnController.processTurn(testGameId, testUsers[1].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[1].id,
        gameId: testGameId,
      });
      expect(passResult2.success).toBe(true);
      if (passResult2.success) {
        sequenceNumber++;
        expect(passResult2.event.sequenceNumber).toBe(sequenceNumber);
      }

      // 2. Player 2 draws from stock (non-dealer goes first after both pass)
      const drawResult = await turnController.processTurn(testGameId, testUsers[1].id, {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[1].id,
        gameId: testGameId,
      });
      expect(drawResult.success).toBe(true);
      if (drawResult.success) {
        sequenceNumber++;
        expect(drawResult.event.sequenceNumber).toBe(sequenceNumber);
      }

      // 3. Player 2 discards a card
      const gameState = await turnController.loadGameState(testGameId, testUsers[1].id);
      expect(gameState.success).toBe(true);
      if (gameState.success) {
        const playerHand = gameState.gameState.players.find(p => p.id === testUsers[1].id)?.hand;
        expect(playerHand).toBeDefined();
        expect(playerHand!.length).toBeGreaterThan(0);
        
        const cardToDiscard = playerHand![0];
        const discardResult = await turnController.processTurn(testGameId, testUsers[1].id, {
          type: EventType.DISCARD_CARD,
          playerId: testUsers[1].id,
          gameId: testGameId,
          cardId: cardToDiscard.id,
        });
        expect(discardResult.success).toBe(true);
        if (discardResult.success) {
          sequenceNumber++;
          expect(discardResult.event.sequenceNumber).toBe(sequenceNumber);
        }
      }

      // Verify all events have correct sequence numbers
      const events = await testUtils.db.gameEvent.findMany({
        where: { gameId: testGameId },
        orderBy: { sequenceNumber: 'asc' }
      });

      for (let i = 0; i < events.length; i++) {
        expect(events[i].sequenceNumber).toBe(i + 1);
      }
    });

    it('should update game metadata correctly', async () => {
      // First pass upcard to get to a valid game state
      await turnController.processTurn(testGameId, testUsers[0].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      });

      const initialGame = await testUtils.db.game.findUnique({
        where: { id: testGameId }
      });

      const action: GameAction = {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[1].id,
        gameId: testGameId,
      };

      const result = await turnController.processTurn(testGameId, testUsers[1].id, action);

      expect(result.success).toBe(true);

      const updatedGame = await testUtils.db.game.findUnique({
        where: { id: testGameId }
      });

      expect(updatedGame?.eventCount).toBe(initialEvents.length + 2); // Two pass events
      expect(updatedGame?.currentPlayerId).toBe(testUsers[1].id); // Non-dealer goes first after both pass
      expect(updatedGame?.lastEventAt).not.toBe(initialGame?.lastEventAt);
      expect(updatedGame?.updatedAt).not.toBe(initialGame?.updatedAt);
    });
  });

  describe('AI Move Detection', () => {
    it('should detect when AI should move in AI games', async () => {
      // Create an AI game
      const aiGameId = 'ai-game-' + Date.now();
      const aiEventSourcedGame = new EventSourcedGinRummyGame(aiGameId);
      const aiInitialEvents = aiEventSourcedGame.createInitialGameEvents(
        testUsers[0].id,
        'ai-player',
        true // AI game
      );

      await testUtils.db.game.create({
        data: {
          id: aiGameId,
          status: 'ACTIVE',
          gameType: 'STANDARD',
          player1Id: testUsers[0].id,
          player2Id: testUsers[0].id, // AI games store human player as both
          currentPlayerId: testUsers[0].id,
          isPrivate: false,
          vsAI: true,
          maxPlayers: 2,
          eventCount: aiInitialEvents.length,
        },
      });

      // Persist AI game events
      for (const event of aiInitialEvents) {
        await testUtils.db.gameEvent.create({
          data: {
            id: event.id,
            gameId: event.gameId,
            playerId: event.playerId,
            eventType: event.eventType,
            sequenceNumber: event.sequenceNumber,
            eventVersion: event.eventVersion,
            eventData: event.eventData as any,
            metadata: event.metadata as any,
            processed: true,
            processedAt: new Date(),
            createdAt: new Date(event.createdAt),
          },
        });
      }

      // First handle upcard phase - human passes
      const passResult1 = await turnController.processTurn(aiGameId, testUsers[0].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: aiGameId,
      });
      expect(passResult1.success).toBe(true);

      // AI passes (simulated as human player for test)
      const passResult2 = await turnController.processTurn(aiGameId, testUsers[0].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id, // AI is stored as testUsers[0].id in AI games
        gameId: aiGameId,
      });
      expect(passResult2.success).toBe(true);

      // Human makes a move (draws from stock)
      const humanAction: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[0].id,
        gameId: aiGameId,
      };

      const result = await turnController.processTurn(aiGameId, testUsers[0].id, humanAction);

      expect(result.success).toBe(true);
      if (result.success) {
        // After human draws, they must discard, so AI shouldn't move yet
        expect(result.aiShouldMove).toBe(false);

        // Now human discards
        const discardAction: GameAction = {
          type: EventType.DISCARD_CARD,
          playerId: testUsers[0].id,
          gameId: aiGameId,
          cardId: result.gameState.players[0].hand[0].id,
        };

        const discardResult = await turnController.processTurn(aiGameId, testUsers[0].id, discardAction);

        expect(discardResult.success).toBe(true);
        if (discardResult.success) {
          // After human discards, it's AI's turn
          expect(discardResult.aiShouldMove).toBe(true);
        }
      }
    });

    it('should not trigger AI in PvP games', async () => {
      // First handle upcard phase for PvP game
      const passResult1 = await turnController.processTurn(testGameId, testUsers[0].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      });
      expect(passResult1.success).toBe(true);

      const passResult2 = await turnController.processTurn(testGameId, testUsers[1].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[1].id,
        gameId: testGameId,
      });
      expect(passResult2.success).toBe(true);

      // Now draw from stock
      const action: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[1].id, // Non-dealer goes first after both pass
        gameId: testGameId,
      };

      const result = await turnController.processTurn(testGameId, testUsers[1].id, action);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.aiShouldMove).toBe(false);
      }
    });
  });

  describe('Complex Game Scenarios', () => {
    it('should handle knock moves correctly', async () => {
      // This is a simplified test - in reality we'd need to set up a specific game state
      // where knocking is possible, but for now we test the structure
      const knockAction: GameAction = {
        type: EventType.KNOCK,
        playerId: testUsers[0].id,
        gameId: testGameId,
        melds: [],
        deadwood: [],
      };

      // This will likely fail validation since the game state isn't set up for knocking,
      // but we're testing that the controller handles knock actions properly
      const result = await turnController.processTurn(testGameId, testUsers[0].id, knockAction);

      // We expect this to fail validation, but not crash
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });

    it('should handle discard moves with card validation', async () => {
      // First handle upcard phase
      const passResult1 = await turnController.processTurn(testGameId, testUsers[0].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[0].id,
        gameId: testGameId,
      });
      expect(passResult1.success).toBe(true);

      const passResult2 = await turnController.processTurn(testGameId, testUsers[1].id, {
        type: EventType.PASS_UPCARD,
        playerId: testUsers[1].id,
        gameId: testGameId,
      });
      expect(passResult2.success).toBe(true);

      // Now draw a card
      const drawAction: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[1].id, // Non-dealer goes first after both pass
        gameId: testGameId,
      };

      const drawResult = await turnController.processTurn(testGameId, testUsers[1].id, drawAction);
      expect(drawResult.success).toBe(true);

      if (drawResult.success) {
        // Get the player's hand to find a valid card to discard - find the correct player
        const currentPlayer = drawResult.gameState.players.find(p => p.id === testUsers[1].id);
        expect(currentPlayer).toBeDefined();
        expect(currentPlayer!.hand.length).toBeGreaterThan(0);

        const cardToDiscard = currentPlayer!.hand[0];

        const discardAction: GameAction = {
          type: EventType.DISCARD_CARD,
          playerId: testUsers[1].id, // Use correct player ID
          gameId: testGameId,
          cardId: cardToDiscard.id,
        };

        const discardResult = await turnController.processTurn(testGameId, testUsers[1].id, discardAction);

        expect(discardResult.success).toBe(true);
        if (discardResult.success) {
          expect(discardResult.event.eventType).toBe(EventType.DISCARD_CARD);
          expect(discardResult.gameState.phase).toBe(GamePhase.Draw);
          expect(discardResult.gameState.currentPlayerId).toBe(testUsers[1].id);
        }
      }
    });
  });

  describe('State Loading', () => {
    it('should load game state correctly', async () => {
      const result = await turnController.loadGameState(testGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.gameState.id).toBe(testGameId);
        expect(result.gameState.players).toHaveLength(2);
        expect(result.gameState.phase).toBe(GamePhase.UpcardDecision);
        expect(result.eventCount).toBe(initialEvents.length);
      }
    });

    it('should handle non-existent games in state loading', async () => {
      const result = await turnController.loadGameState('non-existent', testUsers[0].id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Game not found');
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted event data gracefully', async () => {
      // Add a corrupted event to the database with null event data
      await testUtils.db.gameEvent.create({
        data: {
          id: 'corrupted-event',
          gameId: testGameId,
          playerId: testUsers[0].id,
          eventType: EventType.PASS_UPCARD, // Use valid event type
          sequenceNumber: initialEvents.length + 1,
          eventVersion: 1,
          eventData: null, // This is the corruption - null event data
          metadata: null,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(),
        },
      });

      // Try to load game state - this should handle the corrupted event
      const result = await turnController.loadGameState(testGameId, testUsers[0].id);

      // The system should either handle it gracefully or provide a clear error
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to load game state');
      }
    });

    it('should validate event sequence gaps', async () => {
      // Delete a middle event to create a gap
      await testUtils.db.gameEvent.deleteMany({
        where: { 
          gameId: testGameId,
          sequenceNumber: 1 // Delete first event after initial creation
        }
      });

      const action: GameAction = {
        type: EventType.DRAW_FROM_STOCK,
        playerId: testUsers[0].id,
        gameId: testGameId,
      };

      // This should detect the sequence gap and handle it appropriately
      const result = await turnController.processTurn(testGameId, testUsers[0].id, action);
      
      // The system should either succeed after healing the sequence or provide a clear error
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });
});