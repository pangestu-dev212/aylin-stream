import { NextRequest, NextResponse } from 'next/server';
import { 
  getOtakudesuSearch, 
  getAnichinSearch, 
  getJuraganfilmSearch, 
  getSamehadakuSearch, 
  getAnimeXinSearch, 
  getDonghuastreamSearch 
} from '@/lib/stream-scraper';

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
    const [
      otakuResults,
      sameResults,
      anichinResults,
      animexinResults,
      donghuaStreamResults,
      dramaResults
    ] = await Promise.all([
      getOtakudesuSearch(query).catch(() => []),
      getSamehadakuSearch(query).catch(() => []),
      getAnichinSearch(query).catch(() => []),
      getAnimeXinSearch(query).catch(() => []),
      getDonghuastreamSearch(query).catch(() => []),
      getJuraganfilmSearch(query).catch(() => [])
    ]);

    const mappedDrama = dramaResults.map(item => ({ ...item, type: 'drama' as const }));

    // Concatenate, placing primary sources first so they are preferred during deduplication
    const combinedRaw = [
      ...otakuResults,
      ...anichinResults,
      ...mappedDrama,
      ...sameResults,
      ...animexinResults,
      ...donghuaStreamResults
    ];

    // Deduplicate by normalized title
    const uniqueMap = new Map<string, typeof combinedRaw[number]>();
    for (const item of combinedRaw) {
      const normTitle = item.title
        .toLowerCase()
        .replace(/subtitle\s+indonesia/g, '')
        .replace(/sub\s+indo/g, '')
        .replace(/eng\s+sub/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();

      if (normTitle && !uniqueMap.has(normTitle)) {
        uniqueMap.set(normTitle, item);
      }
    }

    const combined = Array.from(uniqueMap.values());

    return NextResponse.json({ success: true, results: combined });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

