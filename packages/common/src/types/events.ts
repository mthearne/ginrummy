import { z } from 'zod';
import { Card, Meld } from './game.js';

// Event Types for Event Sourcing
export enum EventType {
  // Game lifecycle
  GAME_CREATED = 'GAME_CREATED',
  GAME_STARTED = 'GAME_STARTED',
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_READY = 'PLAYER_READY',
  PLAYER_LEFT = 'PLAYER_LEFT',
  
  // Turn actions
  TAKE_UPCARD = 'TAKE_UPCARD',
  PASS_UPCARD = 'PASS_UPCARD',
  DRAW_FROM_STOCK = 'DRAW_FROM_STOCK',
  DRAW_FROM_DISCARD = 'DRAW_FROM_DISCARD',
  DISCARD_CARD = 'DISCARD_CARD',
  KNOCK = 'KNOCK',
  GIN = 'GIN',
  LAY_OFF = 'LAY_OFF',
  
  // Round management  
  START_NEW_ROUND = 'START_NEW_ROUND',
  ROUND_ENDED = 'ROUND_ENDED',
  LAYOFF_PHASE_STARTED = 'LAYOFF_PHASE_STARTED',
  AI_LAYOFF_DECISION = 'AI_LAYOFF_DECISION',
  LAYOFF_COMPLETED = 'LAYOFF_COMPLETED',
  
  // Game ending
  GAME_FINISHED = 'GAME_FINISHED',
  GAME_CANCELLED = 'GAME_CANCELLED',
  
  // AI actions
  AI_THINKING_STARTED = 'AI_THINKING_STARTED',
  AI_MOVE_COMPLETED = 'AI_MOVE_COMPLETED',
  
  // System events
  STATE_SNAPSHOT_CREATED = 'STATE_SNAPSHOT_CREATED',
  ERROR_RECOVERED = 'ERROR_RECOVERED',
}

// Base Event Interface
export interface BaseGameEvent {
  id: string;
  gameId: string;
  playerId?: string;
  eventType: EventType;
  sequenceNumber: number;
  eventVersion: number;
  metadata?: {
    timestamp: string;
    userAgent?: string;
    ipAddress?: string;
    sessionId?: string;
  };
  processed: boolean;
  processedAt?: string;
  createdAt: string;
}

// Event Data Payloads

export interface GameCreatedEventData {
  gameId: string;
  gameType: 'STANDARD' | 'HOLLYWOOD' | 'OKLAHOMA';
  player1Id: string;
  player2Id?: string;
  isPrivate: boolean;
  vsAI: boolean;
  maxPlayers: number;
}

export interface GameStartedEventData {
  gameId: string;
  player1Id: string;
  player2Id: string;
  startingPlayerId: string;
  initialDeal: {
    player1Hand: Card[];
    player2Hand: Card[];
    topDiscardCard: Card;
    stockSize: number;
    stockPile: Card[];
  };
}

export interface PlayerJoinedEventData {
  gameId: string;
  playerId: string;
  playerUsername: string;
}

export interface PlayerLeftEventData {
  gameId: string;
  playerId: string;
  reason: 'QUIT' | 'DISCONNECTED' | 'KICKED';
}

export interface TakeUpcardEventData {
  playerId: string;
  cardTaken: Card;
  discardPileAfter: Card[];
}

export interface PassUpcardEventData {
  playerId: string;
  nextPlayerId: string;
}

export interface DrawFromStockEventData {
  playerId: string;
  cardDrawn: Card;
  stockSizeAfter: number;
  newStockPile?: Card[]; // Updated stock pile after drawing
}

export interface DrawFromDiscardEventData {
  playerId: string;
  cardDrawn: Card;
  discardPileAfter: Card[];
}

export interface DiscardCardEventData {
  playerId: string;
  cardDiscarded: Card;
  discardPileAfter: Card[];
  nextPlayerId: string;
}

export interface KnockEventData {
  playerId: string;
  knockerHand: Card[]; // Hand after discarding (9 cards for game state)
  knockerFullHand?: Card[]; // Full hand before discarding (10 cards for display)
  knockerDeadwoodCards?: Card[]; // Specific deadwood cards for display
  knockerMelds: Meld[];
  deadwoodValue: number;
  cardDiscarded: Card; // Card discarded when knocking
  discardPileAfter: Card[]; // Updated discard pile after knock
  opponentHand: Card[];
  opponentMelds: Meld[];
  layOffs: {
    playerId: string;
    cards: Card[];
    targetMeld: Meld;
  }[];
  scores: {
    knocker: number;
    opponent: number;
  };
  roundResult: 'KNOCK' | 'UNDERCUT';
}

export interface GinEventData {
  playerId: string;
  ginnerHand: Card[];
  ginnerMelds: Meld[];
  opponentHand: Card[];
  opponentMelds: Meld[];
  scores: {
    ginner: number;
    opponent: number;
  };
}

export interface LayOffEventData {
  playerId: string;
  cardsLayedOff: Card[];
  targetMeld: Meld;
  deadwoodReduction: number;
}

export interface StartNewRoundEventData {
  playerId: string;
  gameId: string;
  roundNumber: number;
  newDeal: {
    player1Hand: Card[];
    player2Hand: Card[];
    topDiscardCard: Card;
    stockSize: number;
    stockPile?: Card[]; // Optional for backward compatibility
  };
}

export interface GameFinishedEventData {
  gameId: string;
  winnerId: string;
  winnerScore: number;
  loserId: string;
  loserScore: number;
  endReason: 'KNOCK' | 'GIN' | 'UNDERCUT' | 'QUIT' | 'TIME_LIMIT';
  duration: number;
}

export interface GameCancelledEventData {
  gameId: string;
  reason: 'PLAYER_QUIT' | 'INACTIVITY' | 'ERROR' | 'ADMIN';
  cancelledBy?: string;
}

export interface AIThinkingStartedEventData {
  playerId: string;
  thoughts: string[];
  estimatedDuration: number;
}

export interface AIMoveCompletedEventData {
  playerId: string;
  moveType: EventType;
  moveData: any; // Will be one of the above event data types
  thinkingDuration: number;
}

export interface StateSnapshotCreatedEventData {
  gameId: string;
  sequenceNumber: number;
  stateHash: string;
  createdBy: 'SYSTEM' | 'MANUAL';
}

export interface ErrorRecoveredEventData {
  gameId: string;
  errorType: string;
  errorMessage: string;
  recoveryAction: string;
  sequenceNumberBefore: number;
  sequenceNumberAfter: number;
}

export interface RoundEndedEventData {
  gameId: string;
  endType: 'KNOCK' | 'GIN';
  knockerId: string;
  knockerMelds: Meld[];
  opponentId: string;
  opponentMelds: Meld[];
  scores: {
    knocker: number;
    opponent: number;
  };
}

export interface LayoffPhaseStartedEventData {
  gameId: string;
  roundEndEventId: string;
  knockerId: string;
  opponentId: string;
  availableLayoffs: Array<{ cards: Card[]; targetMeld: Meld }>;
}

export interface AILayoffDecisionEventData {
  gameId: string;
  playerId: string;
  decision: 'LAYOFF' | 'SKIP';
  selectedLayoffs: Array<{ cards: Card[]; targetMeld: Meld }>;
  totalValueLaidOff: number;
}

export interface LayoffCompletedEventData {
  gameId: string;
  playerId: string;
  layoffs: Array<{ cards: Card[]; targetMeld: Meld }>;
  scoreAdjustment: number;
  finalScores: {
    knocker: number;
    opponent: number;
  };
}

// Union type for all event data
export type GameEventData = 
  | GameCreatedEventData
  | GameStartedEventData
  | PlayerJoinedEventData
  | PlayerLeftEventData
  | TakeUpcardEventData
  | PassUpcardEventData
  | DrawFromStockEventData
  | DrawFromDiscardEventData
  | DiscardCardEventData
  | KnockEventData
  | GinEventData
  | LayOffEventData
  | StartNewRoundEventData
  | RoundEndedEventData
  | LayoffPhaseStartedEventData
  | AILayoffDecisionEventData
  | LayoffCompletedEventData
  | GameFinishedEventData
  | GameCancelledEventData
  | AIThinkingStartedEventData
  | AIMoveCompletedEventData
  | StateSnapshotCreatedEventData
  | ErrorRecoveredEventData;

// Typed Game Event
export interface GameEvent<T extends GameEventData = GameEventData> extends BaseGameEvent {
  eventData: T;
}

// Action Schemas for Validation
export const PassUpcardSchema = z.object({
  type: z.literal('pass_upcard'),
  gameId: z.string(),
  playerId: z.string(),
});

export const TakeUpcardSchema = z.object({
  type: z.literal('take_upcard'),
  gameId: z.string(),
  playerId: z.string(),
});

export const DrawFromStockSchema = z.object({
  type: z.literal('draw_stock'),
  gameId: z.string(),
  playerId: z.string(),
});

export const DrawFromDiscardSchema = z.object({
  type: z.literal('draw_discard'),
  gameId: z.string(),
  playerId: z.string(),
});

export const DiscardCardSchema = z.object({
  type: z.literal('discard'),
  gameId: z.string(),
  playerId: z.string(),
  cardId: z.string(),
});

export const KnockSchema = z.object({
  type: z.literal('knock'),
  gameId: z.string(),
  playerId: z.string(),
  melds: z.array(z.object({
    type: z.enum(['run', 'set']),
    cards: z.array(z.object({
      suit: z.string(),
      rank: z.string(),
      id: z.string(),
    })),
  })),
});

export const GinSchema = z.object({
  type: z.literal('gin'),
  gameId: z.string(),
  playerId: z.string(),
  melds: z.array(z.object({
    type: z.enum(['run', 'set']),
    cards: z.array(z.object({
      suit: z.string(),
      rank: z.string(),
      id: z.string(),
    })),
  })),
});

export const StartNewRoundSchema = z.object({
  type: z.literal('START_NEW_ROUND'),
  gameId: z.string(),
  playerId: z.string(),
});

// Game Actions (user intents that generate events)
export interface BaseGameAction {
  type: EventType;
  gameId: string;
  playerId: string;
}

export interface PassUpcardAction extends BaseGameAction {
  type: EventType.PASS_UPCARD;
}

export interface TakeUpcardAction extends BaseGameAction {
  type: EventType.TAKE_UPCARD;
}

export interface DrawFromStockAction extends BaseGameAction {
  type: EventType.DRAW_FROM_STOCK;
}

export interface DrawFromDiscardAction extends BaseGameAction {
  type: EventType.DRAW_FROM_DISCARD;
}

export interface DiscardCardAction extends BaseGameAction {
  type: EventType.DISCARD_CARD;
  cardId: string;
}

export interface KnockAction extends BaseGameAction {
  type: EventType.KNOCK;
  melds: Meld[];
  cardToDiscard: string; // ID of card to discard when knocking
}

export interface GinAction extends BaseGameAction {
  type: EventType.GIN;
  melds: Meld[];
  cardToDiscard: string; // ID of card to discard when going gin
}

export interface StartNewRoundAction extends BaseGameAction {
  type: EventType.START_NEW_ROUND;
}

export interface AILayoffDecisionAction extends BaseGameAction {
  type: EventType.AI_LAYOFF_DECISION;
  decision: 'LAYOFF' | 'SKIP';
  selectedLayoffs: Array<{ cards: Card[]; targetMeld: Meld }>;
}

export type GameAction = 
  | PassUpcardAction
  | TakeUpcardAction
  | DrawFromStockAction
  | DrawFromDiscardAction
  | DiscardCardAction
  | KnockAction
  | GinAction
  | StartNewRoundAction
  | AILayoffDecisionAction;

// Action validation schemas
export const GameActionSchema = z.discriminatedUnion('type', [
  PassUpcardSchema,
  TakeUpcardSchema,
  DrawFromStockSchema,
  DrawFromDiscardSchema,
  DiscardCardSchema,
  KnockSchema,
  GinSchema,
  StartNewRoundSchema,
]);

// Helper functions for event creation
export function createGameEvent<T extends GameEventData>(
  gameId: string,
  eventType: EventType,
  eventData: T,
  playerId?: string,
  sequenceNumber: number = 1,
  metadata?: BaseGameEvent['metadata']
): GameEvent<T> {
  return {
    id: crypto.randomUUID(),
    gameId,
    playerId,
    eventType,
    sequenceNumber,
    eventVersion: 1,
    eventData,
    metadata: {
      timestamp: new Date().toISOString(),
      ...metadata,
    },
    processed: false,
    createdAt: new Date().toISOString(),
  };
}

// Type guards for event data
export function isDrawFromStockEvent(event: GameEvent): event is GameEvent<DrawFromStockEventData> {
  return event.eventType === EventType.DRAW_FROM_STOCK;
}

export function isDrawFromDiscardEvent(event: GameEvent): event is GameEvent<DrawFromDiscardEventData> {
  return event.eventType === EventType.DRAW_FROM_DISCARD;
}

export function isDiscardCardEvent(event: GameEvent): event is GameEvent<DiscardCardEventData> {
  return event.eventType === EventType.DISCARD_CARD;
}

export function isKnockEvent(event: GameEvent): event is GameEvent<KnockEventData> {
  return event.eventType === EventType.KNOCK;
}

export function isGinEvent(event: GameEvent): event is GameEvent<GinEventData> {
  return event.eventType === EventType.GIN;
}