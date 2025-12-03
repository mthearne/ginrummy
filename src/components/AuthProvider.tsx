'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth';
import { authAPI } from '../services/api';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const { setUser, setTokens, logout } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Get tokens from localStorage
        const accessToken = localStorage.getItem('accessToken');
        const refreshToken = localStorage.getItem('refreshToken');

        if (!accessToken || !refreshToken) {
          setIsInitialized(true);
          return;
        }

        try {
          // Verify tokens by getting user profile using the API service with automatic token refresh
          const response = await authAPI.getProfile();
          const userData = response.data;
          
          // Set the user and tokens in the store
          setUser(userData);
          setTokens(accessToken, refreshToken);
        } catch (verifyError) {
          // Clear invalid/expired tokens immediately
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          logout();
          
          // Force redirect to login page when auth fails
          router.replace('/login');
        }

      } catch (error) {
        // Clear invalid tokens
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        logout();
        
        // Force redirect to login page when auth initialization fails
        router.replace('/login');
      } finally {
        setIsInitialized(true);
      }
    };

    initializeAuth();
  }, [setUser, setTokens, logout, router]);

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