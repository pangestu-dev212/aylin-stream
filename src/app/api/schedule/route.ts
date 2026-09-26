import { NextResponse } from 'next/server';
import { getWeeklySchedule } from '@/lib/stream-scraper';

export async function GET() {
  try {
    const schedule = await getWeeklySchedule();
    return NextResponse.json({ success: true, schedule });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
