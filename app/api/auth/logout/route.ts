import { NextRequest, NextResponse } from 'next/server';
import { revokeRefreshToken } from '../../../../src/utils/jwt';
import { safeParseJSON, createErrorResponse, createSuccessResponse, validateContentType } from '../../../../src/utils/request-helpers';

export async function POST(request: NextRequest) {
  try {
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