import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../src/utils/database';
import { generateTokens } from '../../../../src/utils/jwt';

export async function POST() {
  // Only allow in development or with specific debug flag  
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_MODE !== 'true') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const email = 'demo@example.com';
    const password = 'Password123';

    console.log('Debug: Starting test login process');

    // Step 1: Find user
    console.log('Debug: Looking for user with email:', email);
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      console.log('Debug: User not found');
      return NextResponse.json({ error: 'User not found', step: 'find_user' }, { status: 404 });
    }

    console.log('Debug: User found:', user.id, user.username);

    // Step 2: Verify password
    console.log('Debug: Verifying password');
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('Debug: Password verification failed');
      return NextResponse.json({ error: 'Invalid password', step: 'verify_password' }, { status: 401 });
    }

    console.log('Debug: Password verified successfully');

    // Step 3: Generate tokens
    console.log('Debug: Generating tokens');
    const tokens = await generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    console.log('Debug: Tokens generated successfully');

    // Return success
    const { password: _, ...userWithoutPassword } = user;
    return NextResponse.json({
      message: 'Test login successful',
      user: userWithoutPassword,
      hasTokens: !!tokens.accessToken && !!tokens.refreshToken,
      step: 'complete'
    });

  } catch (error) {
    console.error('Debug test login error:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    return NextResponse.json(
      { 
        error: 'Test login failed',
        details: error.message,
        step: 'error'
      },
      { status: 500 }
    );
  }
}