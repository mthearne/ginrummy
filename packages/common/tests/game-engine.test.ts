import { describe, it, expect } from 'vitest';
import { GinRummyGame, createDeck, shuffleDeck, getCardValue, calculateDeadwood, isValidSet, isValidRun } from '../src';
import { Suit, Rank, MoveType } from '../src/types/game';

describe('Card utilities', () => {
  it('should create a standard 52-card deck', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    
    // Check all suits and ranks are present
    const suits = new Set(deck.map(card => card.suit));
    const ranks = new Set(deck.map(card => card.rank));
    
    expect(suits.size).toBe(4);
    expect(ranks.size).toBe(13);
  });

  it('should shuffle deck', () => {
    const originalDeck = createDeck();
    const shuffledDeck = shuffleDeck([...originalDeck]);
    
    expect(shuffledDeck).toHaveLength(52);
    // Very unlikely to be in the same order
    expect(shuffledDeck).not.toEqual(originalDeck);
  });

  it('should calculate card values correctly', () => {
    expect(getCardValue({ suit: Suit.Hearts, rank: Rank.Ace, id: 'test' })).toBe(1);
    expect(getCardValue({ suit: Suit.Hearts, rank: Rank.Five, id: 'test' })).toBe(5);
    expect(getCardValue({ suit: Suit.Hearts, rank: Rank.Ten, id: 'test' })).toBe(10);
    expect(getCardValue({ suit: Suit.Hearts, rank: Rank.Jack, id: 'test' })).toBe(10);
    expect(getCardValue({ suit: Suit.Hearts, rank: Rank.Queen, id: 'test' })).toBe(10);
    expect(getCardValue({ suit: Suit.Hearts, rank: Rank.King, id: 'test' })).toBe(10);
  });
});

describe('Meld validation', () => {
  it('should validate sets correctly', () => {
    const validSet = [
      { suit: Suit.Hearts, rank: Rank.Seven, id: '1' },
      { suit: Suit.Diamonds, rank: Rank.Seven, id: '2' },
      { suit: Suit.Clubs, rank: Rank.Seven, id: '3' },
    ];
    expect(isValidSet(validSet)).toBe(true);

    const invalidSet = [
      { suit: Suit.Hearts, rank: Rank.Seven, id: '1' },
      { suit: Suit.Diamonds, rank: Rank.Eight, id: '2' },
      { suit: Suit.Clubs, rank: Rank.Seven, id: '3' },
    ];
    expect(isValidSet(invalidSet)).toBe(false);
  });

  it('should validate 4-card sets correctly', () => {
    const validFourCardSet = [
      { suit: Suit.Hearts, rank: Rank.Seven, id: '1' },
      { suit: Suit.Diamonds, rank: Rank.Seven, id: '2' },
      { suit: Suit.Clubs, rank: Rank.Seven, id: '3' },
      { suit: Suit.Spades, rank: Rank.Seven, id: '4' },
    ];
    expect(isValidSet(validFourCardSet)).toBe(true);

    const invalidFourCardSet = [
      { suit: Suit.Hearts, rank: Rank.Seven, id: '1' },
      { suit: Suit.Hearts, rank: Rank.Seven, id: '2' }, // Duplicate suit
      { suit: Suit.Clubs, rank: Rank.Seven, id: '3' },
      { suit: Suit.Spades, rank: Rank.Seven, id: '4' },
    ];
    expect(isValidSet(invalidFourCardSet)).toBe(false);
  });

  it('should validate runs correctly', () => {
    const validRun = [
      { suit: Suit.Hearts, rank: Rank.Five, id: '1' },
      { suit: Suit.Hearts, rank: Rank.Six, id: '2' },
      { suit: Suit.Hearts, rank: Rank.Seven, id: '3' },
    ];
    expect(isValidRun(validRun)).toBe(true);

    const invalidRun = [
      { suit: Suit.Hearts, rank: Rank.Five, id: '1' },
      { suit: Suit.Diamonds, rank: Rank.Six, id: '2' },
      { suit: Suit.Hearts, rank: Rank.Seven, id: '3' },
    ];
    expect(isValidRun(invalidRun)).toBe(false);
  });
});

describe('Scoring', () => {
  it('should calculate deadwood correctly', () => {
    const hand = [
      { suit: Suit.Hearts, rank: Rank.Ace, id: '1' },
      { suit: Suit.Diamonds, rank: Rank.King, id: '2' },
      { suit: Suit.Clubs, rank: Rank.Five, id: '3' },
    ];
    
    const deadwood = calculateDeadwood(hand, []);
    expect(deadwood).toBe(16); // 1 + 10 + 5
  });
});

describe('GinRummyGame', () => {
  it('should initialize game correctly', () => {
    const game = new GinRummyGame('test-game', 'player1', 'player2');
    const state = game.getState();
    
    expect(state.id).toBe('test-game');
    expect(state.players).toHaveLength(2);
    expect(state.players[0].hand).toHaveLength(10);
    expect(state.players[1].hand).toHaveLength(10);
    expect(state.discardPile).toHaveLength(1);
    expect(state.stockPileCount).toBe(31); // 52 - 20 - 1
  });

  it('should handle draw stock move', () => {
    const game = new GinRummyGame('test-game', 'player1', 'player2');
    
    // First handle upcard decision phase
    game.makeMove({
      type: MoveType.PassUpcard,
      playerId: 'player2',
    });
    game.makeMove({
      type: MoveType.PassUpcard,
      playerId: 'player1',
    });
    
    // Now in draw phase for player2
    const result = game.makeMove({
      type: MoveType.DrawStock,
      playerId: 'player2',
    });
    
    expect(result.success).toBe(true);
    
    const state = result.state;
    expect(state.players[1].hand).toHaveLength(11);
    expect(state.phase).toBe('discard');
  });

  it('should reject invalid moves', () => {
    const game = new GinRummyGame('test-game', 'player1', 'player2');
    
    // Try to discard when in upcard decision phase
    const result = game.makeMove({
      type: MoveType.Discard,
      playerId: 'player2',
      cardId: 'invalid',
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should handle player turns correctly', () => {
    const game = new GinRummyGame('test-game', 'player1', 'player2');
    let state = game.getState();
    
    // Game starts with player2 (non-dealer) having upcard decision
    expect(state.currentPlayerId).toBe('player2');
    expect(state.phase).toBe('upcard_decision');
    
    // Player 2 passes upcard
    game.makeMove({
      type: MoveType.PassUpcard,
      playerId: 'player2',
    });
    
    // Now player 1 (dealer) can decide
    state = game.getState();
    expect(state.currentPlayerId).toBe('player1');
    
    // Player 1 also passes
    game.makeMove({
      type: MoveType.PassUpcard,
      playerId: 'player1',
    });
    
    // Now player 2 draws from stock
    state = game.getState();
    expect(state.currentPlayerId).toBe('player2');
    expect(state.phase).toBe('draw');
    
    game.makeMove({
      type: MoveType.DrawStock,
      playerId: 'player2',
    });
    
    // Player 2 discards
    const player2Hand = game.getState().players[1].hand;
    const result = game.makeMove({
      type: MoveType.Discard,
      playerId: 'player2',
      cardId: player2Hand[0].id,
    });
    
    expect(result.success).toBe(true);
    
    state = result.state;
    expect(state.currentPlayerId).toBe('player1');
    expect(state.phase).toBe('draw');
  });
});