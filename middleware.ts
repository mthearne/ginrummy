import { NextRequest, NextResponse } from 'next/server';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// Rate limiters for different endpoint types
const authRateLimiter = new RateLimiterMemory({
  points: 5, // Number of requests
  duration: 60, // Per 60 seconds
});

const generalRateLimiter = new RateLimiterMemory({
  points: 100, // Number of requests  
  duration: 60, // Per 60 seconds
});

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Add CSP header for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'none'; object-src 'none';"
    );
  }

  // Rate limiting for authentication endpoints
  if (request.nextUrl.pathname.startsWith('/api/auth/')) {
    try {
      const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
      await authRateLimiter.consume(clientIP);
    } catch (rateLimiterRes) {
      return NextResponse.json(
        { 
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimiterRes.msBeforeNext 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(Math.round(rateLimiterRes.msBeforeNext / 1000)),
            'X-RateLimit-Limit': '5',
            'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints || 0),
            'X-RateLimit-Reset': String(Date.now() + rateLimiterRes.msBeforeNext),
          }
        }
      );
    }
  }

  // General rate limiting for all API routes
  if (request.nextUrl.pathname.startsWith('/api/') && !request.nextUrl.pathname.startsWith('/api/auth/')) {
    try {
      const clientIP = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
      await generalRateLimiter.consume(clientIP);
    } catch (rateLimiterRes) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please slow down.',
          retryAfter: rateLimiterRes.msBeforeNext 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(Math.round(rateLimiterRes.msBeforeNext / 1000)),
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints || 0),
            'X-RateLimit-Reset': String(Date.now() + rateLimiterRes.msBeforeNext),
          }
        }
      );
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};