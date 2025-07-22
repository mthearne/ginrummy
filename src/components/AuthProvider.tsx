'use client';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/auth';
import { authAPI } from '../services/api';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const { setUser, setTokens, logout } = useAuthStore();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get tokens from localStorage
        const accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken');

        if (!accessToken || !refreshToken) {
          console.log('No tokens found, user not logged in');
          setIsInitialized(true);
          return;
        }

        console.log('Found tokens, verifying with server...');
        
        try {
          // Verify tokens by getting user profile
          const response = await authAPI.getProfile();
          const userData = response.data;

          console.log('Auth verified, setting user data:', userData.username);
          
          // Set the user and tokens in the store
          setUser(userData);
          setTokens(accessToken, refreshToken);
        } catch (verifyError) {
          console.warn('Token verification failed, but keeping tokens for now:', verifyError.message);
          // Keep the tokens but don't set user data
          // This allows API calls to be made with potentially valid tokens
          setTokens(accessToken, refreshToken);
        }

      } catch (error) {
        console.error('Auth initialization failed:', error);
        // Clear invalid tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        logout();
      } finally {
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, [setUser, setTokens, logout]);

  // Show loading state while initializing
  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <div className="loading" />
          <span className="text-gray-600">Loading...</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}