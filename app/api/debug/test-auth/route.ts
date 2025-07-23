import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '../../../../src/utils/jwt';

export async function GET(request: NextRequest) {
  try {
    console.log('=== Debug Auth Test Started ===');
    
    // Check auth header
    const authHeader = request.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);
    console.log('Auth header value:', authHeader?.substring(0, 30));
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No valid auth header found');
      return NextResponse.json({
        success: false,
        error: 'Missing auth header',
        hasHeader: !!authHeader,
        headerPrefix: authHeader?.substring(0, 10)
      });
    }

    // Extract token
    const token = authHeader.substring(7);
    console.log('Token extracted, length:', token.length);
    console.log('Token start:', token.substring(0, 20));

    // Test JWT verification
    console.log('Testing JWT verification...');
    let decoded;
    try {
      decoded = verifyAccessToken(token);
      console.log('JWT verified successfully');
      console.log('Decoded payload:', decoded);
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError.message);
      return NextResponse.json({
        success: false,
        error: 'JWT verification failed',
        details: jwtError.message
      });
    }

    // Check environment variables
    console.log('Environment check:');
    console.log('JWT_SECRET present:', !!process.env.JWT_SECRET);
    console.log('DATABASE_URL present:', !!process.env.DATABASE_URL);

    console.log('=== Debug Auth Test Completed Successfully ===');
    
    return NextResponse.json({
      success: true,
      message: 'Authentication test passed',
      user: {
        id: decoded.userId,
        email: decoded.email,
        username: decoded.username
      },
      environment: process.env.NODE_ENV,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL
    });

  } catch (error) {
    console.error('=== Debug Auth Test Error ===');
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });

    return NextResponse.json({
      success: false,
      error: 'Test failed',
      details: error.message
    }, { status: 500 });
  }
}