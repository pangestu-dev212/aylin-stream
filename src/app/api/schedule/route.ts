import { NextRequest, NextResponse } from 'next/server';
import { getWeeklySchedule, getDonghuaSchedule } from '@/lib/stream-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');

    if (type === 'donghua') {
      const donghuaSchedule = await getDonghuaSchedule();
      return NextResponse.json({ success: true, schedule: donghuaSchedule, donghuaSchedule });
    }

    const [animeSchedule, donghuaSchedule] = await Promise.all([
      getWeeklySchedule().catch(() => []),
      getDonghuaSchedule().catch(() => [])
    ]);

    return NextResponse.json({ 
      success: true, 
      schedule: animeSchedule, 
      donghuaSchedule 
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
