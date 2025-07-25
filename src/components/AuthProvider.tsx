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
          // Use a direct fetch call to bypass the refresh interceptor during initialization
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 
                        (typeof window !== 'undefined' ? `${window.location.origin}/api` : 'http://localhost:3001');
          
          console.log('Auth verification URL:', `${apiUrl}/auth/me`);
          
          const response = await fetch(`${apiUrl}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            throw new Error(`Auth verification failed: ${response.status}`);
          }

          const userData = await response.json();
          console.log('Auth verified, setting user data:', userData.username);
          
          // Set the user and tokens in the store
          setUser(userData);
          setTokens(accessToken, refreshToken);
        } catch (verifyError) {
          console.warn('Token verification failed, clearing expired tokens:', verifyError.message);
          
          // Clear invalid/expired tokens immediately
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          logout();
          
          console.log('Logout called, user should be null now');
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