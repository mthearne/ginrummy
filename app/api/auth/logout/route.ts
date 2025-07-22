import { NextRequest, NextResponse } from 'next/server';
import { revokeRefreshToken } from '../../../../src/utils/jwt';

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    return NextResponse.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Logout failed' },
      { status: 500 }
    );
  }
}