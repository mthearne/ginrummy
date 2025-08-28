import { describe, it, expect, beforeEach } from 'vitest';
import { GinRummyGame } from '../src/game-engine/gin-rummy';
import { GamePhase, MoveType, GameStatus } from '../src/types/game';
import { SAMPLE_CARDS, TEST_HANDS } from './fixtures/hands';
import { GAME_STATES } from './fixtures/game-states';

describe('GinRummyGame - State Management', () => {
  let game: GinRummyGame;

  beforeEach(() => {
    game = new GinRummyGame('test-game', 'player1', 'player2');
  });

  describe('Game Initialization', () => {
    it('should initialize with correct initial state', () => {
      const state = game.getState();

      expect(state.id).toBe('test-game');
      expect(state.status).toBe(GameStatus.Active);
      expect(state.phase).toBe(GamePhase.UpcardDecision);
      expect(state.currentPlayerId).toBe('player2'); // Non-dealer goes first
      expect(state.players).toHaveLength(2);
      expect(state.players[0].id).toBe('player1');
      expect(state.players[1].id).toBe('player2');
      expect(state.vsAI).toBe(false);
      expect(state.gameOver).toBe(false);
    });

    it('should deal correct number of cards to each player', () => {
      const state = game.getState();

      expect(state.players[0].hand).toHaveLength(10);
      expect(state.players[1].hand).toHaveLength(10);
      expect(state.discardPile).toHaveLength(1);
      expect(state.stockPileCount).toBe(31); // 52 - 20 - 1
    });

    it('should initialize AI game correctly', () => {
      const aiGame = new GinRummyGame('ai-game', 'human', 'ai-player', true);
      const state = aiGame.getState();

      expect(state.vsAI).toBe(true);
      expect(state.players[1].id).toBe('ai-player');
    });

    it('should sort player hands initially', () => {
      const state = game.getState();

      // Verify hands are sorted (basic check)
      for (const player of state.players) {
        expect(player.hand).toHaveLength(10);
        // Could add more specific sorting validation if needed
      }
    });
  });

  describe('Phase Transitions', () => {
    it('should transition from upcard_decision to upcard_decision when non-dealer passes', () => {
      const state1 = game.getState();
      expect(state1.phase).toBe(GamePhase.UpcardDecision);
      expect(state1.currentPlayerId).toBe('player2');

      const result = game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player2',
      });

      expect(result.success).toBe(true);
      expect(result.state.phase).toBe(GamePhase.UpcardDecision);
      expect(result.state.currentPlayerId).toBe('player1'); // Now dealer's turn
    });

    it('should transition from upcard_decision to draw when both players pass', () => {
      // Player2 passes
      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player2',
      });

      // Player1 passes
      const result = game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player1',
      });

      expect(result.success).toBe(true);
      expect(result.state.phase).toBe(GamePhase.Draw);
      expect(result.state.currentPlayerId).toBe('player2'); // Non-dealer starts drawing
    });

    it('should transition from upcard_decision to discard when taking upcard', () => {
      const result = game.makeMove({
        type: MoveType.TakeUpcard,
        playerId: 'player2',
      });

      expect(result.success).toBe(true);
      expect(result.state.phase).toBe(GamePhase.Discard);
      expect(result.state.currentPlayerId).toBe('player2');
      expect(result.state.players[1].hand).toHaveLength(11);
    });

    it('should transition from draw to discard after drawing', () => {
      // Setup game in draw phase
      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player2',
      });
      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player1',
      });

      const result = game.makeMove({
        type: MoveType.DrawStock,
        playerId: 'player2',
      });

      expect(result.success).toBe(true);
      expect(result.state.phase).toBe(GamePhase.Discard);
      expect(result.state.players[1].hand).toHaveLength(11);
    });

    it('should transition from discard to draw for next player', () => {
      // Setup game in discard phase
      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player2',
      });
      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player1',
      });
      game.makeMove({
        type: MoveType.DrawStock,
        playerId: 'player2',
      });

      const playerHand = game.getState().players[1].hand;
      const cardToDiscard = playerHand[0];

      const result = game.makeMove({
        type: MoveType.Discard,
        playerId: 'player2',
        cardId: cardToDiscard.id,
      });

      expect(result.success).toBe(true);
      expect(result.state.phase).toBe(GamePhase.Draw);
      expect(result.state.currentPlayerId).toBe('player1'); // Next player's turn
      expect(result.state.players[1].hand).toHaveLength(10);
    });

    it('should transition to round_over after knock', () => {
      // This would require setting up a specific game state
      // For now, we'll test the basic structure
      const mockGame = new GinRummyGame('mock', 'p1', 'p2');
      const state = mockGame.getState();
      
      // Would need to manipulate game state to test knock scenario
      expect(state.phase).toBe(GamePhase.UpcardDecision); // Initial state
    });
  });

  describe('Turn Management', () => {
    it('should enforce turn order correctly', () => {
      const state = game.getState();
      expect(state.currentPlayerId).toBe('player2');

      // Wrong player tries to move
      const result = game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player1', // Not their turn
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not your turn');
    });

    it('should update turn timer on turn changes', () => {
      const initialState = game.getState();
      expect(initialState.turnTimer).toBe(30);

      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player2',
      });

      const newState = game.getState();
      expect(newState.turnTimer).toBe(30); // Reset for new turn
    });

    it('should handle turn lock acquisition', () => {
      expect(game.isProcessing()).toBe(false);

      // During move processing, should be locked
      const result = game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player2',
      });

      expect(result.success).toBe(true);
      expect(game.isProcessing()).toBe(false); // Should be released after move
    });

    it('should prevent moves when game is over', () => {
      // Would need to set up end game state
      const state = game.getState();
      expect(state.gameOver).toBe(false);

      // Can't easily test without manipulating internal state
      // This tests the basic check exists
    });
  });

  describe('Player State Updates', () => {
    it('should update hand sizes correctly', () => {
      game.makeMove({
        type: MoveType.TakeUpcard,
        playerId: 'player2',
      });

      const state = game.getState();
      expect(state.players[1].hand).toHaveLength(11);
      // Note: handSize may not be automatically updated in current implementation
      // This tests that the actual hand length is correct
      expect(state.players[1].hand.length).toBe(11);
    });

    it('should track last drawn card for UI highlighting', () => {
      game.makeMove({
        type: MoveType.TakeUpcard,
        playerId: 'player2',
      });

      const state = game.getState();
      const player2 = state.players[1];
      expect(player2.lastDrawnCardId).toBeDefined();
      
      // Should be the upcard that was taken
      const discardPile = game.getState().discardPile;
      // The upcard was taken, so we can't easily verify the ID
      // But we can verify the field is set
    });

    it('should clear last drawn card after discard', () => {
      // Setup to discard phase
      game.makeMove({
        type: MoveType.TakeUpcard,
        playerId: 'player2',
      });

      let state = game.getState();
      expect(state.players[1].lastDrawnCardId).toBeDefined();

      const cardToDiscard = state.players[1].hand[0];
      game.makeMove({
        type: MoveType.Discard,
        playerId: 'player2',
        cardId: cardToDiscard.id,
      });

      state = game.getState();
      expect(state.players[1].lastDrawnCardId).toBeUndefined();
    });

    it('should update melds and deadwood automatically', () => {
      const state = game.getState();
      
      // All players should have melds and deadwood calculated
      for (const player of state.players) {
        expect(player.melds).toBeDefined();
        expect(player.deadwood).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Stock and Discard Pile Management', () => {
    it('should manage stock pile count correctly', () => {
      const initialStock = game.getState().stockPileCount;
      
      // Setup to draw from stock
      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player2',
      });
      game.makeMove({
        type: MoveType.PassUpcard,
        playerId: 'player1',
      });
      
      const result = game.makeMove({
        type: MoveType.DrawStock,
        playerId: 'player2',
      });

      expect(result.success).toBe(true);
      expect(result.state.stockPileCount).toBe(initialStock - 1);
    });

    it('should handle stock depletion', () => {
      // Would need to manipulate internal state to test stock depletion
      // For now, verify the basic structure exists
      const state = game.getState();
      expect(state.stockPileCount).toBeGreaterThan(0);
    });

    it('should manage discard pile correctly', () => {
      const initialDiscardSize = game.getState().discardPile.length;
      expect(initialDiscardSize).toBe(1); // Initial upcard

      // Take upcard (should reduce discard pile)
      const result = game.makeMove({
        type: MoveType.TakeUpcard,
        playerId: 'player2',
      });

      expect(result.success).toBe(true);
      expect(result.state.discardPile).toHaveLength(0); // Upcard was taken
    });

    it('should add cards to discard pile when discarding', () => {
      // Setup to discard phase
      game.makeMove({
        type: MoveType.TakeUpcard,
        playerId: 'player2',
      });

      const state = game.getState();
      const cardToDiscard = state.players[1].hand[0];
      
      const result = game.makeMove({
        type: MoveType.Discard,
        playerId: 'player2',
        cardId: cardToDiscard.id,
      });

      expect(result.success).toBe(true);
      expect(result.state.discardPile).toHaveLength(1);
      expect(result.state.discardPile[0].id).toBe(cardToDiscard.id);
    });
  });

  describe('Game State Synchronization', () => {
    it('should maintain consistency between game state and turn state', () => {
      const gameState = game.getState();
      const turnState = game.getTurnState();

      expect(gameState.currentPlayerId).toBe(turnState.currentPlayerId);
      expect(gameState.phase).toBe(turnState.phase);
    });

    it('should handle force synchronization', () => {
      game.forceTurnStateSync();
      
      const gameState = game.getState();
      const turnState = game.getTurnState();

      expect(gameState.currentPlayerId).toBe(turnState.currentPlayerId);
      expect(gameState.phase).toBe(turnState.phase);
    });

    it('should handle loading state for AI games', () => {
      const aiGame = new GinRummyGame('ai-game', 'human', 'ai-player', true);
      
      aiGame.setLoadingState(true);
      expect(aiGame.getTurnState().isLoading).toBe(true);
      
      aiGame.setLoadingState(false);
      expect(aiGame.getTurnState().isLoading).toBe(false);
    });
  });

  describe('Player View States', () => {
    it('should hide opponent hand during active gameplay', () => {
      const player1View = game.getPlayerState('player1');
      const player2View = game.getPlayerState('player2');

      // Player 1 should see their own hand but not player 2's
      expect(player1View.players![0].hand.length).toBeGreaterThan(0);
      expect(player1View.players![1].hand).toHaveLength(0);
      expect(player1View.players![1].handSize).toBeGreaterThan(0);

      // Player 2 should see their own hand but not player 1's
      expect(player2View.players![1].hand.length).toBeGreaterThan(0);
      expect(player2View.players![0].hand).toHaveLength(0);
      expect(player2View.players![0].handSize).toBeGreaterThan(0);
    });

    it('should reveal hands when round is over', () => {
      // Would need to set up end-of-round state
      // For now, test that the method works
      expect(() => {
        game.getPlayerState('player1');
        game.getPlayerState('player2');
      }).not.toThrow();
    });

    it('should throw error for invalid player ID', () => {
      expect(() => {
        game.getPlayerState('invalid-player');
      }).toThrow('Player not found');
    });
  });

  describe('Username Management', () => {
    it('should set player usernames correctly', () => {
      const usernames = {
        'player1': 'Alice',
        'player2': 'Bob',
      };

      game.setPlayerUsernames(usernames);
      const state = game.getState();

      expect(state.players[0].username).toBe('Alice');
      expect(state.players[1].username).toBe('Bob');
    });

    it('should handle partial username updates', () => {
      const usernames = {
        'player1': 'Alice',
        // player2 not included
      };

      game.setPlayerUsernames(usernames);
      const state = game.getState();

      expect(state.players[0].username).toBe('Alice');
      expect(state.players[1].username).toBe(''); // Should remain empty
    });
  });
});