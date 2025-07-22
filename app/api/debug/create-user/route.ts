import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '../../../../src/utils/database';

export async function POST() {
  // Only allow in development or with specific debug flag
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG_MODE !== 'true') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    // Check if demo user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'demo@example.com' }
    });

    if (existingUser) {
      return NextResponse.json({ 
        message: 'Demo user already exists',
        user: {
          id: existingUser.id,
          email: existingUser.email,
          username: existingUser.username
        }
      });
    }

    // Create demo user
    const hashedPassword = await bcrypt.hash('Password123', 12);
    
    const user = await prisma.user.create({
      data: {
        email: 'demo@example.com',
        username: 'demo',
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        username: true,
        elo: true,
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      message: 'Demo user created successfully',
      user
    });

  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create user',
        details: error.message 
      },
      { status: 500 }
    );
  }
}