import { NextRequest, NextResponse } from 'next/server';

// DEPRECATED: AI moves now handled automatically by event system
export async function POST() {
  return NextResponse.json({ error: 'Endpoint deprecated - AI moves handled automatically' }, { status: 410 });
}