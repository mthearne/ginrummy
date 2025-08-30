import { create } from 'zustand';
import { GameState, ChatMessage, GameWaitingInfo } from '@gin-rummy/common';
import { useAuthStore } from './auth';

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
  setGameState: (state: Partial<GameState>) => void;
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
}

export const useGameStore = create<GameStore>((set, get) => ({
  currentGameId: null,
  gameState: null,
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

  setGameState: (gameState) => {
    const state = get();
    if (state.currentGameId && gameState?.id && gameState.id !== state.currentGameId) {
      console.warn('Ignored gameState for different gameId:', gameState.id, '!=', state.currentGameId);
      return;
    }
    set({ gameState, waitingState: null, gameError: null });
  },
  
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
}));