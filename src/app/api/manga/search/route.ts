import { NextRequest, NextResponse } from 'next/server';
import { searchManga } from '@/lib/manga-scraper';
import { isSafeQuery } from '@/lib/content-filter';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    if (!query.trim() || !isSafeQuery(query)) {
      return NextResponse.json({ success: true, query, data: [] });
    }

    const items = await searchManga(query);
    return NextResponse.json({ success: true, query, data: items });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
