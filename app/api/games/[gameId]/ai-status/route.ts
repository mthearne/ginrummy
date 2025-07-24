import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../../src/utils/jwt';
import { prisma } from '../../../../../src/utils/database';
import { persistentGameCache } from '../../../../../src/utils/persistentGameCache';
import { fallbackGameCache } from '../../../../../src/utils/fallbackGameCache';

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

    // Get game from database
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!game) {
      return NextResponse.json(
        { error: 'Game not found' },
        { status: 404 }
      );
    }

    // Check if user is a player in this game
    const isPlayer = game.player1Id === decoded.userId || game.player2Id === decoded.userId;
    
    if (!isPlayer) {
      return NextResponse.json(
        { error: 'Access denied. You are not a player in this game.' },
        { status: 403 }
      );
    }

    // Only check AI status for AI games
    if (!game.vsAI) {
      return NextResponse.json({ aiProcessing: false });
    }

    // Check if AI processing is complete - only check fallback cache for completion flags
    const completionKey = `${gameId}_ai_complete`;
    let completionData;
    
    try {
      // Only check fallback cache for completion flags
      completionData = await fallbackGameCache.get(completionKey);
      console.log('Completion check result:', completionData ? 'Found' : 'Not found');
    } catch (error) {
      console.log('Error checking completion flag:', error);
      // No completion data found, AI still processing
      return NextResponse.json({ aiProcessing: true });
    }

    // If we found completion data, AI is done
    if (completionData) {
      // Clean up the completion flag from fallback cache only
      try {
        await fallbackGameCache.delete(completionKey);
        console.log('Cleaned up completion flag for game:', gameId);
      } catch (error) {
        console.log('Failed to clean up completion flag:', error);
      }

      // Return the completed game state
      return NextResponse.json({
        aiProcessing: false,
        gameState: completionData
      });
    }

    return NextResponse.json({ aiProcessing: true });

  } catch (error) {
    console.error('AI status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}