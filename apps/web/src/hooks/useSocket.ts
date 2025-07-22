import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/auth';
import { socketService } from '../services/socket';

export const useSocket = () => {
  const { accessToken, isAuthenticated } = useAuthStore();
  const socketRef = useRef(socketService);

  useEffect(() => {
    if (isAuthenticated() && accessToken) {
      // Connect to socket when authenticated
      socketRef.current.connect(accessToken);
    } else {
      // Disconnect when not authenticated
      socketRef.current.disconnect();
    }

    // Cleanup on unmount
    return () => {
      socketRef.current.disconnect();
    };
  }, [isAuthenticated, accessToken]);

  return socketRef.current;
};