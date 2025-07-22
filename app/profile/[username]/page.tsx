'use client';
import Profile from '../../../src/pages/Profile';

// Force dynamic rendering to avoid React Router prerender issues
export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  return <Profile />;
}