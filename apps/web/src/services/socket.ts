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
    const API_URL = import.meta.env.VITE_API_URL || (
      typeof window !== 'undefined' && window.location.hostname !== 'localhost' 
        ? '' 
        : 'http://localhost:3001'
    );
    
    this.socket = io(API_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.setupEventListeners();
    return this.socket;
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
    this.socket?.emit('join_game', { gameId });
  }

  leaveGame(gameId: string) {
    this.socket?.emit('leave_game', { gameId });
  }

  makeMove(move: GameMove) {
    this.socket?.emit('play_move', move);
  }

  sendChatMessage(gameId: string, message: string) {
    this.socket?.emit('send_chat', { gameId, message });
  }

  // Connection status
  isConnected(): boolean {
    return this.socket?.connected || false;
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