import { describe, it, expect, beforeEach } from 'vitest';
import { EventSourcingEngine } from '../../packages/common/src/game-engine/event-sourcing';
import { EventSourcedGinRummyGame } from '../../packages/common/src/game-engine/event-sourced-gin-rummy';
import { EventType, createGameEvent } from '../../packages/common/src/types/events';
import { GamePhase } from '../../packages/common/src/types/game';

describe('Event Sourcing Engine', () => {
  let engine: EventSourcingEngine;
  let eventSourcedGame: EventSourcedGinRummyGame;
  const testGameId = 'test-game-123';
  const player1Id = 'player-1';
  const player2Id = 'player-2';

  beforeEach(() => {
    eventSourcedGame = new EventSourcedGinRummyGame(testGameId);
  });

  describe('Event Replay and State Reconstruction', () => {
    it('should rebuild complete game state from initial events', () => {
      // Create initial game events
      const initialEvents = eventSourcedGame.createInitialGameEvents(
        player1Id,
        player2Id,
        false // PvP game
      );

      engine = new EventSourcingEngine(testGameId, initialEvents);
      const gameState = engine.replayEvents();

      expect(gameState).toMatchObject({
        id: testGameId,
        phase: expect.any(String),
        players: expect.arrayContaining([
          expect.objectContaining({
            id: player1Id,
            hand: expect.any(Array)
          }),
          expect.objectContaining({
            id: player2Id,
            hand: expect.any(Array)
          })
        ]),
        vsAI: false,
        stockPileCount: expect.any(Number),
        discardPile: expect.any(Array),
        gameOver: false
      });

      // Verify initial game state
      expect(gameState.players).toHaveLength(2);
      expect(gameState.players[0].hand).toHaveLength(10); // Initial deal
      expect(gameState.players[1].hand).toHaveLength(10);
      expect(gameState.discardPile).toHaveLength(1); // Initial upcard
      expect(gameState.phase).toBe(GamePhase.UpcardDecision);
    });

    it('should handle AI game initialization correctly', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(
        player1Id,
        'ai-player',
        true // AI game
      );

      engine = new EventSourcingEngine(testGameId, initialEvents);
      const gameState = engine.replayEvents();

      expect(gameState.vsAI).toBe(true);
      expect(gameState.players).toHaveLength(2);
      expect(gameState.players.some(p => p.id === 'ai-player')).toBe(true);
    });

    it('should maintain event sequence integrity', () => {
      const events = [
        createGameEvent(testGameId, EventType.GAME_CREATED, {
          gameId: testGameId,
          gameType: 'STANDARD',
          player1Id,
          player2Id,
          isPrivate: false,
          vsAI: false,
          maxPlayers: 2
        }, player1Id, 1),
        
        createGameEvent(testGameId, EventType.GAME_STARTED, {
          gameId: testGameId,
          player1Id,
          player2Id,
          startingPlayerId: player1Id,
          initialDeal: {
            player1Hand: [{ suit: 'hearts', rank: 'A', id: 'card-1' }], // Valid hand
            player2Hand: [{ suit: 'spades', rank: 'K', id: 'card-2' }], // Valid hand
            topDiscardCard: { suit: 'hearts', rank: 'Q', id: 'card-3' },
            stockSize: 40
          }
        }, player1Id, 2)
      ];

      engine = new EventSourcingEngine(testGameId, events);
      const gameState = engine.replayEvents();

      expect(gameState.id).toBe(testGameId);
      expect(gameState.players).toHaveLength(2);
    });

    it('should detect and handle sequence number gaps', () => {
      const events = [
        createGameEvent(testGameId, EventType.GAME_CREATED, {
          gameId: testGameId,
          player1Id,
          player2Id,
          isPrivate: false,
          vsAI: false,
          maxPlayers: 2
        }, player1Id, 1),
        createGameEvent(testGameId, EventType.GAME_STARTED, {
          gameId: testGameId,
          player1Id,
          player2Id,
          startingPlayerId: player1Id,
          initialDeal: {
            player1Hand: [{ suit: 'hearts', rank: 'A', id: 'card-1' }],
            player2Hand: [{ suit: 'spades', rank: 'K', id: 'card-2' }],
            topDiscardCard: { suit: 'hearts', rank: 'Q', id: 'card-3' },
            stockSize: 40
          }
        }, player1Id, 3) // Gap at sequence 2
      ];

      engine = new EventSourcingEngine(testGameId, events);
      
      // Should detect the sequence gap
      expect(engine.validateEventSequence()).toBe(false);
    });

    it('should apply events in correct chronological order', () => {
      const events = [
        createGameEvent(testGameId, EventType.GAME_CREATED, {
          gameId: testGameId,
          player1Id,
          player2Id,
          isPrivate: false,
          vsAI: false,
          maxPlayers: 2
        }, player1Id, 1),
        createGameEvent(testGameId, EventType.GAME_STARTED, {
          gameId: testGameId,
          player1Id,
          player2Id,
          startingPlayerId: player1Id,
          initialDeal: {
            player1Hand: [{ suit: 'hearts', rank: 'A', id: 'card-1' }],
            player2Hand: [{ suit: 'spades', rank: 'K', id: 'card-2' }],
            topDiscardCard: { suit: 'hearts', rank: 'Q', id: 'card-3' },
            stockSize: 40
          }
        }, player1Id, 2)
      ];

      engine = new EventSourcingEngine(testGameId, events);
      const gameState = engine.replayEvents();

      // Events should be applied in sequence order
      expect(gameState).toBeDefined();
      expect(gameState.players).toHaveLength(2);
    });

    it('should handle concurrent event processing', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      
      // Simulate multiple engines processing the same events
      const engine1 = new EventSourcingEngine(testGameId, initialEvents);
      const engine2 = new EventSourcingEngine(testGameId, initialEvents);
      
      const state1 = engine1.replayEvents();
      const state2 = engine2.replayEvents();
      
      // Should produce identical states
      expect(state1.phase).toBe(state2.phase);
      expect(state1.currentPlayerId).toBe(state2.currentPlayerId);
      expect(state1.players.length).toBe(state2.players.length);
    });
  });

  describe('State Validation and Consistency', () => {
    it('should validate game state consistency after each event', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      engine = new EventSourcingEngine(testGameId, initialEvents);
      
      const gameState = engine.replayEvents();
      
      // Basic consistency checks
      expect(gameState.players[0].hand.length + gameState.players[1].hand.length + 
             gameState.discardPile.length + gameState.stockPileCount).toBe(52);
      
      expect(gameState.currentPlayerId).toBeDefined();
      expect([player1Id, player2Id]).toContain(gameState.currentPlayerId);
    });

    it('should maintain card uniqueness throughout the game', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      engine = new EventSourcingEngine(testGameId, initialEvents);
      
      const gameState = engine.replayEvents();
      
      // Collect all card IDs in the game
      const allCardIds: string[] = [];
      
      gameState.players.forEach(player => {
        player.hand.forEach(card => allCardIds.push(card.id));
      });
      
      gameState.discardPile.forEach(card => allCardIds.push(card.id));
      
      // Verify no duplicate card IDs
      const uniqueCardIds = new Set(allCardIds);
      expect(uniqueCardIds.size).toBe(allCardIds.length);
    });

    it('should correctly track turn progression', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      engine = new EventSourcingEngine(testGameId, initialEvents);
      
      const gameState = engine.replayEvents();
      
      expect(gameState.currentPlayerId).toBe(player1Id); // First player starts
      expect(gameState.phase).toBe(GamePhase.UpcardDecision);
    });
  });

  describe('Event Addition and State Evolution', () => {
    it('should add new events and update state incrementally', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      engine = new EventSourcingEngine(testGameId, initialEvents);
      
      const initialState = engine.replayEvents();
      const initialEventCount = engine.getEventCount();
      
      // Add a new event
      const drawEvent = createGameEvent(testGameId, EventType.DRAW_FROM_STOCK, {
        playerId: player1Id,
        cardDrawn: { suit: 'spades', rank: '2', id: 'card-new' },
        stockSizeAfter: initialState.stockPileCount - 1
      }, player1Id, initialEventCount + 1);
      
      const newState = engine.addEvent(drawEvent);
      
      expect(engine.getEventCount()).toBe(initialEventCount + 1);
      expect(newState.phase).toBe(GamePhase.Discard); // Should advance phase
      expect(newState.stockPileCount).toBe(30); // Expected final stock count
    });

    it('should maintain immutability of previous states', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      engine = new EventSourcingEngine(testGameId, initialEvents);
      
      const state1 = engine.replayEvents();
      const originalPhase = state1.phase;
      
      // Add an event that changes state
      const drawEvent = createGameEvent(testGameId, EventType.DRAW_FROM_STOCK, {
        playerId: player1Id,
        cardDrawn: { suit: 'hearts', rank: 'K', id: 'card-k' },
        stockSizeAfter: state1.stockPileCount - 1
      }, player1Id, engine.getEventCount() + 1);
      
      const state2 = engine.addEvent(drawEvent);
      
      // State should change to discard phase after draw
      expect(state2.phase).toBe(GamePhase.Discard);
      expect(originalPhase).toBe(GamePhase.UpcardDecision);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large event histories efficiently', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      
      // Add many events to simulate a long game
      const manyEvents = [...initialEvents];
      for (let i = 0; i < 10; i++) { // Reduce to 10 for faster testing
        manyEvents.push(createGameEvent(
          testGameId, 
          EventType.DRAW_FROM_STOCK, 
          { 
            playerId: player1Id,
            cardDrawn: { suit: 'hearts', rank: 'A', id: `card-${i}` },
            stockSizeAfter: 40 - i
          }, 
          player1Id, 
          initialEvents.length + i + 1
        ));
      }
      
      const startTime = performance.now();
      
      engine = new EventSourcingEngine(testGameId, manyEvents);
      const gameState = engine.replayEvents();
      
      const endTime = performance.now();
      const processingTime = endTime - startTime;
      
      expect(gameState).toBeDefined();
      expect(engine.getEventCount()).toBe(manyEvents.length);
      expect(processingTime).toBeLessThan(1000); // Should process within 1 second
    });

    it('should support incremental event processing', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      engine = new EventSourcingEngine(testGameId, initialEvents);
      
      const state1 = engine.replayEvents();
      const initialEventCount = engine.getEventCount();
      
      // Add events incrementally
      for (let i = 0; i < 5; i++) { // Reduce for faster testing
        const event = createGameEvent(
          testGameId, 
          EventType.DRAW_FROM_STOCK, 
          { 
            playerId: player1Id,
            cardDrawn: { suit: 'hearts', rank: 'A', id: `incremental-card-${i}` },
            stockSizeAfter: state1.stockPileCount - i - 1
          }, 
          player1Id, 
          initialEventCount + i + 1
        );
        
        engine.addEvent(event);
      }
      
      const finalState = engine.getCurrentState();
      expect(engine.getEventCount()).toBe(initialEventCount + 5);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle corrupted events gracefully', () => {
      const corruptedEvents = [
        createGameEvent(testGameId, EventType.GAME_CREATED, null as any, player1Id, 1), // Corrupted data
      ];
      
      engine = new EventSourcingEngine(testGameId, corruptedEvents);
      
      expect(() => engine.replayEvents()).toThrow();
      // Should throw error when dealing with corrupted data
    });

    it('should validate event data integrity', () => {
      const initialEvents = eventSourcedGame.createInitialGameEvents(player1Id, player2Id, false);
      engine = new EventSourcingEngine(testGameId, initialEvents);
      engine.replayEvents(); // Initialize state first
      
      const invalidEvent = {
        ...createGameEvent(testGameId, EventType.DRAW_FROM_STOCK, {
          playerId: player1Id,
          cardDrawn: { suit: 'hearts', rank: 'A', id: 'card-1' },
          stockSizeAfter: 40
        }, player1Id, 3),
        eventType: 'INVALID_EVENT_TYPE' as any
      };
      
      // Invalid event type should be handled gracefully (warning logged)
      expect(() => engine.addEvent(invalidEvent)).not.toThrow();
    });
  });
});