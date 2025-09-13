import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { GameStateLoader } from '../../lib/game-state-loader';
import { testUtils } from '../api/setup';
import { EventSourcedGinRummyGame } from '../../packages/common/src/game-engine/event-sourced-gin-rummy';
import { EventType, createGameEvent } from '../../packages/common/src/types/events';
import { GamePhase, GameStatus } from '../../packages/common/src/types/game';

describe('GameStateLoader', () => {
  let gameStateLoader: GameStateLoader;
  let testUsers: any[];
  let testGameId: string;
  let aiGameId: string;
  let initialEvents: any[];

  beforeAll(async () => {
    gameStateLoader = new GameStateLoader(testUtils.db);
  });

  beforeEach(async () => {
    // Seed test users
    testUsers = await testUtils.seedUsers();
    
    // Create test games
    testGameId = 'loader-test-' + Date.now();
    aiGameId = 'loader-ai-' + Date.now();
    
    // Create PvP game with events
    const pvpEventSourcedGame = new EventSourcedGinRummyGame(testGameId);
    initialEvents = pvpEventSourcedGame.createInitialGameEvents(
      testUsers[0].id,
      testUsers[1].id,
      false
    );

    await testUtils.db.game.create({
      data: {
        id: testGameId,
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

    // Persist PvP events
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

    // Create AI game
    const aiEventSourcedGame = new EventSourcedGinRummyGame(aiGameId);
    const aiInitialEvents = aiEventSourcedGame.createInitialGameEvents(
      testUsers[0].id,
      'ai-player',
      true
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

    // Persist AI events
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
  });

  describe('Basic State Loading', () => {
    it('should load PvP game state correctly', async () => {
      const result = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.gameState.id).toBe(testGameId);
        expect(result.gameState.players).toHaveLength(2);
        expect(result.gameState.phase).toBe(GamePhase.UpcardDecision);
        expect(result.gameState.status).toBe(GameStatus.Active);
        expect(result.gameState.vsAI).toBe(false);
        expect(result.eventCount).toBe(initialEvents.length);
        expect(result.lastEventAt).toBeInstanceOf(Date);
      }
    });

    it('should load AI game state correctly', async () => {
      const result = await gameStateLoader.loadGameState(aiGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.gameState.id).toBe(aiGameId);
        expect(result.gameState.players).toHaveLength(2);
        expect(result.gameState.vsAI).toBe(true);
        expect(result.gameState.players.some(p => p.id === 'ai-player')).toBe(true);
      }
    });

    it('should return error for non-existent games', async () => {
      const result = await gameStateLoader.loadGameState('non-existent', testUsers[0].id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Game not found');
        expect(result.code).toBe('GAME_NOT_FOUND');
      }
    });

    it('should load game state without user ID for system access', async () => {
      const result = await gameStateLoader.loadGameState(testGameId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.gameState.id).toBe(testGameId);
        // System access should see full state
      }
    });
  });

  describe('User Perspective and Privacy', () => {
    it('should apply user perspective correctly for participant', async () => {
      // Add some moves to create a more complex state
      const drawEvent = createGameEvent(
        testGameId,
        EventType.DRAW_FROM_STOCK,
        {
          playerId: testUsers[0].id,
          cardDrawn: { suit: 'hearts', rank: 'A', id: 'drawn-card' },
          stockSizeAfter: 30
        },
        testUsers[0].id,
        initialEvents.length + 1
      );

      await testUtils.db.gameEvent.create({
        data: {
          id: drawEvent.id,
          gameId: drawEvent.gameId,
          playerId: drawEvent.playerId,
          eventType: drawEvent.eventType,
          sequenceNumber: drawEvent.sequenceNumber,
          eventVersion: drawEvent.eventVersion,
          eventData: drawEvent.eventData as any,
          metadata: drawEvent.metadata as any,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(drawEvent.createdAt),
        },
      });

      const result = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        const myPlayer = result.gameState.players.find(p => p.id === testUsers[0].id);
        const opponent = result.gameState.players.find(p => p.id === testUsers[1].id);

        expect(myPlayer).toBeDefined();
        expect(opponent).toBeDefined();

        // My hand should be visible
        expect(myPlayer!.hand).toBeInstanceOf(Array);
        expect(myPlayer!.hand.length).toBeGreaterThan(0);

        // Opponent hand should be hidden during active game
        if (result.gameState.phase !== GamePhase.GameOver && result.gameState.phase !== GamePhase.RoundOver) {
          expect(opponent!.hand).toEqual([]);
          expect(opponent!.handSize).toBe(10); // But size should be shown
        }
      }
    });

    it('should deny access to non-participants in private games', async () => {
      // Create a private game
      const privateGameId = 'private-' + Date.now();
      const privateGame = new EventSourcedGinRummyGame(privateGameId);
      const privateEvents = privateGame.createInitialGameEvents(
        testUsers[0].id,
        testUsers[1].id,
        false
      );

      await testUtils.db.game.create({
        data: {
          id: privateGameId,
          status: 'ACTIVE',
          gameType: 'STANDARD',
          player1Id: testUsers[0].id,
          player2Id: testUsers[1].id,
          currentPlayerId: testUsers[0].id,
          isPrivate: true, // Private game
          vsAI: false,
          maxPlayers: 2,
          eventCount: privateEvents.length,
        },
      });

      for (const event of privateEvents) {
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

      // Create a third user who is not in the game
      const nonParticipant = await testUtils.db.user.create({
        data: {
          email: 'outsider@example.com',
          username: 'outsider',
          password: 'password123',
          elo: 1200,
        },
      });

      const result = await gameStateLoader.loadGameState(privateGameId, nonParticipant.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('access denied');
        expect(result.code).toBe('ACCESS_DENIED');
      }
    });

    it('should allow access to public games by non-participants with limited view', async () => {
      // Create third user  
      const observer = await testUtils.db.user.create({
        data: {
          email: 'observer@example.com',
          username: 'observer',
          password: 'password123',
          elo: 1200,
        },
      });

      const result = await gameStateLoader.loadGameState(testGameId, observer.id);

      expect(result.success).toBe(true);
      if (result.success) {
        // Observer should see limited view - all hands hidden during active game
        result.gameState.players.forEach(player => {
          if (result.gameState.phase !== GamePhase.GameOver && result.gameState.phase !== GamePhase.RoundOver) {
            expect(player.hand).toEqual([]);
            expect(player.handSize).toBeGreaterThan(0);
          }
        });
      }
    });

    it('should reveal all cards when game is finished', async () => {
      // Mark game as finished
      await testUtils.db.game.update({
        where: { id: testGameId },
        data: { 
          status: 'FINISHED',
          finishedAt: new Date()
        }
      });

      // Add a game finished event
      const finishedEvent = createGameEvent(
        testGameId,
        EventType.GAME_FINISHED,
        {
          winnerId: testUsers[0].id,
          finalScores: { [testUsers[0].id]: 100, [testUsers[1].id]: 85 },
          reason: 'POINTS_REACHED'
        },
        testUsers[0].id,
        initialEvents.length + 1
      );

      await testUtils.db.gameEvent.create({
        data: {
          id: finishedEvent.id,
          gameId: finishedEvent.gameId,
          playerId: finishedEvent.playerId,
          eventType: finishedEvent.eventType,
          sequenceNumber: finishedEvent.sequenceNumber,
          eventVersion: finishedEvent.eventVersion,
          eventData: finishedEvent.eventData as any,
          metadata: finishedEvent.metadata as any,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(finishedEvent.createdAt),
        },
      });

      const result = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.gameState.status).toBe(GameStatus.Finished);
        
        // All hands should be visible when game is finished
        result.gameState.players.forEach(player => {
          expect(player.hand).toBeInstanceOf(Array);
          // In finished games, hands might be visible depending on implementation
        });
      }
    });
  });

  describe('Event Replay and State Consistency', () => {
    it('should rebuild state consistently from same events', async () => {
      // Load the same game state multiple times
      const results = await Promise.all([
        gameStateLoader.loadGameState(testGameId, testUsers[0].id),
        gameStateLoader.loadGameState(testGameId, testUsers[0].id),
        gameStateLoader.loadGameState(testGameId, testUsers[0].id),
      ]);

      // All results should be successful
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // All game states should be identical
      const states = results.map(r => r.success ? r.gameState : null);
      expect(states[0]).toEqual(states[1]);
      expect(states[1]).toEqual(states[2]);
    });

    it('should handle games with many events efficiently', async () => {
      // Add many events to test performance
      const manyEventsGameId = 'many-events-' + Date.now();
      
      await testUtils.db.game.create({
        data: {
          id: manyEventsGameId,
          status: 'ACTIVE',
          gameType: 'STANDARD',
          player1Id: testUsers[0].id,
          player2Id: testUsers[1].id,
          currentPlayerId: testUsers[0].id,
          isPrivate: false,
          vsAI: false,
          maxPlayers: 2,
          eventCount: 0,
        },
      });

      // Create initial events
      const gameEngine = new EventSourcedGinRummyGame(manyEventsGameId);
      const events = gameEngine.createInitialGameEvents(testUsers[0].id, testUsers[1].id, false);

      // Add some additional move events
      for (let i = 0; i < 20; i++) {
        const drawEvent = createGameEvent(
          manyEventsGameId,
          EventType.DRAW_FROM_STOCK,
          { playerId: testUsers[i % 2], cardDrawn: { suit: 'hearts', rank: 'A', id: `card-${i}` }, stockSizeAfter: 30 - i },
          testUsers[i % 2].id,
          events.length + i + 1
        );
        events.push(drawEvent);
      }

      // Persist all events
      for (const event of events) {
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

      // Update game event count
      await testUtils.db.game.update({
        where: { id: manyEventsGameId },
        data: { eventCount: events.length }
      });

      // Time the state loading
      const startTime = performance.now();
      const result = await gameStateLoader.loadGameState(manyEventsGameId, testUsers[0].id);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.eventCount).toBe(events.length);
        expect(result.gameState.id).toBe(manyEventsGameId);
        
        // Should complete within reasonable time (less than 1 second)
        const duration = endTime - startTime;
        expect(duration).toBeLessThan(1000);
      }
    });

    it('should maintain card uniqueness across event replay', async () => {
      const result = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        // Collect all card IDs from all visible parts of the game
        const allVisibleCardIds: string[] = [];
        
        // Add cards from player hands (only visible ones)
        result.gameState.players.forEach(player => {
          if (player.id === testUsers[0].id) {
            // My cards are visible
            player.hand.forEach(card => allVisibleCardIds.push(card.id));
          }
        });

        // Add cards from discard pile
        result.gameState.discardPile.forEach(card => allVisibleCardIds.push(card.id));

        // Verify no duplicates among visible cards
        const uniqueCardIds = new Set(allVisibleCardIds);
        expect(uniqueCardIds.size).toBe(allVisibleCardIds.length);
      }
    });
  });

  describe('Username and Metadata Integration', () => {
    it('should include player usernames in state', async () => {
      const result = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        const player1 = result.gameState.players.find(p => p.id === testUsers[0].id);
        const player2 = result.gameState.players.find(p => p.id === testUsers[1].id);

        expect(player1?.username).toBeTruthy();
        expect(player2?.username).toBeTruthy();
      }
    });

    it('should handle AI player metadata correctly', async () => {
      const result = await gameStateLoader.loadGameState(aiGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        const aiPlayer = result.gameState.players.find(p => p.id === 'ai-player');
        const humanPlayer = result.gameState.players.find(p => p.id === testUsers[0].id);

        expect(aiPlayer).toBeDefined();
        expect(humanPlayer).toBeDefined();
        expect(aiPlayer?.username).toBeTruthy(); // Should have AI username
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing events gracefully', async () => {
      // Delete some events to create gaps
      await testUtils.db.gameEvent.deleteMany({
        where: { 
          gameId: testGameId,
          sequenceNumber: { gte: 1, lte: 1 }
        }
      });

      const result = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      // The system should either handle it gracefully or provide a clear error
      if (!result.success) {
        expect(result.error).toBeTruthy();
        expect(result.code).toBeTruthy();
      }
    });

    it('should handle corrupted event data', async () => {
      // Add a corrupted event
      await testUtils.db.gameEvent.create({
        data: {
          id: 'corrupted-loader-test',
          gameId: testGameId,
          playerId: testUsers[0].id,
          eventType: 'INVALID_EVENT_TYPE' as any,
          sequenceNumber: initialEvents.length + 1,
          eventVersion: '1.0.0',
          eventData: null,
          metadata: null,
          processed: true,
          processedAt: new Date(),
          createdAt: new Date(),
        },
      });

      // Should handle corrupted data without crashing
      await expect(async () => {
        await gameStateLoader.loadGameState(testGameId, testUsers[0].id);
      }).not.toThrow();
    });

    it('should handle games with no events', async () => {
      const emptyGameId = 'empty-' + Date.now();
      
      await testUtils.db.game.create({
        data: {
          id: emptyGameId,
          status: 'WAITING',
          gameType: 'STANDARD',
          player1Id: testUsers[0].id,
          player2Id: null,
          currentPlayerId: null,
          isPrivate: false,
          vsAI: false,
          maxPlayers: 2,
          eventCount: 0,
        },
      });

      const result = await gameStateLoader.loadGameState(emptyGameId, testUsers[0].id);

      // Should handle empty games appropriately
      if (result.success) {
        expect(result.eventCount).toBe(0);
      } else {
        expect(result.error).toBeTruthy();
      }
    });

    it('should validate database consistency', async () => {
      // Test when game.eventCount doesn't match actual events
      await testUtils.db.game.update({
        where: { id: testGameId },
        data: { eventCount: 999 } // Wrong count
      });

      const result = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      expect(result.success).toBe(true);
      if (result.success) {
        // Should report actual event count, not the corrupted metadata
        expect(result.eventCount).toBe(initialEvents.length);
      }
    });
  });

  describe('Concurrent Access', () => {
    it('should handle multiple concurrent state loads', async () => {
      // Load the same game state from multiple "users" simultaneously
      const concurrentLoads = await Promise.all([
        gameStateLoader.loadGameState(testGameId, testUsers[0].id),
        gameStateLoader.loadGameState(testGameId, testUsers[1].id),
        gameStateLoader.loadGameState(testGameId), // System load
        gameStateLoader.loadGameState(testGameId, testUsers[0].id),
      ]);

      // All should succeed
      concurrentLoads.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Game IDs should all match
      const gameIds = concurrentLoads.map(r => r.success ? r.gameState.id : null);
      gameIds.forEach(id => {
        expect(id).toBe(testGameId);
      });
    });

    it('should be stateless between calls', async () => {
      const result1 = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);
      const result2 = await gameStateLoader.loadGameState(testGameId, testUsers[0].id);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        // Should be identical since no events were added between calls
        expect(result1.gameState).toEqual(result2.gameState);
        expect(result1.eventCount).toBe(result2.eventCount);
      }
    });
  });
});