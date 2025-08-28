import { GameState, GameStatus, GamePhase, PlayerState } from '../../src/types/game';
import { TEST_HANDS, SAMPLE_CARDS } from './hands';

/**
 * Test fixtures for various game states
 */

// Base player states
const createPlayer = (id: string, username: string, hand: any[] = []): PlayerState => ({
  id,
  username,
  hand: hand || [],
  handSize: hand?.length || 10,
  score: 0,
  hasKnocked: false,
  hasGin: false,
  deadwood: 0,
  melds: [],
  lastDrawnCardId: undefined,
});

// Common game state templates
export const GAME_STATES = {
  // Fresh game just started
  INITIAL_GAME: {
    id: 'test-game-1',
    status: GameStatus.Active,
    phase: GamePhase.UpcardDecision,
    currentPlayerId: 'player2', // Non-dealer gets first upcard decision
    players: [
      createPlayer('player1', 'Alice'),
      createPlayer('player2', 'Bob'),
    ],
    stockPileCount: 31, // 52 - 20 - 1
    discardPile: [SAMPLE_CARDS.KH], // Initial upcard
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: false,
  } as GameState,

  // Game in draw phase
  DRAW_PHASE_GAME: {
    id: 'test-game-2',
    status: GameStatus.Active,
    phase: GamePhase.Draw,
    currentPlayerId: 'player1',
    players: [
      createPlayer('player1', 'Alice', TEST_HANDS.POTENTIAL_MELDS_HAND),
      createPlayer('player2', 'Bob', []),
    ],
    stockPileCount: 30,
    discardPile: [SAMPLE_CARDS.KH, SAMPLE_CARDS.QS],
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: false,
  } as GameState,

  // Game in discard phase
  DISCARD_PHASE_GAME: {
    id: 'test-game-3',
    status: GameStatus.Active,
    phase: GamePhase.Discard,
    currentPlayerId: 'player1',
    players: [
      createPlayer('player1', 'Alice', [...TEST_HANDS.POTENTIAL_MELDS_HAND, SAMPLE_CARDS.KC]), // 11 cards
      createPlayer('player2', 'Bob', []),
    ],
    stockPileCount: 29,
    discardPile: [SAMPLE_CARDS.KH, SAMPLE_CARDS.QS],
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: false,
  } as GameState,

  // AI game in progress
  AI_GAME: {
    id: 'ai-game-1',
    status: GameStatus.Active,
    phase: GamePhase.Draw,
    currentPlayerId: 'ai-player',
    players: [
      createPlayer('player1', 'Human', TEST_HANDS.MIXED_MELDS_HAND),
      createPlayer('ai-player', 'AI Assistant', TEST_HANDS.POTENTIAL_MELDS_HAND),
    ],
    stockPileCount: 25,
    discardPile: [SAMPLE_CARDS.KH, SAMPLE_CARDS.QS, SAMPLE_CARDS.JC],
    turnTimer: 30,
    isPrivate: false,
    vsAI: true,
    gameOver: false,
  } as GameState,

  // Near-end game (low stock)
  LOW_STOCK_GAME: {
    id: 'low-stock-game',
    status: GameStatus.Active,
    phase: GamePhase.Draw,
    currentPlayerId: 'player1',
    players: [
      createPlayer('player1', 'Alice', TEST_HANDS.KNOCK_HAND),
      createPlayer('player2', 'Bob', TEST_HANDS.HIGH_DEADWOOD_HAND),
    ],
    stockPileCount: 3, // Near stock exhaustion
    discardPile: [SAMPLE_CARDS.KH, SAMPLE_CARDS.QS, SAMPLE_CARDS.JC, SAMPLE_CARDS.TenD],
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: false,
  } as GameState,

  // Round over (after knock/gin)
  ROUND_OVER_GAME: {
    id: 'round-over-game',
    status: GameStatus.Active,
    phase: GamePhase.RoundOver,
    currentPlayerId: 'player1',
    players: [
      {
        ...createPlayer('player1', 'Alice', TEST_HANDS.GIN_HAND.slice(0, 10)),
        hasGin: true,
        score: 25,
        melds: [
          { type: 'run', cards: [SAMPLE_CARDS.ThreeH, SAMPLE_CARDS.FourH, SAMPLE_CARDS.FiveH] },
          { type: 'set', cards: [SAMPLE_CARDS.SevenS, SAMPLE_CARDS.SevenC, SAMPLE_CARDS.SevenD] },
          { type: 'set', cards: [SAMPLE_CARDS.JS, SAMPLE_CARDS.JH, SAMPLE_CARDS.JD, SAMPLE_CARDS.JC] },
        ],
      },
      {
        ...createPlayer('player2', 'Bob', TEST_HANDS.HIGH_DEADWOOD_HAND.slice(0, 10)),
        score: 0,
        deadwood: 30,
        melds: [],
      },
    ],
    stockPileCount: 15,
    discardPile: [SAMPLE_CARDS.KH, SAMPLE_CARDS.QS, SAMPLE_CARDS.JC, SAMPLE_CARDS.TenD, SAMPLE_CARDS.KC],
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: false,
    roundScores: {
      'player1': 25,
      'player2': 0,
    },
  } as GameState,

  // Game over (someone reached 100 points)
  GAME_OVER: {
    id: 'game-over',
    status: GameStatus.Finished,
    phase: GamePhase.GameOver,
    currentPlayerId: 'player1',
    players: [
      {
        ...createPlayer('player1', 'Alice'),
        score: 105, // Winner
        hasGin: true,
      },
      {
        ...createPlayer('player2', 'Bob'),
        score: 75, // Loser
      },
    ],
    stockPileCount: 0,
    discardPile: [],
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: true,
    winner: 'player1',
    roundScores: {
      'player1': 30,
      'player2': 0,
    },
  } as GameState,

  // Waiting for second player
  WAITING_GAME: {
    id: 'waiting-game',
    status: GameStatus.Waiting,
    phase: GamePhase.UpcardDecision,
    currentPlayerId: '',
    players: [
      createPlayer('player1', 'Alice'),
    ],
    stockPileCount: 52,
    discardPile: [],
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: false,
  } as GameState,

  // Edge case: Empty stock (rare but possible)
  EMPTY_STOCK_GAME: {
    id: 'empty-stock-game',
    status: GameStatus.Active,
    phase: GamePhase.GameOver,
    currentPlayerId: 'player1',
    players: [
      {
        ...createPlayer('player1', 'Alice', TEST_HANDS.KNOCK_HAND),
        deadwood: 10,
      },
      {
        ...createPlayer('player2', 'Bob', TEST_HANDS.HIGH_DEADWOOD_HAND),
        deadwood: 50,
      },
    ],
    stockPileCount: 0, // Stock exhausted
    discardPile: [SAMPLE_CARDS.KH],
    turnTimer: 30,
    isPrivate: false,
    vsAI: false,
    gameOver: true,
  } as GameState,
};

// Scenarios for specific test cases
export const TEST_SCENARIOS = {
  // Player should be able to knock
  CAN_KNOCK: {
    gameState: GAME_STATES.DISCARD_PHASE_GAME,
    playerId: 'player1',
    expectedCanKnock: true,
  },

  // Player cannot knock (too much deadwood)
  CANNOT_KNOCK: {
    gameState: {
      ...GAME_STATES.DISCARD_PHASE_GAME,
      players: [
        createPlayer('player1', 'Alice', TEST_HANDS.HIGH_DEADWOOD_HAND),
        createPlayer('player2', 'Bob'),
      ],
    },
    playerId: 'player1',
    expectedCanKnock: false,
  },

  // AI should make optimal move
  AI_OPTIMAL_MOVE: {
    gameState: GAME_STATES.AI_GAME,
    expectedMoveType: 'draw_stock', // Or whatever is optimal
  },

  // Stock depletion should end game
  STOCK_DEPLETION: {
    gameState: {
      ...GAME_STATES.LOW_STOCK_GAME,
      stockPileCount: 2, // Will trigger end when drawn
    },
    expectedResult: 'game_over',
  },

  // Turn sequence validation
  TURN_SEQUENCE: {
    gameState: GAME_STATES.DRAW_PHASE_GAME,
    validPlayer: 'player1',
    invalidPlayer: 'player2',
  },
};