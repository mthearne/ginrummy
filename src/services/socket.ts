import { io, Socket } from 'socket.io-client';
import {
  ServerToClientEvents,
  ClientToServerEvents,
  GameMove,
  FriendRequestNotification,
  FriendshipNotification,
  GameInvitationNotification,
  InvitationResponseNotification,
} from '@gin-rummy/common';
import { useGameStore } from '../store/game';
import { useLobbyStore } from '../store/lobby';
import { useNotificationStore } from '../store/notifications';

class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

  connect(token: string) {
    // In Next.js (especially on Vercel), Socket.io doesn't work reliably
    // So we'll primarily use REST API with optional Socket.io enhancement
    console.log('Socket service initialized - using REST API mode');
    
    // Mark as "connected" since we'll use REST API fallback
    useGameStore.getState().setConnected(true);
    
    // Optionally try Socket.io for real-time features (won't work on Vercel)
    this.trySocketConnection(token);
    
    return this.socket;
  }

  private trySocketConnection(token: string) {
    // Only try socket.io in development or if explicitly available
    if (typeof window === 'undefined') return;
    
    const isLocalhost = window.location.hostname === 'localhost';
    if (!isLocalhost) {
      console.log('Skipping Socket.io on production - using REST API only');
      return;
    }

    try {
      // Try to connect to socket.io server (development only)
      const API_URL = 'http://localhost:3001';
      
      this.socket = io(API_URL, {
        auth: { token },
        transports: ['websocket', 'polling'],
        timeout: 2000,
        autoConnect: true,
      });

      this.setupEventListeners();
      
      setTimeout(() => {
        if (!this.socket?.connected) {
          console.log('Socket.io not available, using REST API only');
        }
      }, 2000);
      
    } catch (error) {
      console.log('Socket.io not available:', error.message);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      console.log('Connected to server');
      useGameStore.getState().setConnected(true);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      useGameStore.getState().setConnected(false);
    });

    this.socket.on('connect_error', (error) => {
      console.log('Socket.io connection error:', error.message);
      useGameStore.getState().setConnected(false);
    });

    // Game events
    this.socket.on('game_state', (state) => {
      useGameStore.getState().setGameState(state);
    });

    this.socket.on('game_waiting', (waitingInfo) => {
      console.log(`Game waiting for players:`, waitingInfo);
      useGameStore.getState().setWaitingState(waitingInfo);
    });

    this.socket.on('game_joined', (gameId) => {
      console.log(`Joined game: ${gameId}`);
    });

    this.socket.on('game_error', (error) => {
      console.error('Game error:', error);
      useGameStore.getState().setGameError(error);
    });

    this.socket.on('player_joined', (player) => {
      console.log(`Player joined: ${player.username}`);
    });

    this.socket.on('player_left', (playerId) => {
      console.log(`Player left: ${playerId}`);
    });

    this.socket.on('chat_message', (message) => {
      useGameStore.getState().addChatMessage(message);
    });

    this.socket.on('game_started', () => {
      console.log('Game started');
    });

    this.socket.on('game_ended', (result) => {
      console.log('Game ended:', result);
      // Handle game end result
    });

    this.socket.on('turn_timeout', () => {
      console.log('Turn timeout');
      useGameStore.getState().setGameError('Turn timeout - move was made automatically');
    });

    // Lobby events (if implemented)
    this.socket.on('lobby_update' as any, (data: any) => {
      useLobbyStore.getState().setGames(data.games);
      useLobbyStore.getState().setOnlineUsers(data.onlineUsers);
    });

    // Notification events
    this.socket.on('friend_request', (request: FriendRequestNotification) => {
      console.log('Friend request received:', request);
      useNotificationStore.getState().addNotification({
        type: 'friend_request',
        title: 'Friend Request',
        message: `${request.from.username} sent you a friend request`,
        actionable: true,
        data: {
          friendshipId: request.id,
          userId: request.from.id,
          username: request.from.username,
        },
      });
    });

    this.socket.on('friend_request_accepted', (friendship: FriendshipNotification) => {
      console.log('Friend request accepted:', friendship);
      useNotificationStore.getState().addNotification({
        type: 'friend_accepted',
        title: 'Friend Request Accepted',
        message: `${friendship.friend.username} accepted your friend request!`,
        actionable: false,
        data: {
          userId: friendship.friend.id,
          username: friendship.friend.username,
        },
      });
    });

    this.socket.on('game_invitation', (invitation: GameInvitationNotification) => {
      console.log('Game invitation received:', invitation);
      const message = invitation.message 
        ? `${invitation.from.username}: ${invitation.message}` 
        : `${invitation.from.username} invited you to a game`;
      
      useNotificationStore.getState().addNotification({
        type: 'game_invitation',
        title: 'Game Invitation',
        message,
        actionable: true,
        data: {
          invitationId: invitation.id,
          gameId: invitation.gameId,
          userId: invitation.from.id,
          username: invitation.from.username,
        },
      });
    });

    this.socket.on('invitation_response', (response: InvitationResponseNotification) => {
      console.log('Invitation response:', response);
      const message = response.response === 'accepted' 
        ? `${response.from.username} accepted your game invitation!`
        : `${response.from.username} declined your game invitation`;
        
      useNotificationStore.getState().addNotification({
        type: 'invitation_response',
        title: response.response === 'accepted' ? 'Invitation Accepted' : 'Invitation Declined',
        message,
        actionable: false,
        data: {
          gameId: response.gameId,
          userId: response.from.id,
          username: response.from.username,
        },
      });
    });
  }

  // Game actions
  joinGame(gameId: string) {
    console.log(`Attempting to join game: ${gameId}`);
    
    // Always use REST API as primary method (works reliably in Next.js/Vercel)
    this.joinGameViaAPI(gameId);
    
    // Optionally emit to Socket.io if available (development enhancement)
    if (this.socket?.connected) {
      console.log('Also notifying Socket.io server');
      this.socket.emit('join_game', { gameId });
    }
  }

  // REST API fallback for joining games
  private async joinGameViaAPI(gameId: string) {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('No access token found');
        return;
      }

      const response = await fetch(`/api/games/${gameId}/state`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      // Update game store with the received state
      if (data.gameState) {
        useGameStore.getState().setGameState(data.gameState);
        useGameStore.getState().setConnected(true);
        console.log('Game state loaded via REST API:', data.gameState);
        
        // No longer need AI polling - using synchronous processing
      } else if (data.waitingState) {
        useGameStore.getState().setWaitingState(data.waitingState);
        useGameStore.getState().setConnected(true);
        console.log('Waiting state loaded via REST API:', data.waitingState);
      }

    } catch (error) {
      console.error('Failed to load game state via API:', error);
      useGameStore.getState().setGameError('Failed to load game');
    }
  }

  leaveGame(gameId: string) {
    this.socket?.emit('leave_game', { gameId });
  }

  makeMove(move: GameMove) {
    // Always use REST API for moves (works reliably in Next.js/Vercel)
    this.makeMoveViaAPI(move);
    
    // Optionally emit to Socket.io if available (development enhancement)
    if (this.socket?.connected) {
      console.log('Also notifying Socket.io server of move');
      this.socket.emit('play_move', move);
    }
  }

  // REST API for making moves
  private async makeMoveViaAPI(move: GameMove) {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.error('No access token found');
        return;
      }

      console.log('Making move via REST API:', move);
      
      // Debug: Log current game state before making move
      const currentGameState = useGameStore.getState().gameState;
      if (currentGameState) {
        console.log('Frontend game state before move - Phase:', currentGameState.phase, 'Current player:', currentGameState.currentPlayerId);
        console.log('Move validation check - Move player ID:', move.playerId, 'Current player ID:', currentGameState.currentPlayerId, 'Match:', move.playerId === currentGameState.currentPlayerId);
      }

      const response = await fetch(`/api/games/${move.gameId}/move`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(move)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (errorData.code === 'GAME_STATE_LOST') {
          // Special handling for game state lost error
          useGameStore.getState().setGameError(errorData.error);
          return;
        }
        
        throw new Error(`HTTP ${response.status}: ${errorData.error || 'Unknown error'}`);
      }

      const data = await response.json();
      
      // Update game store with the new state
      if (data.gameState) {
        console.log('Move successful, received state from backend:', {
          phase: data.gameState.phase,
          currentPlayerId: data.gameState.currentPlayerId,
          gameId: data.gameState.id
        });
        
        // Log AI processing debug info
        if (data.debug) {
          console.log('🤖 AI Processing Debug:', data.debug);
          if (data.debug.aiProcessingTriggered) {
            console.log('✅ AI processing was triggered');
            console.log('Pre-AI state:', data.debug.preAIState);
            console.log('Post-AI state:', data.debug.postAIState);
          } else {
            console.log('❌ AI processing was NOT triggered');
          }
        }
        
        useGameStore.getState().setGameState(data.gameState);
        console.log('Move successful, new state:', data.gameState);
        
        // AI processing is now synchronous - no polling needed
        console.log('Move completed. Current player:', data.gameState.currentPlayerId, 'Phase:', data.gameState.phase);
      }

    } catch (error) {
      console.error('Failed to make move via API:', error);
      useGameStore.getState().setGameError('Failed to make move: ' + error.message);
    }
  }

  sendChatMessage(gameId: string, message: string) {
    this.socket?.emit('send_chat', { gameId, message });
  }

  // AI polling removed - using synchronous processing in API

  // Connection status
  isConnected(): boolean {
    // In Next.js mode, we're always "connected" via REST API
    return true;
  }

  // Getters
  getSocket() {
    return this.socket;
  }
}

// Create singleton instance
export const socketService = new SocketService();

// Hook for using socket in components
export const useSocket = () => {
  return socketService;
};