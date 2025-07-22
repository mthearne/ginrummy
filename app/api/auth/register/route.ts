import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { RegisterSchema } from '@gin-rummy/common';
import { prisma } from '../../../../src/utils/database';
import { generateTokens } from '../../../../src/utils/jwt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const parsed = RegisterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { email, username, password } = parsed.data;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username },
        ],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: existingUser.email === email 
            ? 'Email already registered' 
            : 'Username already taken',
        },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        username,
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

    // Generate tokens
    const tokens = await generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    return NextResponse.json({
      user,
      ...tokens,
    }, { status: 201 });

  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}