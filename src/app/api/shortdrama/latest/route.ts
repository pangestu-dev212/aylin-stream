import { NextRequest, NextResponse } from 'next/server';
import { getShortDramaPopular, getShortDramaLatest } from '@/lib/shortdrama-scraper';

export const revalidate = 300;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'popular';

    let data;
    if (filter === 'latest') {
      data = await getShortDramaLatest();
    } else {
      data = await getShortDramaPopular();
    }

    return NextResponse.json({ success: true, filter, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
