'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../src/store/auth';
import { useSocket } from '../src/hooks/useSocket';
import Home from '../src/components/pages/Home';
import { api } from '../src/services/api';

// Force dynamic rendering to avoid React Router prerender issues
export const dynamic = 'force-dynamic';

export default function Page() {
  const { user, setUser, setTokens, logout } = useAuthStore();
  const router = useRouter();
  
  // Initialize socket connection when authenticated
  useSocket();

  useEffect(() => {
    // If user is logged in, redirect to lobby
    if (user) {
      router.push('/lobby');
      return;
    }

    // Check for stored auth tokens on app start
    const accessToken = localStorage.getItem('accessToken');
    const refreshToken = localStorage.getItem('refreshToken');

    if (accessToken && refreshToken) {
      // Verify token and get user info
      api.get('/auth/me')
        .then(response => {
          setUser(response.data);
          setTokens(accessToken, refreshToken);
          router.push('/lobby');
        })
        .catch(() => {
          // Token invalid, clear storage
          logout();
        });
    }
  }, [user, setUser, setTokens, logout, router]); // Added 'user' dependency

  if (user) {
    router.push('/lobby');
    return null;
  }

  return <Home />;
}