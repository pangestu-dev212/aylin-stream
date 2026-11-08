import { NextRequest, NextResponse } from 'next/server';
import { 
  getOtakudesuSearch, 
  getAnichinSearch, 
  getJuraganfilmSearch, 
  getSamehadakuSearch, 
  getAnimeXinSearch, 
  getDonghuastreamSearch,
  getGojonimeSearch
} from '@/lib/stream-scraper';
import { searchManga } from '@/lib/manga-scraper';
import { searchShortDrama } from '@/lib/shortdrama-scraper';
import { isSafeQuery, filterSafeList } from '@/lib/content-filter';

// Strict timeout wrapper so hanging providers never stall the aggregator
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

// Item hierarchy: Full Series (10) > Movie (8) > Batch (3) > Single Episode post (1)
function getItemScore(title: string, slug: string): number {
  const t = title.toLowerCase();
  const s = slug.toLowerCase();
  
  if (/\b(?:episode\s*\d+|ep\s*\d+)\b/i.test(t) || /[-_]episode[-_]\d+/i.test(s) || /[-_]ep[-_]\d+/i.test(s)) {
    return 1;
  }
  if (/\b(?:batch|lengkap|bd\s*batch|pack)\b/i.test(t) || s.includes('batch')) {
    return 3;
  }
  if (/\b(?:movie|film)\b/i.test(t) || s.includes('movie') || s.includes('film')) {
    return 8;
  }
  return 10;
}

function getDedupeKey(title: string, slug: string, type: string = 'anime'): string {
  const isMovie = /\b(?:movie|film)\b/i.test(title) || slug.toLowerCase().includes('movie');
  const base = title
    .toLowerCase()
    .replace(/\b(?:subtitle\s+indonesia|sub\s+indo|eng\s+sub|tamatan|ongoing)\b/gi, '')
    .replace(/\b(?:batch|lengkap|bd\s*batch|pack)\b/gi, '')
    .replace(/\b(?:episode\s*\d+|ep\s*\d+)\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .trim();

  // Namespace by media category so Manga/ShortDrama never collide with Anime/Video series
  const category = (type === 'manga' || type === 'shortdrama') ? type : 'video';
  return `${category}_${base}${isMovie ? '_movie' : ''}`;
}

function computeRelevance(item: { title: string; slug: string; source?: string }, query: string): number {
  const t = item.title.toLowerCase();
  const q = query.toLowerCase().trim();
  const qWords = q.split(/\s+/).filter(Boolean);

  let score = 0;

  // Title match accuracy
  if (t === q) {
    score += 120;
  } else if (t.startsWith(q)) {
    score += 70;
  } else if (t.includes(q)) {
    score += 45;
  }

  // Word overlap
  const matchedWords = qWords.filter(w => t.includes(w)).length;
  score += matchedWords * 15;

  // Provider weighting: Prioritize active anime/donghua providers over older drama
  switch (item.source) {
    case 'samehadaku': score += 28; break;
    case 'gojonime': score += 26; break;
    case 'otakudesu': score += 24; break;
    case 'anichin': score += 20; break;
    case 'animexin': score += 18; break;
    case 'donghuastream': score += 16; break;
    case 'manga': score += 12; break;
    case 'shortdrama': score += 10; break;
    case 'juraganfilm': score += 4; break;
    default: score += 10; break;
  }

  // Bonus for full series/movie over single episode posts
  score += getItemScore(item.title, item.slug) * 2;

  return score;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const source = searchParams.get('source') || '';

    if (!query || !isSafeQuery(query)) {
      return NextResponse.json({ success: true, results: [] });
    }

    const PROVIDER_TIMEOUT_MS = 3500;

    // Direct single source search with timeout racing
    if (source === 'samehadaku') {
      const results = await withTimeout(getSamehadakuSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []);
      return NextResponse.json({ success: true, results: filterSafeList(results) });
    }
    if (source === 'gojonime') {
      const results = await withTimeout(getGojonimeSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []);
      return NextResponse.json({ success: true, results: filterSafeList(results) });
    }
    if (source === 'animexin') {
      const results = await withTimeout(getAnimeXinSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []);
      return NextResponse.json({ success: true, results: filterSafeList(results) });
    }
    if (source === 'donghuastream') {
      const results = await withTimeout(getDonghuastreamSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []);
      return NextResponse.json({ success: true, results: filterSafeList(results) });
    }
    if (source === 'manga') {
      const results = await withTimeout(searchManga(query).catch(() => []), PROVIDER_TIMEOUT_MS, []);
      const mapped = results.map(r => ({ ...r, type: 'manga' as const }));
      return NextResponse.json({ success: true, results: filterSafeList(mapped) });
    }
    if (source === 'shortdrama') {
      const results = await withTimeout(searchShortDrama(query).catch(() => []), PROVIDER_TIMEOUT_MS, []);
      const mapped = results.map(r => ({ ...r, type: 'shortdrama' as const }));
      return NextResponse.json({ success: true, results: filterSafeList(mapped) });
    }

    // Fetch from all 9 providers concurrently with strict per-provider timeout racing
    const [
      otakuResults,
      sameResults,
      gojonimeResults,
      anichinResults,
      animexinResults,
      donghuaStreamResults,
      dramaResults,
      mangaResults,
      shortDramaResults
    ] = await Promise.all([
      withTimeout(getOtakudesuSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(getSamehadakuSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(getGojonimeSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(getAnichinSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(getAnimeXinSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(getDonghuastreamSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(getJuraganfilmSearch(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(searchManga(query).catch(() => []), PROVIDER_TIMEOUT_MS, []),
      withTimeout(searchShortDrama(query).catch(() => []), PROVIDER_TIMEOUT_MS, [])
    ]);

    const mappedOtaku = otakuResults.map(i => ({ ...i, type: 'anime' as const, source: 'otakudesu' }));
    const mappedSame = sameResults.map(i => ({ ...i, type: 'anime' as const, source: 'samehadaku' }));
    const mappedGojonime = gojonimeResults.map(i => ({ ...i, type: 'anime' as const, source: 'gojonime' }));
    const mappedAnichin = anichinResults.map(i => ({ ...i, type: 'donghua' as const, source: 'anichin' }));
    const mappedAnimexin = animexinResults.map(i => ({ ...i, type: 'donghua' as const, source: 'animexin' }));
    const mappedDonghuastream = donghuaStreamResults.map(i => ({ ...i, type: 'donghua' as const, source: 'donghuastream' }));
    const mappedDrama = dramaResults.map(item => ({ ...item, type: 'drama' as const, source: 'juraganfilm' }));
    const mappedManga = mangaResults.map(item => ({ 
      title: item.title, 
      slug: item.slug, 
      url: `/manga/${item.slug}`, 
      img: item.img, 
      ep: item.latestChapter, 
      type: 'manga' as const,
      source: 'manga'
    }));
    const mappedShortDrama = shortDramaResults.map(item => ({
      title: item.title,
      slug: item.slug,
      url: `/shortdrama/${item.slug}`,
      img: item.cover,
      ep: `${item.chapterCount} Ep`,
      type: 'shortdrama' as const,
      source: 'shortdrama'
    }));

    // Concatenate all results
    const combinedRaw = [
      ...mappedOtaku,
      ...mappedSame,
      ...mappedGojonime,
      ...mappedAnichin,
      ...mappedAnimexin,
      ...mappedDonghuastream,
      ...mappedDrama,
      ...mappedShortDrama,
      ...mappedManga
    ];

    // Deduplicate: replace batch/episode clutter with full series entries
    const uniqueMap = new Map<string, { item: typeof combinedRaw[number]; score: number; relevance: number }>();
    for (const item of combinedRaw) {
      const key = getDedupeKey(item.title, item.slug, item.type);
      if (!key) continue;

      const itemScore = getItemScore(item.title, item.slug);
      const relevance = computeRelevance(item, query);

      const existing = uniqueMap.get(key);
      if (!existing || itemScore > existing.score || (itemScore === existing.score && relevance > existing.relevance)) {
        uniqueMap.set(key, { item, score: itemScore, relevance });
      }
    }

    // Sort by relevance score descending
    const sortedCombined = Array.from(uniqueMap.values())
      .sort((a, b) => b.relevance - a.relevance)
      .map(entry => entry.item);

    const safeCombined = filterSafeList(sortedCombined);

    return NextResponse.json({ success: true, results: safeCombined });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

