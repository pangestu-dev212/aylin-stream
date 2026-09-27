import { NextRequest, NextResponse } from 'next/server';
import { 
  getOtakudesuSearch, 
  getAnichinSearch, 
  getJuraganfilmSearch, 
  getSamehadakuSearch, 
  getAnimeXinSearch, 
  getDonghuastreamSearch 
} from '@/lib/stream-scraper';
import { searchManga } from '@/lib/manga-scraper';
import { searchShortDrama } from '@/lib/shortdrama-scraper';
import { isSafeQuery, filterSafeList } from '@/lib/content-filter';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const source = searchParams.get('source') || '';

    if (!query || !isSafeQuery(query)) {
      return NextResponse.json({ success: true, results: [] });
    }

    // Direct single source search
    if (source === 'samehadaku') {
      const results = await getSamehadakuSearch(query).catch(() => []);
      return NextResponse.json({ success: true, results: filterSafeList(results) });
    }
    if (source === 'animexin') {
      const results = await getAnimeXinSearch(query).catch(() => []);
      return NextResponse.json({ success: true, results: filterSafeList(results) });
    }
    if (source === 'donghuastream') {
      const results = await getDonghuastreamSearch(query).catch(() => []);
      return NextResponse.json({ success: true, results: filterSafeList(results) });
    }
    if (source === 'manga') {
      const results = await searchManga(query).catch(() => []);
      const mapped = results.map(r => ({ ...r, type: 'manga' as const }));
      return NextResponse.json({ success: true, results: filterSafeList(mapped) });
    }
    if (source === 'shortdrama') {
      const results = await searchShortDrama(query).catch(() => []);
      const mapped = results.map(r => ({ ...r, type: 'shortdrama' as const }));
      return NextResponse.json({ success: true, results: filterSafeList(mapped) });
    }

    // Fetch from all concurrently
    const [
      otakuResults,
      sameResults,
      anichinResults,
      animexinResults,
      donghuaStreamResults,
      dramaResults,
      mangaResults,
      shortDramaResults
    ] = await Promise.all([
      getOtakudesuSearch(query).catch(() => []),
      getSamehadakuSearch(query).catch(() => []),
      getAnichinSearch(query).catch(() => []),
      getAnimeXinSearch(query).catch(() => []),
      getDonghuastreamSearch(query).catch(() => []),
      getJuraganfilmSearch(query).catch(() => []),
      searchManga(query).catch(() => []),
      searchShortDrama(query).catch(() => [])
    ]);

    const mappedDrama = dramaResults.map(item => ({ ...item, type: 'drama' as const }));
    const mappedManga = mangaResults.map(item => ({ 
      title: item.title, 
      slug: item.slug, 
      url: item.url, 
      img: item.img, 
      ep: item.latestChapter, 
      type: 'manga' as const 
    }));
    const mappedShortDrama = shortDramaResults.map(item => ({
      title: item.title,
      slug: item.slug,
      url: `/shortdrama/${item.slug}`,
      img: item.cover,
      ep: `${item.chapterCount} Ep`,
      type: 'shortdrama' as const,
    }));

    // Concatenate, placing primary sources first so they are preferred during deduplication
    const combinedRaw = [
      ...otakuResults,
      ...anichinResults,
      ...mappedDrama,
      ...mappedShortDrama,
      ...mappedManga,
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
    const safeCombined = filterSafeList(combined);

    return NextResponse.json({ success: true, results: safeCombined });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

