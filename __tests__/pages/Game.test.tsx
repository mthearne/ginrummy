import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Game from '../Game';
import { GamePhase, MoveType } from '@gin-rummy/common';

// Mock data
const mockUser = {
  id: 'user-123',
  username: 'testuser',
  email: 'test@example.com',
  elo: 1200,
  createdAt: new Date(),
  updatedAt: new Date()
};

const mockGameState = {
  id: 'game-123',
  phase: GamePhase.Draw,
  currentPlayerId: 'user-123',
  players: [
    {
      id: 'user-123',
      username: 'testuser',
      hand: [
        { id: 'card-1', suit: 'hearts', rank: 'A', value: 1 },
        { id: 'card-2', suit: 'spades', rank: '2', value: 2 },
        { id: 'card-3', suit: 'diamonds', rank: '3', value: 3 }
      ],
      handSize: 3,
      score: 0,
      deadwood: 6,
      melds: [],
      lastDrawnCardId: null
    },
    {
      id: 'ai-player',
      username: 'AI Player',
      hand: [],
      handSize: 10,
      score: 0,
      deadwood: 0,
      melds: []
    }
  ],
  discardPile: [
    { id: 'discard-1', suit: 'clubs', rank: '5', value: 5 }
  ],
  stockPileCount: 25,
  vsAI: true,
  gameOver: false,
  winner: null,
  roundScores: {}
};

const mockWaitingState = {
  gameId: 'game-123',
  playerId: 'user-123'
};

// Mock objects for dynamic state changes
const mockGameStoreReturn = {
  gameState: null,
  waitingState: null,
  selectedCards: [],
  chatMessages: [],
  isConnected: true,
  gameError: null,
  selectCard: vi.fn(),
  deselectCard: vi.fn(),
  clearSelection: vi.fn(),
  setGameError: vi.fn(),
  getMyPlayer: vi.fn(() => mockGameState.players[0]),
  getOpponent: vi.fn(() => mockGameState.players[1])
};

const mockAuthStoreReturn = {
  user: mockUser
};

const mockSocketReturn = {
  isConnected: vi.fn(() => true),
  joinGame: vi.fn(),
  leaveGame: vi.fn(),
  makeMove: vi.fn(),
  sendChatMessage: vi.fn()
};

const mockRouterReturn = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn()
};

// Mock implementations
vi.mock('../store/game', () => ({
  useGameStore: () => mockGameStoreReturn
}));

vi.mock('../store/auth', () => ({
  useAuthStore: () => mockAuthStoreReturn
}));

vi.mock('../services/socket', () => ({
  useSocket: () => mockSocketReturn
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ gameId: 'game-123' }),
  useRouter: () => mockRouterReturn
}));

// Mock complex components
vi.mock('../components/ui/Card', () => ({
  Card: ({ card, selected, onClick, className }: any) => (
    <div 
      className={`mock-card ${className} ${selected ? 'selected' : ''}`}
      onClick={onClick}
      data-testid={`card-${card.id}`}
    >
      {card.rank} of {card.suit}
    </div>
  )
}));

vi.mock('../components/FriendInvitation', () => ({
  FriendInvitation: ({ gameId }: any) => (
    <div data-testid="friend-invitation">Friend Invitation for {gameId}</div>
  )
}));

vi.mock('../components/ui/Confetti', () => ({
  default: ({ active }: any) => active ? <div data-testid="confetti">🎉</div> : null
}));

vi.mock('../components/ui/FlyingAnimal', () => ({
  default: ({ active }: any) => active ? <div data-testid="flying-animal">🦅</div> : null
}));

vi.mock('../components/game/AIThinkingOverlay', () => ({
  default: () => <div data-testid="ai-thinking-overlay">AI Thinking...</div>
}));

describe('Game Component', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to default states
    Object.assign(mockGameStoreReturn, {
      gameState: null,
      waitingState: null,
      selectedCards: [],
      chatMessages: [],
      isConnected: true,
      gameError: null
    });
    Object.assign(mockAuthStoreReturn, { user: mockUser });
    
    // Reset socket return values
    Object.assign(mockSocketReturn, {
      isConnected: vi.fn(() => true),
      joinGame: vi.fn(),
      leaveGame: vi.fn(),
      makeMove: vi.fn(),
      sendChatMessage: vi.fn()
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading States', () => {
    it('should show loading screen when no game state', () => {
      render(<Game />);
      
      expect(screen.getByText('Loading game...')).toBeInTheDocument();
      const loadingElement = document.querySelector('.loading');
      expect(loadingElement).toBeInTheDocument();
    });

    it('should redirect to lobby if no gameId or user', () => {
      Object.assign(mockAuthStoreReturn, { user: null });
      
      render(<Game />);
      
      expect(mockRouterReturn.push).toHaveBeenCalledWith('/lobby');
      expect(screen.getByText('Loading game...')).toBeInTheDocument();
    });
  });

  describe('Waiting State', () => {
    beforeEach(() => {
      Object.assign(mockGameStoreReturn, { waitingState: mockWaitingState });
    });

    it('should show waiting screen for PvP games', () => {
      render(<Game />);
      
      expect(screen.getByText('Waiting for Opponent')).toBeInTheDocument();
      expect(screen.getByText('game-123')).toBeInTheDocument();
      expect(screen.getByText('Friend Invitation for game-123')).toBeInTheDocument();
    });

    it('should allow returning to lobby from waiting screen', async () => {
      render(<Game />);
      
      const backButton = screen.getByText('Back to Lobby');
      await user.click(backButton);
      
      expect(mockRouterReturn.push).toHaveBeenCalledWith('/lobby');
    });
  });

  describe('Game State Rendering', () => {
    beforeEach(() => {
      Object.assign(mockGameStoreReturn, { gameState: mockGameState });
    });

    it('should render game header with score and phase', () => {
      render(<Game />);
      
      expect(screen.getByText('Gin Rummy')).toBeInTheDocument();
      expect(screen.getByText(/Drawing a card/)).toBeInTheDocument();
      expect(screen.getByText(/Match Score: You 0 - 0 AI Player/)).toBeInTheDocument();
    });

    it('should show opponent information', () => {
      render(<Game />);
      
      expect(screen.getByText('AI Player')).toBeInTheDocument();
      expect(screen.getByText(/Score: 0 \| Cards: 10/)).toBeInTheDocument();
    });

    it('should show player hand with cards', () => {
      render(<Game />);
      
      expect(screen.getByText('Your Hand (3 cards)')).toBeInTheDocument();
      expect(screen.getByTestId('card-card-1')).toBeInTheDocument();
      expect(screen.getByTestId('card-card-2')).toBeInTheDocument();
      expect(screen.getByTestId('card-card-3')).toBeInTheDocument();
    });

    it('should show turn indicator when it is player turn', () => {
      render(<Game />);
      
      expect(screen.getByText('Your Turn')).toBeInTheDocument();
    });

    it('should show opponent turn indicator when not player turn', () => {
      const gameStateOpponentTurn = { 
        ...mockGameState, 
        currentPlayerId: 'ai-player' 
      };
      Object.assign(mockGameStoreReturn, { gameState: gameStateOpponentTurn });
      
      render(<Game />);
      
      expect(screen.getByText('Turn')).toBeInTheDocument();
    });
  });

  describe('Card Selection', () => {
    beforeEach(() => {
      Object.assign(mockGameStoreReturn, { 
        gameState: mockGameState,
        selectedCards: []
      });
    });

    it('should handle card selection', async () => {
      render(<Game />);
      
      const card = screen.getByTestId('card-card-1');
      await user.click(card);
      
      expect(mockGameStoreReturn.clearSelection).toHaveBeenCalled();
      expect(mockGameStoreReturn.selectCard).toHaveBeenCalledWith('card-1');
    });

    it('should handle card deselection', async () => {
      Object.assign(mockGameStoreReturn, { selectedCards: ['card-1'] });
      
      render(<Game />);
      
      const card = screen.getByTestId('card-card-1');
      await user.click(card);
      
      expect(mockGameStoreReturn.deselectCard).toHaveBeenCalledWith('card-1');
    });

    it('should show selected cards visually', () => {
      Object.assign(mockGameStoreReturn, { selectedCards: ['card-1'] });
      
      render(<Game />);
      
      const card = screen.getByTestId('card-card-1');
      expect(card).toHaveClass('selected');
    });
  });

  describe('Game Actions', () => {
    beforeEach(() => {
      Object.assign(mockGameStoreReturn, { 
        gameState: mockGameState,
        selectedCards: ['card-1']
      });
    });

    it('should handle draw from stock', async () => {
      render(<Game />);
      
      const stockButton = screen.getByText(/STOCK/);
      await user.click(stockButton);
      
      expect(mockSocketReturn.makeMove).toHaveBeenCalledWith({
        type: MoveType.DrawStock,
        playerId: 'user-123',
        gameId: 'game-123'
      });
    });

    it('should handle draw from discard', async () => {
      render(<Game />);
      
      const discardCard = screen.getByText('5 of clubs');
      await user.click(discardCard);
      
      expect(mockSocketReturn.makeMove).toHaveBeenCalledWith({
        type: MoveType.DrawDiscard,
        playerId: 'user-123',
        gameId: 'game-123'
      });
    });

    it('should handle discard with selected card', async () => {
      const discardPhaseGame = { 
        ...mockGameState, 
        phase: GamePhase.Discard 
      };
      Object.assign(mockGameStoreReturn, { gameState: discardPhaseGame });
      
      render(<Game />);
      
      const discardButton = screen.getByText('Discard Card');
      await user.click(discardButton);
      
      expect(mockSocketReturn.makeMove).toHaveBeenCalledWith({
        type: MoveType.Discard,
        playerId: 'user-123',
        cardId: 'card-1',
        gameId: 'game-123'
      });
    });

    it('should show discard button disabled when no card selected', () => {
      Object.assign(mockGameStoreReturn, { selectedCards: [] });
      
      render(<Game />);
      
      const discardButton = screen.getByText(/Discard \(Select 1 card\)/);
      expect(discardButton).toBeDisabled();
    });
  });

  describe('Upcard Decision Phase', () => {
    beforeEach(() => {
      const upcardPhaseGame = { 
        ...mockGameState, 
        phase: GamePhase.UpcardDecision 
      };
      Object.assign(mockGameStoreReturn, { gameState: upcardPhaseGame });
    });

    it('should show upcard decision interface', () => {
      render(<Game />);
      
      expect(screen.getByText('Do you want to take the upcard?')).toBeInTheDocument();
      expect(screen.getByText('Take Upcard')).toBeInTheDocument();
      expect(screen.getByText('Pass')).toBeInTheDocument();
    });

    it('should handle taking upcard', async () => {
      render(<Game />);
      
      const takeButton = screen.getByText('Take Upcard');
      await user.click(takeButton);
      
      expect(mockSocketReturn.makeMove).toHaveBeenCalledWith({
        type: MoveType.TakeUpcard,
        playerId: 'user-123',
        gameId: 'game-123'
      });
    });

    it('should handle passing upcard', async () => {
      render(<Game />);
      
      const passButton = screen.getByText('Pass');
      await user.click(passButton);
      
      expect(mockSocketReturn.makeMove).toHaveBeenCalledWith({
        type: MoveType.PassUpcard,
        playerId: 'user-123',
        gameId: 'game-123'
      });
    });
  });

  describe('Round Over State', () => {
    beforeEach(() => {
      const roundOverGame = { 
        ...mockGameState, 
        phase: GamePhase.RoundOver,
        roundScores: { 'user-123': 15, 'ai-player': 0 }
      };
      Object.assign(mockGameStoreReturn, { gameState: roundOverGame });
    });

    it('should show round complete interface', () => {
      render(<Game />);
      
      expect(screen.getByText('🎯 Round Complete!')).toBeInTheDocument();
      expect(screen.getByText('You: +15 points')).toBeInTheDocument();
      expect(screen.getByText('AI Player: +0 points')).toBeInTheDocument();
      expect(screen.getByText('Start Next Round')).toBeInTheDocument();
    });

    it('should handle starting new round', async () => {
      render(<Game />);
      
      const startRoundButton = screen.getByText('Start Next Round');
      await user.click(startRoundButton);
      
      expect(mockSocketReturn.makeMove).toHaveBeenCalledWith({
        type: MoveType.StartNewRound,
        playerId: 'user-123',
        gameId: 'game-123'
      });
    });
  });

  describe('Game Over State', () => {
    beforeEach(() => {
      const gameOverState = { 
        ...mockGameState, 
        phase: 'game_over',
        gameOver: true,
        winner: 'user-123',
        players: [
          { ...mockGameState.players[0], score: 100 },
          { ...mockGameState.players[1], score: 85 }
        ]
      };
      Object.assign(mockGameStoreReturn, { gameState: gameOverState });
    });

    it('should show game over celebration', () => {
      render(<Game />);
      
      expect(screen.getByText('Congratulations!')).toBeInTheDocument();
      expect(screen.getByText('🏆 You Won!')).toBeInTheDocument();
      expect(screen.getByText('You: 100 points')).toBeInTheDocument();
      expect(screen.getByText('AI Player: 85 points')).toBeInTheDocument();
    });

    it('should handle returning to lobby after game over', async () => {
      render(<Game />);
      
      const lobbyButton = screen.getByText('Return to Lobby');
      await user.click(lobbyButton);
      
      expect(mockRouterReturn.push).toHaveBeenCalledWith('/lobby');
    });
  });

  describe('Error Handling', () => {
    it('should show connection error when disconnected', () => {
      Object.assign(mockGameStoreReturn, { 
        gameState: mockGameState,
        isConnected: false 
      });
      
      render(<Game />);
      
      expect(screen.getByText('Disconnected from server. Reconnecting...')).toBeInTheDocument();
    });

    it('should show game errors', () => {
      Object.assign(mockGameStoreReturn, { 
        gameState: mockGameState,
        gameError: 'Invalid move' 
      });
      
      render(<Game />);
      
      expect(screen.getByText('Invalid move')).toBeInTheDocument();
    });

    it('should allow dismissing game errors', async () => {
      Object.assign(mockGameStoreReturn, { 
        gameState: mockGameState,
        gameError: 'Invalid move' 
      });
      
      render(<Game />);
      
      const dismissButton = screen.getByText('×');
      await user.click(dismissButton);
      
      expect(mockGameStoreReturn.setGameError).toHaveBeenCalledWith(null);
    });
  });

  describe('Chat Functionality', () => {
    beforeEach(() => {
      Object.assign(mockGameStoreReturn, { 
        gameState: mockGameState,
        chatMessages: [
          {
            id: 'msg-1',
            playerId: 'user-123',
            username: 'testuser',
            message: 'Good luck!'
          },
          {
            id: 'msg-2',
            playerId: 'ai-player',
            username: 'AI Player',
            message: 'Thanks!'
          }
        ]
      });
    });

    it('should display chat messages', () => {
      render(<Game />);
      
      expect(screen.getByText('Good luck!')).toBeInTheDocument();
      expect(screen.getByText('Thanks!')).toBeInTheDocument();
      expect(screen.getByText('testuser')).toBeInTheDocument();
      expect(screen.getByText('AI Player')).toBeInTheDocument();
    });

    it('should handle sending chat messages', async () => {
      render(<Game />);
      
      const chatInput = screen.getByPlaceholderText('Type a message...');
      const sendButton = screen.getByText('Send');
      
      await user.type(chatInput, 'Hello there!');
      await user.click(sendButton);
      
      expect(mockSocketReturn.sendChatMessage).toHaveBeenCalledWith('game-123', 'Hello there!');
    });

    it('should clear chat input after sending', async () => {
      render(<Game />);
      
      const chatInput = screen.getByPlaceholderText('Type a message...') as HTMLInputElement;
      const sendButton = screen.getByText('Send');
      
      await user.type(chatInput, 'Test message');
      expect(chatInput.value).toBe('Test message');
      
      await user.click(sendButton);
      expect(chatInput.value).toBe('');
    });
  });

  describe('Game Info Panel', () => {
    beforeEach(() => {
      Object.assign(mockGameStoreReturn, { gameState: mockGameState });
    });

    it('should display game rules and info', () => {
      render(<Game />);
      
      expect(screen.getByText('Game Info')).toBeInTheDocument();
      expect(screen.getByText('Deadwood: Unmelded cards')).toBeInTheDocument();
      expect(screen.getByText('Gin: 0 deadwood (bonus points)')).toBeInTheDocument();
      expect(screen.getByText('Knock: ≤10 deadwood to end round')).toBeInTheDocument();
      expect(screen.getByText('Run (R)')).toBeInTheDocument();
      expect(screen.getByText('Set (S)')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      Object.assign(mockGameStoreReturn, { gameState: mockGameState });
    });

    it('should have proper button roles and states', () => {
      render(<Game />);
      
      const discardButton = screen.getByText(/Discard/);
      expect(discardButton).toHaveAttribute('disabled');
      
      const stockButton = screen.getByText(/STOCK/);
      expect(stockButton).toBeInTheDocument();
    });

    it('should be keyboard navigable', async () => {
      render(<Game />);
      
      const discardButton = screen.getByText(/Discard/);
      discardButton.focus();
      expect(discardButton).toHaveFocus();
    });
  });

  describe('AI Status Display', () => {
    it('should show AI thinking overlay', () => {
      Object.assign(mockGameStoreReturn, { gameState: mockGameState });
      
      render(<Game />);
      
      expect(screen.getByTestId('ai-thinking-overlay')).toBeInTheDocument();
    });
  });
});