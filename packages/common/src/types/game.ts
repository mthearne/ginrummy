import { z } from 'zod';

export enum Suit {
  Hearts = 'hearts',
  Diamonds = 'diamonds',
  Clubs = 'clubs',
  Spades = 'spades',
}

export enum Rank {
  Ace = 'A',
  Two = '2',
  Three = '3',
  Four = '4',
  Five = '5',
  Six = '6',
  Seven = '7',
  Eight = '8',
  Nine = '9',
  Ten = '10',
  Jack = 'J',
  Queen = 'Q',
  King = 'K',
}

export interface Card {
  suit: Suit;
  rank: Rank;
  id: string;
}

export enum GameStatus {
  Waiting = 'WAITING',
  Active = 'ACTIVE',
  Finished = 'FINISHED',
}

export enum GamePhase {
  UpcardDecision = 'upcard_decision',
  Draw = 'draw',
  Discard = 'discard',
  RoundOver = 'round_over',
  GameOver = 'game_over',
}

export enum MoveType {
  TakeUpcard = 'take_upcard',
  PassUpcard = 'pass_upcard',
  DrawStock = 'draw_stock',
  DrawDiscard = 'draw_discard',
  Discard = 'discard',
  Knock = 'knock',
  Gin = 'gin',
  StartNewRound = 'start_new_round',
}

export interface Meld {
  type: 'run' | 'set';
  cards: Card[];
}

export interface GameMove {
  type: MoveType;
  playerId: string;
  cardId?: string;
  melds?: Meld[];
  gameId?: string; // Optional for API calls
}

export interface PlayerState {
  id: string;
  username: string;
  hand: Card[];
  handSize: number; // For opponent view
  score: number;
  hasKnocked: boolean;
  hasGin: boolean;
  deadwood: number;
  melds: Meld[];
  lastDrawnCardId?: string; // ID of the most recently drawn card for UI highlighting
}

export interface GameState {
  id: string;
  status: GameStatus;
  phase: GamePhase;
  currentPlayerId: string;
  players: PlayerState[];
  stockPileCount: number;
  discardPile: Card[];
  turnTimer: number;
  isPrivate: boolean;
  vsAI: boolean;
  winner?: string;
  gameOver: boolean;
  roundScores?: { [playerId: string]: number };
}

export interface CreateGameRequest {
  vsAI?: boolean;
  isPrivate?: boolean;
  maxPlayers?: number;
}

export const CreateGameSchema = z.object({
  vsAI: z.boolean().optional().default(false),
  isPrivate: z.boolean().optional().default(false),
  maxPlayers: z.number().min(2).max(2).optional().default(2),
});

export interface GameListItem {
  id: string;
  status: GameStatus;
  playerCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  vsAI: boolean;
  createdAt: string;
}

export interface GameResult {
  gameId: string;
  winner: string;
  loser: string;
  winnerScore: number;
  loserScore: number;
  knockType: 'gin' | 'knock' | 'undercut';
  duration: number;
  createdAt: string;
}