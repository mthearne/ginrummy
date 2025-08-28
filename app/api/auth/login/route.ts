import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { LoginSchema } from '@gin-rummy/common';
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

    return createSuccessResponse({
      user: userWithoutPassword,
      ...tokens,
    });

  } catch (error) {
    // Enhanced error logging for production debugging
    console.error('Login error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
    });
    
    // More specific error messages for different failure modes
    let errorMessage = 'Internal server error';
    if (error.message?.includes('database') || error.message?.includes('connect')) {
      errorMessage = 'Service temporarily unavailable';
    } else if (error.message?.includes('bcrypt')) {
      errorMessage = 'Authentication service error';
    } else if (error.message?.includes('jwt') || error.message?.includes('token')) {
      errorMessage = 'Token service error';
    }
    
    return createErrorResponse(errorMessage, 500, process.env.NODE_ENV === 'development' ? error.message : undefined);
  }
}