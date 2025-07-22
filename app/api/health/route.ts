import { NextResponse } from 'next/server';
import { prisma } from '../../../src/utils/database';

export async function GET() {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1 as test`;
    
    return NextResponse.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NODE_ENV,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
    });
  } catch (error) {
    console.error('Health check error:', error);
    
    return NextResponse.json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      environment: process.env.NODE_ENV,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      error: error.message
    }, { status: 500 });
  }
}