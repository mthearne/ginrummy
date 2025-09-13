import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { getAIQueueProcessor } from '../../../../lib/ai-queue-processor';

const prisma = new PrismaClient();
const aiQueueProcessor = getAIQueueProcessor(prisma);

/**
 * GET /api/ai/queue
 * 
 * AI Queue Status Monitoring Endpoint
 * Shows current AI processing queue status for debugging and monitoring
 */
export async function GET(request: NextRequest) {
  try {
    const status = aiQueueProcessor.getQueueStatus();
    
    return NextResponse.json({
      success: true,
      queue: status,
      timestamp: new Date().toISOString(),
      version: 'v2-event-sourced',
    });

  } catch (error) {
    console.error('❌ AI Queue Status: Error getting queue status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get queue status',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/ai/queue
 * 
 * Clear AI Queue (for testing/debugging)
 */
export async function DELETE(request: NextRequest) {
  try {
    const statusBefore = aiQueueProcessor.getQueueStatus();
    aiQueueProcessor.clearQueue();
    const statusAfter = aiQueueProcessor.getQueueStatus();
    
    return NextResponse.json({
      success: true,
      message: 'AI queue cleared',
      before: statusBefore,
      after: statusAfter,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ AI Queue Clear: Error clearing queue:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to clear queue',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}