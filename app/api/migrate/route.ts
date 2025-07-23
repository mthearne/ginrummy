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
    const gameStateResult = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'games' AND column_name = 'game_state'
    ` as any[];

    if (gameStateResult.length === 0) {
      console.log('Adding game_state column...');
      
      // Add the missing game_state column
      await prisma.$executeRaw`
        ALTER TABLE games ADD COLUMN IF NOT EXISTS game_state JSONB
      `;
      
      console.log('game_state column added successfully');
    } else {
      console.log('game_state column already exists');
    }

    // Check if notifications table exists
    const notificationsTableResult = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'notifications'
    ` as any[];

    if (notificationsTableResult.length === 0) {
      console.log('Creating notifications table...');
      
      // Create the notifications table
      await prisma.$executeRaw`
        CREATE TABLE notifications (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          user_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('FRIEND_REQUEST', 'FRIEND_REQUEST_ACCEPTED', 'GAME_INVITATION', 'INVITATION_RESPONSE', 'GAME_STARTED', 'GAME_ENDED')),
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          data JSONB,
          read BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          expires_at TIMESTAMP(3),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `;
      
      console.log('notifications table created successfully');
    } else {
      console.log('notifications table already exists');
    }

    // Verify both changes
    const gameStateVerification = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'games' AND column_name = 'game_state'
    ` as any[];

    const notificationsVerification = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'notifications'
    ` as any[];

    return NextResponse.json({
      success: true,
      message: 'Migration completed successfully',
      gameStateColumnExists: gameStateVerification.length > 0,
      notificationsTableExists: notificationsVerification.length > 0,
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