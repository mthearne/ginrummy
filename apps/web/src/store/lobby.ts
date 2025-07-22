import { create } from 'zustand';
import { GameListItem } from '@gin-rummy/common';

interface LobbyStore {
  games: GameListItem[];
  myGames: GameListItem[];
  onlineUsers: number;
  isLoading: boolean;
  isLoadingMyGames: boolean;
  filter: 'all' | 'pvp' | 'pve';
  gameView: 'available' | 'my-games';
  
  // Actions
  setGames: (games: GameListItem[]) => void;
  setMyGames: (games: GameListItem[]) => void;
  setOnlineUsers: (count: number) => void;
  setLoading: (loading: boolean) => void;
  setLoadingMyGames: (loading: boolean) => void;
  setFilter: (filter: 'all' | 'pvp' | 'pve') => void;
  setGameView: (view: 'available' | 'my-games') => void;
  addGame: (game: GameListItem) => void;
  removeGame: (gameId: string) => void;
  updateGame: (gameId: string, updates: Partial<GameListItem>) => void;
  
  // Computed
  getFilteredGames: () => GameListItem[];
}

export const useLobbyStore = create<LobbyStore>((set, get) => ({
  games: [],
  myGames: [],
  onlineUsers: 0,
  isLoading: false,
  isLoadingMyGames: false,
  filter: 'all',
  gameView: 'available',

  setGames: (games) => set({ games }),
  
  setMyGames: (myGames) => set({ myGames }),
  
  setOnlineUsers: (onlineUsers) => set({ onlineUsers }),
  
  setLoading: (isLoading) => set({ isLoading }),
  
  setLoadingMyGames: (isLoadingMyGames) => set({ isLoadingMyGames }),
  
  setFilter: (filter) => set({ filter }),
  
  setGameView: (gameView) => set({ gameView }),
  
  addGame: (game) => {
    const state = get();
    set({ games: [game, ...state.games] });
  },
  
  removeGame: (gameId) => {
    const state = get();
    set({ games: state.games.filter(game => game.id !== gameId) });
  },
  
  updateGame: (gameId, updates) => {
    const state = get();
    set({
      games: state.games.map(game =>
        game.id === gameId ? { ...game, ...updates } : game
      ),
    });
  },
  
  getFilteredGames: () => {
    const state = get();
    const { games, myGames, filter, gameView } = state;
    
    // Choose the appropriate games list based on current view
    const gamesList = gameView === 'my-games' ? myGames : games;
    
    switch (filter) {
      case 'pvp':
        return gamesList.filter(game => !game.vsAI);
      case 'pve':
        return gamesList.filter(game => game.vsAI);
      default:
        return gamesList;
    }
  },
}));