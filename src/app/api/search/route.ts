import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuSearch, getAnichinSearch, getJuraganfilmSearch, getSamehadakuSearch, getAnimeXinSearch, getDonghuastreamSearch } from '@/lib/stream-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const source = searchParams.get('source') || '';

    if (!query) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Direct single source search
    if (source === 'samehadaku') {
      const results = await getSamehadakuSearch(query).catch(() => []);
      return NextResponse.json({ success: true, results });
    }
    if (source === 'animexin') {
      const results = await getAnimeXinSearch(query).catch(() => []);
      return NextResponse.json({ success: true, results });
    }
    if (source === 'donghuastream') {
      const results = await getDonghuastreamSearch(query).catch(() => []);
      return NextResponse.json({ success: true, results });
    }

    // Fetch from all concurrently
    const [animeResults, donghuaResults, dramaResults] = await Promise.all([
      getOtakudesuSearch(query).catch(() => []),
      getAnichinSearch(query).catch(() => []),
      getJuraganfilmSearch(query).catch(() => [])
    ]);

    const mappedDrama = dramaResults.map(item => ({ ...item, type: 'drama' as const }));
    const combined = [...animeResults, ...donghuaResults, ...mappedDrama];

    return NextResponse.json({ success: true, results: combined });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
