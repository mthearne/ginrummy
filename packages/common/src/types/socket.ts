import { GameState, GameMove } from './game.js';

export interface ServerToClientEvents {
  game_state: (state: Partial<GameState>) => void;
  game_waiting: (waitingInfo: GameWaitingInfo) => void;
  game_joined: (gameId: string) => void;
  game_error: (error: string) => void;
  player_joined: (player: { id: string; username: string }) => void;
  player_left: (playerId: string) => void;
  chat_message: (message: ChatMessage) => void;
  game_started: () => void;
  game_ended: (result: GameEndResult) => void;
  turn_timeout: () => void;
  lobby_update: (data: { games: any[]; onlineUsers: number }) => void;
  friend_request: (request: FriendRequestNotification) => void;
  friend_request_accepted: (friendship: FriendshipNotification) => void;
  game_invitation: (invitation: GameInvitationNotification) => void;
  invitation_response: (response: InvitationResponseNotification) => void;
}

export interface ClientToServerEvents {
  join_game: (data: { gameId: string }) => void;
  leave_game: (data: { gameId: string }) => void;
  play_move: (move: GameMove) => void;
  send_chat: (data: { gameId: string; message: string }) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  username: string;
  gameId?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  message: string;
  timestamp: string;
}

export interface GameEndResult {
  winner: string;
  loser: string;
  winnerScore: number;
  loserScore: number;
  knockType: 'gin' | 'knock' | 'undercut';
  eloChanges: { [playerId: string]: number };
}

export interface GameWaitingInfo {
  gameId: string;
  status: 'WAITING';
  player1: {
    id: string;
    username: string;
  };
  vsAI: boolean;
  isPrivate: boolean;
}

export interface FriendRequestNotification {
  id: string;
  from: {
    id: string;
    username: string;
  };
  sentAt: string;
}

export interface FriendshipNotification {
  id: string;
  friend: {
    id: string;
    username: string;
  };
  since: string;
}

export interface GameInvitationNotification {
  id: string;
  from: {
    id: string;
    username: string;
  };
  gameId: string;
  message?: string;
  sentAt: string;
  expiresAt: string;
}

export interface InvitationResponseNotification {
  invitationId: string;
  gameId: string;
  from: {
    id: string;
    username: string;
  };
  response: 'accepted' | 'declined';
}