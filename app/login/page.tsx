'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../src/store/auth';
import Login from '../../src/pages/Login';

// Force dynamic rendering to avoid React Router prerender issues
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/lobby');
    }
  }, [user, router]);

  if (user) {
    return null;
  }

  return <Login />;
}