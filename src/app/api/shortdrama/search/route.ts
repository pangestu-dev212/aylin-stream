import { NextRequest, NextResponse } from 'next/server';
import { searchShortDrama } from '@/lib/shortdrama-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    if (!query.trim()) {
      return NextResponse.json({ success: true, data: [] });
    }

    const data = await searchShortDrama(query);
    return NextResponse.json({ success: true, query, data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
