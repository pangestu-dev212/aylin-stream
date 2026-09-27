import { NextRequest, NextResponse } from 'next/server';
import { searchManga } from '@/lib/manga-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    if (!query.trim()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const items = await searchManga(query);
    return NextResponse.json({ success: true, query, data: items });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
