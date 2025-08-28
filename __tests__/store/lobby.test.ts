import { describe, it, expect, beforeEach } from 'vitest';
import { useLobbyStore } from '../lobby';
import { GameListItem } from '@gin-rummy/common';

describe('Lobby Store', () => {
  const mockPvPGame: GameListItem = {
    id: 'game-1',
    createdBy: 'user-1',
    createdByUsername: 'player1',
    status: 'waiting',
    playerCount: 1,
    maxPlayers: 2,
    vsAI: false,
    createdAt: new Date('2023-01-01'),
    updatedAt: new Date('2023-01-01')
  };

  const mockPvEGame: GameListItem = {
    id: 'game-2',
    createdBy: 'user-2',
    createdByUsername: 'player2',
    status: 'in_progress',
    playerCount: 1,
    maxPlayers: 2,
    vsAI: true,
    createdAt: new Date('2023-01-02'),
    updatedAt: new Date('2023-01-02')
  };

  const mockMyGame: GameListItem = {
    id: 'my-game-1',
    createdBy: 'current-user',
    createdByUsername: 'me',
    status: 'waiting',
    playerCount: 1,
    maxPlayers: 2,
    vsAI: false,
    createdAt: new Date('2023-01-03'),
    updatedAt: new Date('2023-01-03')
  };

  beforeEach(() => {
    // Reset store to initial state
    useLobbyStore.setState({
      games: [],
      myGames: [],
      onlineUsers: 0,
      isLoading: false,
      isLoadingMyGames: false,
      filter: 'all',
      gameView: 'available'
    });
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useLobbyStore.getState();
      
      expect(state.games).toEqual([]);
      expect(state.myGames).toEqual([]);
      expect(state.onlineUsers).toBe(0);
      expect(state.isLoading).toBe(false);
      expect(state.isLoadingMyGames).toBe(false);
      expect(state.filter).toBe('all');
      expect(state.gameView).toBe('available');
    });
  });

  describe('setGames', () => {
    it('should set games list', () => {
      const state = useLobbyStore.getState();
      const games = [mockPvPGame, mockPvEGame];
      
      state.setGames(games);
      
      expect(useLobbyStore.getState().games).toEqual(games);
    });

    it('should replace existing games', () => {
      const state = useLobbyStore.getState();
      
      state.setGames([mockPvPGame]);
      state.setGames([mockPvEGame]);
      
      expect(useLobbyStore.getState().games).toEqual([mockPvEGame]);
    });
  });

  describe('setMyGames', () => {
    it('should set my games list', () => {
      const state = useLobbyStore.getState();
      const myGames = [mockMyGame];
      
      state.setMyGames(myGames);
      
      expect(useLobbyStore.getState().myGames).toEqual(myGames);
    });
  });

  describe('setOnlineUsers', () => {
    it('should set online users count', () => {
      const state = useLobbyStore.getState();
      
      state.setOnlineUsers(42);
      
      expect(useLobbyStore.getState().onlineUsers).toBe(42);
    });

    it('should handle zero users', () => {
      const state = useLobbyStore.getState();
      
      state.setOnlineUsers(10);
      state.setOnlineUsers(0);
      
      expect(useLobbyStore.getState().onlineUsers).toBe(0);
    });
  });

  describe('Loading States', () => {
    it('should set loading state', () => {
      const state = useLobbyStore.getState();
      
      state.setLoading(true);
      expect(useLobbyStore.getState().isLoading).toBe(true);
      
      state.setLoading(false);
      expect(useLobbyStore.getState().isLoading).toBe(false);
    });

    it('should set my games loading state', () => {
      const state = useLobbyStore.getState();
      
      state.setLoadingMyGames(true);
      expect(useLobbyStore.getState().isLoadingMyGames).toBe(true);
      
      state.setLoadingMyGames(false);
      expect(useLobbyStore.getState().isLoadingMyGames).toBe(false);
    });
  });

  describe('Filters and Views', () => {
    it('should set filter', () => {
      const state = useLobbyStore.getState();
      
      state.setFilter('pvp');
      expect(useLobbyStore.getState().filter).toBe('pvp');
      
      state.setFilter('pve');
      expect(useLobbyStore.getState().filter).toBe('pve');
      
      state.setFilter('all');
      expect(useLobbyStore.getState().filter).toBe('all');
    });

    it('should set game view', () => {
      const state = useLobbyStore.getState();
      
      state.setGameView('my-games');
      expect(useLobbyStore.getState().gameView).toBe('my-games');
      
      state.setGameView('available');
      expect(useLobbyStore.getState().gameView).toBe('available');
    });
  });

  describe('Game Management', () => {
    describe('addGame', () => {
      it('should add game to the beginning of list', () => {
        const state = useLobbyStore.getState();
        
        state.setGames([mockPvEGame]);
        state.addGame(mockPvPGame);
        
        expect(useLobbyStore.getState().games).toEqual([mockPvPGame, mockPvEGame]);
      });

      it('should add game to empty list', () => {
        const state = useLobbyStore.getState();
        
        state.addGame(mockPvPGame);
        
        expect(useLobbyStore.getState().games).toEqual([mockPvPGame]);
      });
    });

    describe('removeGame', () => {
      it('should remove game by id', () => {
        const state = useLobbyStore.getState();
        
        state.setGames([mockPvPGame, mockPvEGame]);
        state.removeGame('game-1');
        
        expect(useLobbyStore.getState().games).toEqual([mockPvEGame]);
      });

      it('should handle removing non-existent game', () => {
        const state = useLobbyStore.getState();
        
        state.setGames([mockPvPGame]);
        state.removeGame('non-existent');
        
        expect(useLobbyStore.getState().games).toEqual([mockPvPGame]);
      });

      it('should handle removing from empty list', () => {
        const state = useLobbyStore.getState();
        
        expect(() => state.removeGame('game-1')).not.toThrow();
        expect(useLobbyStore.getState().games).toEqual([]);
      });
    });

    describe('updateGame', () => {
      it('should update game properties', () => {
        const state = useLobbyStore.getState();
        
        state.setGames([mockPvPGame, mockPvEGame]);
        state.updateGame('game-1', { status: 'in_progress', playerCount: 2 });
        
        const games = useLobbyStore.getState().games;
        expect(games[0]).toEqual({
          ...mockPvPGame,
          status: 'in_progress',
          playerCount: 2
        });
        expect(games[1]).toEqual(mockPvEGame); // Unchanged
      });

      it('should handle updating non-existent game', () => {
        const state = useLobbyStore.getState();
        
        state.setGames([mockPvPGame]);
        state.updateGame('non-existent', { status: 'completed' });
        
        expect(useLobbyStore.getState().games).toEqual([mockPvPGame]);
      });

      it('should handle partial updates', () => {
        const state = useLobbyStore.getState();
        
        state.setGames([mockPvPGame]);
        state.updateGame('game-1', { playerCount: 2 });
        
        const games = useLobbyStore.getState().games;
        expect(games[0]).toEqual({
          ...mockPvPGame,
          playerCount: 2
        });
      });
    });
  });

  describe('getFilteredGames', () => {
    beforeEach(() => {
      const state = useLobbyStore.getState();
      state.setGames([mockPvPGame, mockPvEGame]);
      state.setMyGames([mockMyGame]);
    });

    describe('Available Games View', () => {
      beforeEach(() => {
        useLobbyStore.getState().setGameView('available');
      });

      it('should return all games when filter is "all"', () => {
        const state = useLobbyStore.getState();
        
        state.setFilter('all');
        
        expect(state.getFilteredGames()).toEqual([mockPvPGame, mockPvEGame]);
      });

      it('should return only PvP games when filter is "pvp"', () => {
        const state = useLobbyStore.getState();
        
        state.setFilter('pvp');
        
        expect(state.getFilteredGames()).toEqual([mockPvPGame]);
      });

      it('should return only PvE games when filter is "pve"', () => {
        const state = useLobbyStore.getState();
        
        state.setFilter('pve');
        
        expect(state.getFilteredGames()).toEqual([mockPvEGame]);
      });
    });

    describe('My Games View', () => {
      beforeEach(() => {
        useLobbyStore.getState().setGameView('my-games');
      });

      it('should return my games when filter is "all"', () => {
        const state = useLobbyStore.getState();
        
        state.setFilter('all');
        
        expect(state.getFilteredGames()).toEqual([mockMyGame]);
      });

      it('should filter my games by type', () => {
        const state = useLobbyStore.getState();
        const myPvEGame = { ...mockMyGame, vsAI: true };
        
        state.setMyGames([mockMyGame, myPvEGame]);
        state.setFilter('pvp');
        
        expect(state.getFilteredGames()).toEqual([mockMyGame]);
      });
    });

    describe('Edge Cases', () => {
      it('should handle null games list', () => {
        const state = useLobbyStore.getState();
        
        useLobbyStore.setState({ games: null as any });
        state.setGameView('available');
        
        expect(state.getFilteredGames()).toEqual([]);
      });

      it('should handle undefined games list', () => {
        const state = useLobbyStore.getState();
        
        useLobbyStore.setState({ games: undefined as any });
        state.setGameView('available');
        
        expect(state.getFilteredGames()).toEqual([]);
      });

      it('should handle null my games list', () => {
        const state = useLobbyStore.getState();
        
        useLobbyStore.setState({ myGames: null as any });
        state.setGameView('my-games');
        
        expect(state.getFilteredGames()).toEqual([]);
      });
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle complete lobby workflow', () => {
      const state = useLobbyStore.getState();
      
      // Start loading
      state.setLoading(true);
      expect(useLobbyStore.getState().isLoading).toBe(true);
      
      // Set online users
      state.setOnlineUsers(25);
      expect(useLobbyStore.getState().onlineUsers).toBe(25);
      
      // Load games
      state.setGames([mockPvPGame, mockPvEGame]);
      state.setLoading(false);
      
      // Filter games
      state.setFilter('pvp');
      expect(state.getFilteredGames()).toEqual([mockPvPGame]);
      
      // Switch to my games
      state.setLoadingMyGames(true);
      state.setMyGames([mockMyGame]);
      state.setLoadingMyGames(false);
      state.setGameView('my-games');
      expect(state.getFilteredGames()).toEqual([mockMyGame]);
      
      // Add new game
      const newGame: GameListItem = {
        ...mockPvPGame,
        id: 'new-game',
        createdByUsername: 'newplayer'
      };
      state.setGameView('available');
      state.addGame(newGame);
      state.setFilter('all');
      expect(state.getFilteredGames()).toEqual([newGame, mockPvPGame, mockPvEGame]);
      
      // Update and remove games
      state.updateGame('new-game', { playerCount: 2, status: 'in_progress' });
      state.removeGame('game-1');
      
      const finalGames = useLobbyStore.getState().games;
      expect(finalGames).toHaveLength(2);
      expect(finalGames[0].id).toBe('new-game');
      expect(finalGames[0].playerCount).toBe(2);
      expect(finalGames[1].id).toBe('game-2');
    });

    it('should maintain filter state across view changes', () => {
      const state = useLobbyStore.getState();
      
      // Set up games and filter
      state.setGames([mockPvPGame, mockPvEGame]);
      state.setMyGames([mockMyGame]);
      state.setFilter('pvp');
      
      // Test available games view
      state.setGameView('available');
      expect(state.getFilteredGames()).toEqual([mockPvPGame]);
      
      // Switch to my games view - filter should persist
      state.setGameView('my-games');
      expect(state.getFilteredGames()).toEqual([mockMyGame]);
      
      // Switch back to available games
      state.setGameView('available');
      expect(state.getFilteredGames()).toEqual([mockPvPGame]);
    });
  });
});