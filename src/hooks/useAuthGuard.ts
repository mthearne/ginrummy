import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../store/auth';

/**
 * Hook to protect routes by redirecting unauthenticated users to login
 * @param redirectTo - Where to redirect if not authenticated (default: '/login')
 */
export function useAuthGuard(redirectTo: string = '/login') {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.push(redirectTo);
    }
  }, [user, router, redirectTo]);

  return { user, isAuthenticated: !!user };
}