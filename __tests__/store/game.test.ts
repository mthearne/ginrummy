import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '../game';
import { useAuthStore } from '../auth';
import { GameState, ChatMessage, GameWaitingInfo, GamePhase, User } from '@gin-rummy/common';

describe('Game Store', () => {
  const mockUser: User = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    elo: 1200,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockOpponent: User = {
    id: 'opponent-456',
    username: 'opponent',
    email: 'opponent@example.com',
    elo: 1300,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockGameState: Partial<GameState> = {
    id: 'game-123',
    phase: GamePhase.Draw,
    currentPlayerId: 'user-123',
    players: [
      {
        id: 'user-123',
        username: 'testuser',
        hand: [],
        handSize: 10,
        score: 0,
        deadwood: 25,
        melds: []
      },
      {
        id: 'opponent-456',
        username: 'opponent',
        hand: [],
        handSize: 10,
        score: 0,
        deadwood: 25,
        melds: []
      }
    ],
    discardPile: [],
    stockPileCount: 25,
    gameOver: false
  };

  const mockWaitingState: GameWaitingInfo = {
    gameId: 'game-123',
    playerId: 'user-123'
  };

  const mockChatMessage: ChatMessage = {
    id: 'msg-1',
    playerId: 'user-123',
    username: 'testuser',
    message: 'Hello!',
    timestamp: new Date()
  };

  beforeEach(() => {
    // Reset stores
    useGameStore.setState({
      gameState: null,
      waitingState: null,
      selectedCards: [],
      chatMessages: [],
      isConnected: false,
      gameError: null,
      isAIThinking: false,
      aiThoughts: []
    });

    useAuthStore.setState({
      user: mockUser,
      accessToken: 'mock-token',
      refreshToken: 'mock-refresh',
      isLoading: false
    });
  });

  afterEach(() => {
    useGameStore.getState().resetGame();
    useAuthStore.getState().logout();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useGameStore.getState();
      
      expect(state.gameState).toBe(null);
      expect(state.waitingState).toBe(null);
      expect(state.selectedCards).toEqual([]);
      expect(state.chatMessages).toEqual([]);
      expect(state.isConnected).toBe(false);
      expect(state.gameError).toBe(null);
      expect(state.isAIThinking).toBe(false);
      expect(state.aiThoughts).toEqual([]);
    });
  });

  describe('setGameState', () => {
    it('should set game state and clear waiting state', () => {
      const state = useGameStore.getState();
      
      // First set waiting state
      state.setWaitingState(mockWaitingState);
      expect(useGameStore.getState().waitingState).toEqual(mockWaitingState);
      
      // Then set game state
      state.setGameState(mockGameState);
      
      const newState = useGameStore.getState();
      expect(newState.gameState).toEqual(mockGameState);
      expect(newState.waitingState).toBe(null);
    });

    it('should update game state when called multiple times', () => {
      const state = useGameStore.getState();
      const updatedGameState = { ...mockGameState, phase: GamePhase.Discard };
      
      state.setGameState(mockGameState);
      state.setGameState(updatedGameState);
      
      expect(useGameStore.getState().gameState).toEqual(updatedGameState);
    });
  });

  describe('setWaitingState', () => {
    it('should set waiting state and clear game state', () => {
      const state = useGameStore.getState();
      
      // First set game state
      state.setGameState(mockGameState);
      expect(useGameStore.getState().gameState).toEqual(mockGameState);
      
      // Then set waiting state
      state.setWaitingState(mockWaitingState);
      
      const newState = useGameStore.getState();
      expect(newState.waitingState).toEqual(mockWaitingState);
      expect(newState.gameState).toBe(null);
    });
  });

  describe('Card Selection', () => {
    describe('selectCard', () => {
      it('should select a card', () => {
        const state = useGameStore.getState();
        
        state.selectCard('card-1');
        
        expect(useGameStore.getState().selectedCards).toEqual(['card-1']);
      });

      it('should select multiple cards', () => {
        const state = useGameStore.getState();
        
        state.selectCard('card-1');
        state.selectCard('card-2');
        
        expect(useGameStore.getState().selectedCards).toEqual(['card-1', 'card-2']);
      });

      it('should not select the same card twice', () => {
        const state = useGameStore.getState();
        
        state.selectCard('card-1');
        state.selectCard('card-1');
        
        expect(useGameStore.getState().selectedCards).toEqual(['card-1']);
      });
    });

    describe('deselectCard', () => {
      it('should deselect a card', () => {
        const state = useGameStore.getState();
        
        state.selectCard('card-1');
        state.selectCard('card-2');
        expect(useGameStore.getState().selectedCards).toEqual(['card-1', 'card-2']);
        
        state.deselectCard('card-1');
        expect(useGameStore.getState().selectedCards).toEqual(['card-2']);
      });

      it('should handle deselecting non-selected card', () => {
        const state = useGameStore.getState();
        
        state.selectCard('card-1');
        state.deselectCard('card-2');
        
        expect(useGameStore.getState().selectedCards).toEqual(['card-1']);
      });

      it('should handle deselecting from empty selection', () => {
        const state = useGameStore.getState();
        
        expect(() => state.deselectCard('card-1')).not.toThrow();
        expect(useGameStore.getState().selectedCards).toEqual([]);
      });
    });

    describe('clearSelection', () => {
      it('should clear all selected cards', () => {
        const state = useGameStore.getState();
        
        state.selectCard('card-1');
        state.selectCard('card-2');
        state.selectCard('card-3');
        
        state.clearSelection();
        
        expect(useGameStore.getState().selectedCards).toEqual([]);
      });

      it('should work when no cards are selected', () => {
        const state = useGameStore.getState();
        
        expect(() => state.clearSelection()).not.toThrow();
        expect(useGameStore.getState().selectedCards).toEqual([]);
      });
    });
  });

  describe('Chat Messages', () => {
    it('should add chat messages', () => {
      const state = useGameStore.getState();
      
      state.addChatMessage(mockChatMessage);
      
      expect(useGameStore.getState().chatMessages).toEqual([mockChatMessage]);
    });

    it('should add multiple chat messages in order', () => {
      const state = useGameStore.getState();
      const message2: ChatMessage = {
        ...mockChatMessage,
        id: 'msg-2',
        message: 'Second message'
      };
      
      state.addChatMessage(mockChatMessage);
      state.addChatMessage(message2);
      
      expect(useGameStore.getState().chatMessages).toEqual([mockChatMessage, message2]);
    });
  });

  describe('Connection State', () => {
    it('should set connected state', () => {
      const state = useGameStore.getState();
      
      state.setConnected(true);
      expect(useGameStore.getState().isConnected).toBe(true);
      
      state.setConnected(false);
      expect(useGameStore.getState().isConnected).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should set game error', () => {
      const state = useGameStore.getState();
      const errorMessage = 'Something went wrong';
      
      state.setGameError(errorMessage);
      
      expect(useGameStore.getState().gameError).toBe(errorMessage);
    });

    it('should clear game error', () => {
      const state = useGameStore.getState();
      
      state.setGameError('Error');
      state.setGameError(null);
      
      expect(useGameStore.getState().gameError).toBe(null);
    });
  });

  describe('AI Thinking State', () => {
    it('should set AI thinking state', () => {
      const state = useGameStore.getState();
      const thoughts = ['Considering move', 'Analyzing cards'];
      
      state.setAIThinking(true, thoughts);
      
      const newState = useGameStore.getState();
      expect(newState.isAIThinking).toBe(true);
      expect(newState.aiThoughts).toEqual(thoughts);
    });

    it('should clear AI thinking state', () => {
      const state = useGameStore.getState();
      
      state.setAIThinking(true, ['Thinking...']);
      state.setAIThinking(false, []);
      
      const newState = useGameStore.getState();
      expect(newState.isAIThinking).toBe(false);
      expect(newState.aiThoughts).toEqual([]);
    });
  });

  describe('resetGame', () => {
    it('should reset all game state', () => {
      const state = useGameStore.getState();
      
      // Set up some state
      state.setGameState(mockGameState);
      state.selectCard('card-1');
      state.addChatMessage(mockChatMessage);
      state.setConnected(true);
      state.setGameError('Error');
      state.setAIThinking(true, ['Thinking']);
      
      // Reset
      state.resetGame();
      
      const newState = useGameStore.getState();
      expect(newState.gameState).toBe(null);
      expect(newState.waitingState).toBe(null);
      expect(newState.selectedCards).toEqual([]);
      expect(newState.chatMessages).toEqual([]);
      expect(newState.isConnected).toBe(false);
      expect(newState.gameError).toBe(null);
    });
  });

  describe('Computed Properties', () => {
    describe('isMyTurn', () => {
      it('should return true when it is user turn', () => {
        const state = useGameStore.getState();
        
        state.setGameState(mockGameState);
        
        expect(state.isMyTurn()).toBe(true);
      });

      it('should return false when it is opponent turn', () => {
        const state = useGameStore.getState();
        const opponentTurnState = { 
          ...mockGameState, 
          currentPlayerId: 'opponent-456' 
        };
        
        state.setGameState(opponentTurnState);
        
        expect(state.isMyTurn()).toBe(false);
      });

      it('should return false when no game state', () => {
        const state = useGameStore.getState();
        
        expect(state.isMyTurn()).toBe(false);
      });

      it('should return false when no user', () => {
        const state = useGameStore.getState();
        useAuthStore.setState({ user: null });
        
        state.setGameState(mockGameState);
        
        expect(state.isMyTurn()).toBe(false);
      });
    });

    describe('canMakeMove', () => {
      it('should return true when connected, my turn, and game not over', () => {
        const state = useGameStore.getState();
        
        state.setGameState(mockGameState);
        state.setConnected(true);
        
        expect(state.canMakeMove()).toBe(true);
      });

      it('should return false when not connected', () => {
        const state = useGameStore.getState();
        
        state.setGameState(mockGameState);
        state.setConnected(false);
        
        expect(state.canMakeMove()).toBe(false);
      });

      it('should return false when not my turn', () => {
        const state = useGameStore.getState();
        const opponentTurnState = { 
          ...mockGameState, 
          currentPlayerId: 'opponent-456' 
        };
        
        state.setGameState(opponentTurnState);
        state.setConnected(true);
        
        expect(state.canMakeMove()).toBe(false);
      });

      it('should return false when game is over', () => {
        const state = useGameStore.getState();
        const gameOverState = { ...mockGameState, gameOver: true };
        
        state.setGameState(gameOverState);
        state.setConnected(true);
        
        expect(state.canMakeMove()).toBe(false);
      });
    });

    describe('getMyPlayer', () => {
      it('should return current user player', () => {
        const state = useGameStore.getState();
        
        state.setGameState(mockGameState);
        
        const myPlayer = state.getMyPlayer();
        expect(myPlayer).toEqual(mockGameState.players![0]);
        expect(myPlayer!.id).toBe('user-123');
      });

      it('should return null when no game state', () => {
        const state = useGameStore.getState();
        
        expect(state.getMyPlayer()).toBe(null);
      });

      it('should return null when no user', () => {
        const state = useGameStore.getState();
        useAuthStore.setState({ user: null });
        
        state.setGameState(mockGameState);
        
        expect(state.getMyPlayer()).toBe(null);
      });

      it('should return null when no players', () => {
        const state = useGameStore.getState();
        const noPlayersState = { ...mockGameState, players: [] };
        
        state.setGameState(noPlayersState);
        
        expect(state.getMyPlayer()).toBe(null);
      });
    });

    describe('getOpponent', () => {
      it('should return opponent player', () => {
        const state = useGameStore.getState();
        
        state.setGameState(mockGameState);
        
        const opponent = state.getOpponent();
        expect(opponent).toEqual(mockGameState.players![1]);
        expect(opponent!.id).toBe('opponent-456');
      });

      it('should return null when no game state', () => {
        const state = useGameStore.getState();
        
        expect(state.getOpponent()).toBe(null);
      });

      it('should return null when no user', () => {
        const state = useGameStore.getState();
        useAuthStore.setState({ user: null });
        
        state.setGameState(mockGameState);
        
        expect(state.getOpponent()).toBe(null);
      });

      it('should return null when only one player', () => {
        const state = useGameStore.getState();
        const singlePlayerState = { 
          ...mockGameState, 
          players: [mockGameState.players![0]] 
        };
        
        state.setGameState(singlePlayerState);
        
        expect(state.getOpponent()).toBe(null);
      });
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle complete game flow', () => {
      const state = useGameStore.getState();
      
      // Start with waiting state
      state.setWaitingState(mockWaitingState);
      expect(useGameStore.getState().waitingState).toEqual(mockWaitingState);
      expect(useGameStore.getState().gameState).toBe(null);
      
      // Connect and start game
      state.setConnected(true);
      state.setGameState(mockGameState);
      expect(useGameStore.getState().gameState).toEqual(mockGameState);
      expect(useGameStore.getState().waitingState).toBe(null);
      expect(useGameStore.getState().isConnected).toBe(true);
      
      // Select cards and chat
      state.selectCard('card-1');
      state.addChatMessage(mockChatMessage);
      expect(useGameStore.getState().selectedCards).toEqual(['card-1']);
      expect(useGameStore.getState().chatMessages).toEqual([mockChatMessage]);
      
      // Game actions
      expect(state.isMyTurn()).toBe(true);
      expect(state.canMakeMove()).toBe(true);
      expect(state.getMyPlayer()!.id).toBe('user-123');
      expect(state.getOpponent()!.id).toBe('opponent-456');
      
      // Reset and clean up
      state.resetGame();
      const finalState = useGameStore.getState();
      expect(finalState.gameState).toBe(null);
      expect(finalState.selectedCards).toEqual([]);
      expect(finalState.chatMessages).toEqual([]);
      expect(finalState.isConnected).toBe(false);
    });

    it('should handle state transitions correctly', () => {
      const state = useGameStore.getState();
      
      // Multiple state updates
      state.setWaitingState(mockWaitingState);
      state.setGameState(mockGameState);
      state.selectCard('card-1');
      state.selectCard('card-2');
      state.deselectCard('card-1');
      state.addChatMessage(mockChatMessage);
      state.setGameError('Error');
      state.setGameError(null);
      state.setAIThinking(true, ['AI thinking']);
      state.setAIThinking(false, []);
      
      const finalState = useGameStore.getState();
      expect(finalState.gameState).toEqual(mockGameState);
      expect(finalState.selectedCards).toEqual(['card-2']);
      expect(finalState.chatMessages).toEqual([mockChatMessage]);
      expect(finalState.gameError).toBe(null);
      expect(finalState.isAIThinking).toBe(false);
    });
  });
});