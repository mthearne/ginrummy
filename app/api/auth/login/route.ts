import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { LoginSchema } from '@gin-rummy/common';
import { prisma } from '../../../../src/utils/database';
import { generateTokens } from '../../../../src/utils/jwt';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.errors },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate tokens
    const tokens = await generateTokens({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;

    return NextResponse.json({
      user: userWithoutPassword,
      ...tokens,
    });

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}