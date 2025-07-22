'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../src/store/auth';
import Lobby from '../../src/pages/Lobby';

// Force dynamic rendering to avoid React Router prerender issues
export const dynamic = 'force-dynamic';

export default function LobbyPage() {
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

  return <Lobby />;
}