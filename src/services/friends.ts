import { api } from './api';

export interface Friend {
  id: string;
  user: {
    id: string;
    username: string;
    elo: number;
    gamesPlayed: number;
    isOnline: boolean;
    lastSeen?: string;
  };
  since: string;
}

export interface FriendRequest {
  id: string;
  user: {
    id: string;
    username: string;
    elo: number;
    gamesPlayed: number;
  };
  sentAt?: string;
  receivedAt?: string;
}

export interface FriendsResponse {
  friends: Friend[];
  sentRequests: FriendRequest[];
  receivedRequests: FriendRequest[];
}

export interface GameInvitation {
  id: string;
  game: {
    id: string;
    status: string;
    createdAt: string;
  };
  receiver?: {
    id: string;
    username: string;
  };
  sender?: {
    id: string;
    username: string;
  };
  message?: string;
  status?: string;
  sentAt?: string;
  receivedAt?: string;
  expiresAt: string;
}

export interface InvitationsResponse {
  sent: GameInvitation[];
  received: GameInvitation[];
}

export class FriendsService {
  static async getFriends(): Promise<FriendsResponse> {
    const response = await api.get('/friends');
    return response.data;
  }

  static async sendFriendRequest(username: string): Promise<FriendRequest> {
    const response = await api.post('/friends/request', { username });
    return response.data;
  }

  static async acceptFriendRequest(friendshipId: string): Promise<Friend> {
    const response = await api.post('/friends/accept', { friendshipId });
    return response.data;
  }

  static async declineFriendRequest(friendshipId: string): Promise<void> {
    await api.post('/friends/decline', { friendshipId });
  }

  static async removeFriend(friendshipId: string): Promise<void> {
    await api.delete(`/friends/${friendshipId}`);
  }

  static async getInvitations(): Promise<InvitationsResponse> {
    const response = await api.get('/invitations');
    return response.data;
  }

  static async sendGameInvitation(gameId: string, receiverUsername: string, message?: string): Promise<GameInvitation> {
    const response = await api.post('/invitations', {
      gameId,
      receiverUsername,
      message
    });
    return response.data;
  }

  static async acceptInvitation(invitationId: string): Promise<{ gameId: string; message: string }> {
    const response = await api.post('/invitations/accept', { invitationId });
    return response.data;
  }

  static async declineInvitation(invitationId: string): Promise<void> {
    await api.post('/invitations/decline', { invitationId });
  }
}