import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Log all request headers
  console.log('=== All Request Headers ===');
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
    console.log(`${key}: ${value}`);
  });

  return NextResponse.json({
    message: 'Header test endpoint',
    allHeaders: headers,
    authHeader: request.headers.get('authorization'),
    userAgent: request.headers.get('user-agent'),
    origin: request.headers.get('origin'),
    referer: request.headers.get('referer'),
    method: request.method
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}

// Add CORS headers
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}