import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';
import { prisma } from '../../../../src/utils/database';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    console.log('Auth header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({
        error: 'No auth header',
        hasHeader: !!authHeader,
        headerStart: authHeader?.substring(0, 20),
        step: 'auth_check'
      }, { status: 401 });
    }

    const token = authHeader.substring(7);
    console.log('Token length:', token.length);
    console.log('Token start:', token.substring(0, 20));

    let decoded;
    try {
      decoded = verifyAccessToken(token);
      console.log('Token decoded successfully:', decoded ? 'Yes' : 'No');
    } catch (tokenError) {
      console.error('Token decode error:', tokenError.message);
      return NextResponse.json({
        error: 'Token decode failed',
        details: tokenError.message,
        step: 'token_decode'
      }, { status: 401 });
    }

    if (!decoded) {
      return NextResponse.json({
        error: 'Token decoded but null',
        step: 'token_null'
      }, { status: 401 });
    }

    console.log('Testing database connection...');
    const gameCount = await prisma.game.count();
    console.log('Game count:', gameCount);

    return NextResponse.json({
      success: true,
      userId: decoded.userId,
      username: decoded.username,
      gameCount,
      step: 'complete'
    });

  } catch (error) {
    console.error('Test games error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    return NextResponse.json({
      error: 'Test failed',
      details: error.message,
      step: 'error'
    }, { status: 500 });
  }
}