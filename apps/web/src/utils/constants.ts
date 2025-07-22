import { Suit, Rank } from '@gin-rummy/common';

export const CARD_SUITS = [
  { suit: Suit.Hearts, symbol: '♥', color: 'red' },
  { suit: Suit.Diamonds, symbol: '♦', color: 'red' },
  { suit: Suit.Clubs, symbol: '♣', color: 'black' },
  { suit: Suit.Spades, symbol: '♠', color: 'black' },
];

export const CARD_RANKS = [
  { rank: Rank.Ace, display: 'A' },
  { rank: Rank.Two, display: '2' },
  { rank: Rank.Three, display: '3' },
  { rank: Rank.Four, display: '4' },
  { rank: Rank.Five, display: '5' },
  { rank: Rank.Six, display: '6' },
  { rank: Rank.Seven, display: '7' },
  { rank: Rank.Eight, display: '8' },
  { rank: Rank.Nine, display: '9' },
  { rank: Rank.Ten, display: '10' },
  { rank: Rank.Jack, display: 'J' },
  { rank: Rank.Queen, display: 'Q' },
  { rank: Rank.King, display: 'K' },
];

export const GAME_PHASES = {
  DRAW: 'draw',
  DISCARD: 'discard',
  GAME_OVER: 'game_over',
} as const;

export const MOVE_TYPES = {
  DRAW_STOCK: 'draw_stock',
  DRAW_DISCARD: 'draw_discard',
  DISCARD: 'discard',
  KNOCK: 'knock',
  GIN: 'gin',
} as const;

export const GAME_RULES = {
  HAND_SIZE: 10,
  MAX_DEADWOOD_TO_KNOCK: 10,
  GIN_BONUS: 25,
  UNDERCUT_BONUS: 25,
  GAME_WINNING_SCORE: 100,
  TURN_TIME_LIMIT: 30, // seconds
} as const;

export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning',
} as const;

export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register',
  LOBBY: '/lobby',
  GAME: '/game',
  PROFILE: '/profile',
} as const;