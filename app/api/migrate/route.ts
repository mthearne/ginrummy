import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../src/utils/database';

export async function POST(request: NextRequest) {
  try {
    // Security check - only allow in development or with secret
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.MIGRATION_SECRET || 'dev-migration-secret';
    
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('Starting database migration...');

    // Check if game_state column exists
    const result = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'games' AND column_name = 'game_state'
    ` as any[];

    if (result.length === 0) {
      console.log('Adding game_state column...');
      
      // Add the missing game_state column
      await prisma.$executeRaw`
        ALTER TABLE games ADD COLUMN IF NOT EXISTS game_state JSONB
      `;
      
      console.log('game_state column added successfully');
    } else {
      console.log('game_state column already exists');
    }

    // Verify the column was added
    const verification = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'games' AND column_name = 'game_state'
    ` as any[];

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
      columnExists: verification.length > 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Migration failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Migration endpoint - use POST to run migration',
    environment: process.env.NODE_ENV
  });
}