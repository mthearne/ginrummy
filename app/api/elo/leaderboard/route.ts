import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '../../../../lib/auth';
import { getEloLeaderboard } from '../../../../src/utils/elo';

/**
 * GET /api/elo/leaderboard
 * 
 * Get ELO leaderboard (top players)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get limit from query params (default 10, max 50)
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(Math.max(parseInt(limitParam), 1), 50) : 10;

    // Get ELO leaderboard
    const leaderboard = await getEloLeaderboard(limit);

    return NextResponse.json({
      success: true,
      leaderboard,
      limit
    });

  } catch (error) {
    console.error('💥 ELO Leaderboard: Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}