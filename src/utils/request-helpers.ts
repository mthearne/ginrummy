import { NextRequest, NextResponse } from 'next/server';

export interface ParsedRequestResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Safely parse JSON from a NextRequest with proper error handling
 * Returns 400 status for malformed JSON instead of letting it throw to 500
 */
export async function safeParseJSON<T = any>(request: NextRequest): Promise<ParsedRequestResult<T>> {
  try {
    const text = await request.text();
    
    if (!text.trim()) {
      return {
        success: false,
        error: 'Request body is empty'
      };
    }

    const data = JSON.parse(text);
    return {
      success: true,
      data
    };
  } catch (error) {
    return {
      success: false,
      error: 'Invalid JSON format'
    };
  }
}

/**
 * Create consistent error responses for API routes
 */
export function createErrorResponse(message: string, status: number = 400, details?: any) {
  const response: any = { error: message };
  
  // Only include details in development
  if (process.env.NODE_ENV === 'development' && details) {
    response.details = details;
  }

  return NextResponse.json(response, { status });
}

/**
 * Create success responses for API routes
 */
export function createSuccessResponse(data: any, status: number = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Validate content type for API routes
 */
export function validateContentType(request: NextRequest, expectedTypes: string[] = ['application/json']): boolean {
  const contentType = request.headers.get('content-type');
  
  if (!contentType) {
    return false;
  }

  return expectedTypes.some(type => contentType.includes(type));
}