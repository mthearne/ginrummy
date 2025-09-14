import { NextRequest, NextResponse } from 'next/server';
import { revokeRefreshToken, verifyAccessToken } from '../../../../src/utils/jwt';
import { safeParseJSON, createErrorResponse, createSuccessResponse, validateContentType } from '../../../../src/utils/request-helpers';
import { prisma } from '../../../../src/utils/database';

export async function POST(request: NextRequest) {
  try {
    // Get access token from Authorization header to update lastSeen
    const authHeader = request.headers.get('authorization');
    let userId: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = verifyAccessToken(token);
        userId = decoded.userId;
      } catch (error) {
        // Token invalid/expired, but still allow logout to proceed
        console.log('Invalid access token during logout, proceeding without lastSeen update');
      }
    }

    // Allow logout without body (for access token only logout)
    let refreshToken = null;

    if (request.headers.get('content-length') !== '0') {
      if (!validateContentType(request)) {
        return createErrorResponse('Content-Type must be application/json', 415);
      }

      const parseResult = await safeParseJSON(request);
      if (!parseResult.success) {
        return createErrorResponse(parseResult.error!, 400);
      }

      refreshToken = parseResult.data?.refreshToken;
    }

    // Update user's lastSeen timestamp to mark them as offline immediately
    if (userId) {
      try {
        // Set lastSeen to 10 minutes ago to ensure they appear offline immediately
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        await prisma.user.update({
          where: { id: userId },
          data: { lastSeen: tenMinutesAgo }
        });
        console.log(`Updated lastSeen for user ${userId} during logout to appear offline`);
      } catch (error) {
        console.error('Failed to update lastSeen during logout:', error);
        // Don't fail logout if lastSeen update fails
      }
    }

    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }

    return createSuccessResponse({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    
    let errorMessage = 'Logout failed';
    if (error.message?.includes('Record to delete does not exist')) {
      errorMessage = 'Token already invalidated';
    } else if (error.message?.includes('database')) {
      errorMessage = 'Service temporarily unavailable';
    }
    
    return createErrorResponse(errorMessage, 500, process.env.NODE_ENV === 'development' ? error.message : undefined);
  }
}