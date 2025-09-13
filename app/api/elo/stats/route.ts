import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '../../../../lib/auth';
import { getPlayerEloStats } from '../../../../src/utils/elo';

/**
 * GET /api/elo/stats
 * 
 * Get ELO statistics for the current user
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

    const userId = authResult.user.id;

    // Get player ELO statistics
    const stats = await getPlayerEloStats(userId);
    
    if (!stats) {
      return NextResponse.json(
        { error: 'Player stats not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('💥 ELO Stats: Unexpected error:', error);
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