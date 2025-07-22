import { create } from 'zustand';
import { GameState, ChatMessage, GameWaitingInfo } from '@gin-rummy/common';
import { useAuthStore } from './auth';

interface GameStore {
  gameState: Partial<GameState> | null;
  waitingState: GameWaitingInfo | null;
  selectedCards: string[];
  chatMessages: ChatMessage[];
  isConnected: boolean;
  gameError: string | null;
  
  // Actions
  setGameState: (state: Partial<GameState>) => void;
  setWaitingState: (waitingState: GameWaitingInfo) => void;
  selectCard: (cardId: string) => void;
  deselectCard: (cardId: string) => void;
  clearSelection: () => void;
  addChatMessage: (message: ChatMessage) => void;
  setConnected: (connected: boolean) => void;
  setGameError: (error: string | null) => void;
  resetGame: () => void;
  
  // Computed
  isMyTurn: () => boolean;
  canMakeMove: () => boolean;
  getMyPlayer: () => any;
  getOpponent: () => any;
}

export const useGameStore = create<GameStore>((set, get) => ({
  gameState: null,
  waitingState: null,
  selectedCards: [],
  chatMessages: [],
  isConnected: false,
  gameError: null,

  setGameState: (gameState) => {
    console.log('[GAME_STORE] Setting game state:', gameState);
    console.log('[GAME_STORE] Players:', gameState?.players?.map(p => `${p.id}(${p.username})`));
    console.log('[GAME_STORE] Current player ID:', gameState?.currentPlayerId);
    const currentUser = useAuthStore.getState().user;
    console.log('[GAME_STORE] Current user:', currentUser?.id, currentUser?.username);
    
    // Debug: Force logging of player identification
    if (gameState?.players && currentUser) {
      const myPlayer = gameState.players.find(p => p.id === currentUser.id);
      const opponent = gameState.players.find(p => p.id !== currentUser.id);
      console.log('[GAME_STORE] DEBUG - My player:', myPlayer?.id, myPlayer?.username);
      console.log('[GAME_STORE] DEBUG - Opponent:', opponent?.id, opponent?.username);
    }
    
    set({ gameState, waitingState: null });
  },
  
  setWaitingState: (waitingState) => set({ waitingState, gameState: null }),
  
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
  
  setConnected: (isConnected) => set({ isConnected }),
  
  setGameError: (gameError) => set({ gameError }),
  
  resetGame: () => set({
    gameState: null,
    waitingState: null,
    selectedCards: [],
    chatMessages: [],
    isConnected: false,
    gameError: null,
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
    return state.isConnected && state.isMyTurn() && !state.gameState?.gameOver;
  },
  
  getMyPlayer: () => {
    const state = get();
    const gameState = state.gameState;
    const currentUser = useAuthStore.getState().user;
    if (!gameState?.players || !currentUser) return null;
    
    const myPlayer = gameState.players.find(player => player.id === currentUser.id) || null;
    console.log('[GAME_STORE] getMyPlayer - currentUser:', currentUser.id, 'found player:', myPlayer?.id, myPlayer?.username);
    return myPlayer;
  },
  
  getOpponent: () => {
    const state = get();
    const gameState = state.gameState;
    const currentUser = useAuthStore.getState().user;
    if (!gameState?.players || !currentUser) return null;
    
    const opponent = gameState.players.find(player => player.id !== currentUser.id) || null;
    console.log('[GAME_STORE] getOpponent - currentUser:', currentUser.id, 'found opponent:', opponent?.id, opponent?.username);
    return opponent;
  },
}));