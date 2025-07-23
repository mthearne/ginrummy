import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../src/utils/database';

export async function GET(request: NextRequest) {
  try {
    // Test if we can access the notification model
    const testQuery = await prisma.notification.findMany({
      take: 1
    });

    return NextResponse.json({
      success: true,
      message: 'Prisma notification model is accessible',
      testResult: testQuery
    });

  } catch (error) {
    console.error('Prisma debug error:', error);
    return NextResponse.json({
      success: false,
      error: 'Prisma notification model not accessible',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}