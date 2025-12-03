import { create } from 'zustand';
import { GameState, ChatMessage, GameWaitingInfo } from '@gin-rummy/common';
import { useAuthStore } from './auth';
import crypto from 'crypto';

/**
 * Game Store - Transitional State Management for Event-Sourced Frontend
 * 
 * This store now serves as a temporary cache for the frontend while the backend
 * maintains the authoritative state via event sourcing. The frontend periodically
 * refreshes from the backend to ensure consistency.
 * 
 * In the new architecture:
 * - Backend: Single source of truth via event-sourced state
 * - Frontend: Displays cached state, refreshes every 3 seconds
 * - Moves: Always processed via atomic backend transactions
 */

export interface TurnHistoryEntry {
  id: string;
  turnNumber: number;
  playerId: string;
  playerName: string;
  action: string;
  description: string;
  timestamp: string;
}

interface GameStore {
  currentGameId: string | null;
  gameState: Partial<GameState> | null;
  streamVersion: number; // NEW: Stream version for optimistic concurrency
  pendingOptimisticVersion: number | null; // Track expected version after optimistic updates
  waitingState: GameWaitingInfo | null;
  selectedCards: string[];
  chatMessages: ChatMessage[];
  turnHistory: TurnHistoryEntry[];
  isConnected: boolean;
  gameError: string | null;
  isAIThinking: boolean;
  aiThoughts: string[];
  isSubmittingMove: boolean;
  
  // Actions
  setCurrentGame: (gameId: string) => void;
  setGameState: (state: Partial<GameState>, streamVersion?: number) => void;
  setStreamVersion: (version: number) => void; // NEW: Stream version setter
  setPendingOptimisticVersion: (version: number | null) => void;
  setWaitingState: (waitingState: GameWaitingInfo) => void;
  setIsSubmittingMove: (submitting: boolean) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  addChatMessage: (message: ChatMessage) => void;
  addTurnHistoryEntry: (entry: TurnHistoryEntry) => void;
  setTurnHistory: (history: TurnHistoryEntry[]) => void;
  setConnected: (connected: boolean) => void;
  setGameError: (error: string | null) => void;
  setAIThinking: (thinking: boolean, thoughts: string[]) => void;
  resetGame: () => void;
  
  // Computed
  isMyTurn: () => boolean;
  canMakeMove: () => boolean;
  getMyPlayer: () => any;
  getOpponent: () => any;
  getCurrentStreamVersion: () => number; // NEW: Get current stream version
  generateRequestId: () => string; // NEW: Generate UUID v4 for requests
}

export const useGameStore = create<GameStore>((set, get) => ({
  currentGameId: null,
  gameState: null,
  streamVersion: 0, // Initialize stream version
  pendingOptimisticVersion: null,
  waitingState: null,
  selectedCards: [],
  chatMessages: [],
  turnHistory: [],
  isConnected: false,
  gameError: null,
  isAIThinking: false,
  aiThoughts: [],
  isSubmittingMove: false,

  setCurrentGame: (gameId: string) => {
    const prev = get().currentGameId;
    if (prev !== gameId) {
      // full reset when game changes
      set({
        currentGameId: gameId,
        gameState: null,
        streamVersion: 0, // Reset stream version
        pendingOptimisticVersion: null,
        waitingState: null,
        selectedCards: [],
        chatMessages: [],
        turnHistory: [],
        isConnected: false,
        gameError: null,
        isAIThinking: false,
        aiThoughts: [],
        isSubmittingMove: false,
      });
    } else {
      set({ currentGameId: gameId });
    }
  },

  setGameState: (gameState, streamVersion) => {
    const state = get();
    if (state.currentGameId && gameState?.id && gameState.id !== state.currentGameId) {
      console.warn('Ignored gameState for different gameId:', gameState.id, '!=', state.currentGameId);
      return;
    }

    const incomingVersion = typeof streamVersion === 'number' ? streamVersion : null;
    const currentVersion = state.streamVersion ?? 0;
    const pendingVersion = state.pendingOptimisticVersion;

    if (incomingVersion !== null) {
      if (incomingVersion < currentVersion) {
        console.log('Ignored stale gameState update with lower streamVersion:', incomingVersion, '<', currentVersion);
        return;
      }

      if (typeof pendingVersion === 'number' && incomingVersion < pendingVersion) {
        console.log('Ignored gameState update older than pending optimistic version:', incomingVersion, '<', pendingVersion);
        return;
      }
    } else if (typeof pendingVersion === 'number') {
      console.log('Ignored versionless gameState update while optimistic move pending');
      return;
    }

    // Clear turn history when starting a new round (but not on initial load)
    const wasRoundOver = state.gameState?.phase === 'round_over';
    const isNewRound = wasRoundOver && gameState?.phase === 'upcard_decision';
    const isInitialLoad = !state.gameState; // First time loading the game

    const updates: any = { gameState, waitingState: null, gameError: null };

    // Update stream version if provided
    if (incomingVersion !== null) {
      updates.streamVersion = incomingVersion;
    }

    if (typeof pendingVersion === 'number' && incomingVersion !== null && incomingVersion >= pendingVersion) {
      updates.pendingOptimisticVersion = null;
    }

    // Only clear turn history if it's a new round transition, not on initial load
    if (isNewRound && !isInitialLoad) {
      console.log('New round detected, clearing turn history');
      updates.turnHistory = [];
    }
    
    set(updates);
  },

  setStreamVersion: (streamVersion) => {
    const state = get();
    const updates: any = { streamVersion };
    if (typeof state.pendingOptimisticVersion === 'number' && streamVersion >= state.pendingOptimisticVersion) {
      updates.pendingOptimisticVersion = null;
    }
    set(updates);
  },

  setPendingOptimisticVersion: (pendingOptimisticVersion) => set({ pendingOptimisticVersion }),
  
  setWaitingState: (waitingState) => {
    const state = get();
    if (state.currentGameId && waitingState?.gameId && waitingState.gameId !== state.currentGameId) {
      console.warn('Ignored waitingState for different gameId:', waitingState.gameId, '!=', state.currentGameId);
      return;
    }
    set({ waitingState, gameState: null, gameError: null });
  },

  setIsSubmittingMove: (isSubmittingMove) => set({ isSubmittingMove }),
  
  selectCard: (cardId) => {
    const state = get();
    if (!state.selectedCards.includes(cardId)) {
      set({ selectedCards: [...state.selectedCards, cardId] });
    }
  },
  
  deselectCard: (cardId) => {
    const state = get();
    set({ selectedCards: state.selectedCards.filter(id => id !== cardId) });
  },
  
  clearSelection: () => set({ selectedCards: [] }),
  
  addChatMessage: (message) => {
    const state = get();
    set({ chatMessages: [...state.chatMessages, message] });
  },

  addTurnHistoryEntry: (entry) => {
    const state = get();
    set({ turnHistory: [...state.turnHistory, entry] });
  },

  setTurnHistory: (turnHistory) => set({ turnHistory }),
  
  setConnected: (isConnected) => set({ isConnected }),
  
  setGameError: (gameError) => set({ gameError }),
  
  setAIThinking: (isAIThinking, aiThoughts) => set({ isAIThinking, aiThoughts }),
  
  resetGame: () => set({
    currentGameId: null,
    gameState: null,
    streamVersion: 0, // Reset stream version
    pendingOptimisticVersion: null,
    waitingState: null,
    selectedCards: [],
    chatMessages: [],
    turnHistory: [],
    isConnected: false,
    gameError: null,
    isAIThinking: false,
    aiThoughts: [],
    isSubmittingMove: false,
  }),
  
  isMyTurn: () => {
    const state = get();
    const gameState = state.gameState;
    const currentUser = useAuthStore.getState().user;
    if (!gameState || !currentUser) return false;
    
    return gameState.currentPlayerId === currentUser.id;
  },
  
  canMakeMove: () => {
    const state = get();
    return state.isConnected && state.isMyTurn() && !state.gameState?.gameOver && !state.isSubmittingMove;
  },
  
  getMyPlayer: () => {
    const state = get();
    const gameState = state.gameState;
    const currentUser = useAuthStore.getState().user;
    if (!gameState?.players || !currentUser) return null;
    
    return gameState.players.find(player => player.id === currentUser.id) || null;
  },
  
  getOpponent: () => {
    const state = get();
    const gameState = state.gameState;
    const currentUser = useAuthStore.getState().user;
    if (!gameState?.players || !currentUser) return null;
    
    return gameState.players.find(player => player.id !== currentUser.id) || null;
  },

  getCurrentStreamVersion: () => {
    return get().streamVersion;
  },

  generateRequestId: () => {
    // Generate UUID v4 for request idempotency with browser compatibility fallback
    return window.crypto?.randomUUID?.() || 
           'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
             const r = Math.random() * 16 | 0;
             const v = c == 'x' ? r : (r & 0x3 | 0x8);
             return v.toString(16);
           });
  },
}));
