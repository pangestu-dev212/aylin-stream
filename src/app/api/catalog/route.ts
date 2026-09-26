import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuCatalog, getAnichinCatalog, getJuraganfilmCatalog } from '@/lib/stream-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'anime';
    const letter = searchParams.get('letter') || 'A';
    const genre = searchParams.get('genre') || '';
    const pageStr = searchParams.get('page') || '1';
    const page = parseInt(pageStr, 10) || 1;

    if (type === 'donghua') {
      const data = await getAnichinCatalog(letter, page);
      return NextResponse.json({ success: true, ...data });
    } else if (type === 'drama') {
      const data = await getJuraganfilmCatalog(letter, page, genre);
      return NextResponse.json({ success: true, ...data });
    } else {
      const results = await getOtakudesuCatalog(letter);
      return NextResponse.json({ success: true, results, totalPages: 1 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
