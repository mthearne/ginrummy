import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { persistentGameCache } from '../../../../../src/utils/persistentGameCache';
import { fallbackGameCache } from '../../../../../src/utils/fallbackGameCache';

/**
 * Get AI thought process for display
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const { gameId } = params;
    
    // Get game engine from cache
    let gameEngine;
    try {
      gameEngine = await persistentGameCache.get(gameId);
      if (!gameEngine) {
        gameEngine = await fallbackGameCache.get(gameId);
      }
    } catch (error) {
      console.log('Cache retrieval failed:', error.message);
    }
    
    if (!gameEngine) {
      return NextResponse.json(
        { error: 'Game state not found' },
        { status: 404 }
      );
    }

    // Get AI thoughts
    const thoughts = gameEngine.getAIThoughts();
    
    return NextResponse.json({
      success: true,
      thoughts
    });

  } catch (error) {
    console.error('AI Thoughts API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}