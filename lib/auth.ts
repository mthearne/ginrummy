import { NextRequest } from 'next/server';
import { verifyAccessToken } from '../src/utils/jwt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type AuthResult = {
  success: true;
  user: {
    id: string;
    userId: string; // For backward compatibility
    username: string;
  };
} | {
  success: false;
  error: string;
};

/**
 * Verify authentication from NextRequest
 * Used by V2 API endpoints for consistent auth handling
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        success: false,
        error: 'Authorization token required',
      };
    }

    const token = authHeader.substring(7);
    const decoded = verifyAccessToken(token);
    
    if (!decoded) {
      return {
        success: false,
        error: 'Invalid or expired token',
      };
    }

    // Fetch user details from database to get username
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, username: true }
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    return {
      success: true,
      user: {
        id: user.id,
        userId: user.id, // Backward compatibility
        username: user.username,
      },
    };

  } catch (error) {
    console.error('Auth verification error:', error);
    return {
      success: false,
      error: 'Authentication failed',
    };
  }
}