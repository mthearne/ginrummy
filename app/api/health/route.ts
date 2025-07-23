import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Skip database check during build time
    let databaseStatus = 'skipped';
    let databaseError = null;

    if (process.env.NODE_ENV !== 'development' || process.env.VERCEL) {
      // Try to connect to database only in production/runtime
      try {
        const { prisma } = await import('../../../src/utils/database');
        await prisma.$queryRaw`SELECT 1 as test`;
        databaseStatus = 'connected';
      } catch (error) {
        console.error('Health check database error:', error);
        databaseStatus = 'disconnected';
        databaseError = error.message;
      }
    }
    
    return NextResponse.json({ 
      status: databaseError ? 'degraded' : 'ok', 
      timestamp: new Date().toISOString(),
      database: databaseStatus,
      environment: process.env.NODE_ENV,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      ...(databaseError && { databaseError })
    });
  } catch (error) {
    console.error('Health check error:', error);
    
    return NextResponse.json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      database: 'error',
      environment: process.env.NODE_ENV,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      error: error.message
    }, { status: 500 });
  }
}