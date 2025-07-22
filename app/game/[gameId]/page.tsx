'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../src/store/auth';
import Game from '../../../src/pages/Game';

// Force dynamic rendering to avoid React Router prerender issues
export const dynamic = 'force-dynamic';

export default function GamePage() {
  const { user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    }
  }, [user, router]);

  if (!user) {
    return null;
  }

  return <Game />;
}