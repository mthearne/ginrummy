import { Server } from 'socket.io';
import { FriendRequestNotification, FriendshipNotification, GameInvitationNotification, InvitationResponseNotification } from '@gin-rummy/common';

let io: Server;

export const initializeNotifications = (socketServer: Server) => {
  io = socketServer;
};

export const sendFriendRequestNotification = (receiverId: string, notification: FriendRequestNotification) => {
  if (!io) return;
  
  // Find socket by user ID and send notification
  io.sockets.sockets.forEach(socket => {
    if (socket.data.userId === receiverId) {
      socket.emit('friend_request', notification);
    }
  });
};

export const sendFriendRequestAcceptedNotification = (senderId: string, notification: FriendshipNotification) => {
  if (!io) return;
  
  io.sockets.sockets.forEach(socket => {
    if (socket.data.userId === senderId) {
      socket.emit('friend_request_accepted', notification);
    }
  });
};

export const sendGameInvitationNotification = (receiverId: string, notification: GameInvitationNotification) => {
  if (!io) return;
  
  io.sockets.sockets.forEach(socket => {
    if (socket.data.userId === receiverId) {
      socket.emit('game_invitation', notification);
    }
  });
};

export const sendInvitationResponseNotification = (senderId: string, notification: InvitationResponseNotification) => {
  if (!io) return;
  
  io.sockets.sockets.forEach(socket => {
    if (socket.data.userId === senderId) {
      socket.emit('invitation_response', notification);
    }
  });
};