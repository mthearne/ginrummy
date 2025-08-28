import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { RegisterSchema } from '@gin-rummy/common';
import { prisma } from '../../../../src/utils/database';
import { generateTokens } from '../../../../src/utils/jwt';
import { safeParseJSON, createErrorResponse, createSuccessResponse, validateContentType } from '../../../../src/utils/request-helpers';

export async function POST(request: NextRequest) {
  try {
    // Validate content type
    if (!validateContentType(request)) {
      return createErrorResponse('Content-Type must be application/json', 415);
    }

    // Safely parse JSON with proper error handling
    const parseResult = await safeParseJSON(request);
    if (!parseResult.success) {
      return createErrorResponse(parseResult.error!, 400);
    }

    const body = parseResult.data;
    
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

    return createSuccessResponse({
      user,
      ...tokens,
    }, 201);

  } catch (error) {
    console.error('Registration error:', error);
    
    let errorMessage = 'Registration failed';
    if (error.message?.includes('Unique constraint failed')) {
      errorMessage = 'Email or username already exists';
    } else if (error.message?.includes('database')) {
      errorMessage = 'Service temporarily unavailable';
    }
    
    return createErrorResponse(errorMessage, 500, process.env.NODE_ENV === 'development' ? error.message : undefined);
  }
}