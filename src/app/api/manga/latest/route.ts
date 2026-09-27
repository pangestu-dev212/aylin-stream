import { NextRequest, NextResponse } from 'next/server';
import { getLatestManga, getColoredManga, getPopularManga } from '@/lib/manga-scraper';

export const revalidate = 180; // Cache for 3 minutes

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filter = searchParams.get('filter') || 'latest';
    const page = parseInt(searchParams.get('page') || '1', 10);

    let items;
    if (filter === 'colored') {
      items = await getColoredManga(page);
    } else if (filter === 'popular') {
      items = await getPopularManga();
    } else {
      items = await getLatestManga(page);
    }

    return NextResponse.json({ success: true, page, filter, data: items });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
