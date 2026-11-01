import { NextRequest, NextResponse } from 'next/server';
import { 
  getOtakudesuDetail, 
  getOtakudesuSearch, 
  getAnichinDetail, 
  getSamehadakuDetail, 
  getSamehadakuSearch, 
  getAnimeXinDetail, 
  getDonghuastreamDetail, 
  getJuraganfilmDetail,
  getAniListTitleInfo 
} from '@/lib/stream-scraper';

const STOP_WORDS = new Set([
  'i', 'm', 'a', 'an', 'the', 'to', 'in', 'on', 'of', 'and', 'or', 'for', 'with', 
  'at', 'by', 'from', 'no', 'wa', 'ga', 'ni', 'de', 'wo', 'da', 'ka', 'te'
]);

/**
 * Smart anime search with AniList title lookup, stop words removal, and relevance filtering.
 */
async function smartAnimeSearch(originalSlug: string): Promise<any | null> {
  const searchTitles: string[] = [];

  // 1. Fetch precise Romaji / English titles from AniList
  const anilistMatch = originalSlug.match(/^anilist-(\d+)/);
  if (anilistMatch) {
    const aniId = parseInt(anilistMatch[1], 10);
    const titleInfo = await getAniListTitleInfo(aniId);
    if (titleInfo) {
      if (titleInfo.romaji) searchTitles.push(titleInfo.romaji);
      if (titleInfo.english && titleInfo.english !== titleInfo.romaji) searchTitles.push(titleInfo.english);
      if (Array.isArray(titleInfo.synonyms)) {
        searchTitles.push(...titleInfo.synonyms.slice(0, 2));
      }
    }
  }

  // 2. Also clean the slug itself
  const rawClean = originalSlug
    .replace(/^(anilist|jikan)-\d+-/, '')
    .replace(/-sub-indo$/i, '')
    .replace(/-episode-\d+.*$/i, '')
    .replace(/-[a-z0-9]{7}$/i, '')
    .replace(/^1piece/i, 'one piece')
    .replace(/-/g, ' ')
    .trim();

  if (rawClean && !searchTitles.includes(rawClean)) {
    searchTitles.push(rawClean);
  }

  if (searchTitles.length === 0) return null;

  // Extract season/part number
  const seasonMatch = originalSlug.match(/season[- ](\d+)|part[- ](\d+)|s(\d+)/i);
  const seasonNum = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3]) : null;
  const romanMap: Record<number, string> = { 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v' };
  const romanNum = seasonNum ? romanMap[seasonNum] || null : null;

  for (const baseTitle of searchTitles) {
    const allWords = baseTitle.split(/\s+/).map(w => w.trim()).filter(Boolean);
    const meaningfulWords = allWords.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length >= 2);

    if (meaningfulWords.length === 0) continue;

    const primaryKeyword = meaningfulWords.find(w => w.length >= 3)?.toLowerCase() || meaningfulWords[0].toLowerCase();
    if (!primaryKeyword || primaryKeyword.length < 2) continue;

    const isRelevant = (candidateTitle: string): boolean => {
      const lower = candidateTitle.toLowerCase();
      if (!lower.includes(primaryKeyword)) return false;
      if (meaningfulWords.length >= 2) {
        const secondKeyword = meaningfulWords.find(w => w.toLowerCase() !== primaryKeyword && w.length >= 3)?.toLowerCase();
        if (secondKeyword && !lower.includes(secondKeyword)) {
          return lower.startsWith(primaryKeyword);
        }
      }
      return true;
    };

    const score = (candidateTitle: string): number => {
      const t = candidateTitle.toLowerCase();
      let s = 0;
      if (t === baseTitle.toLowerCase()) return 1000;
      if (romanNum && t.includes(romanNum)) s += 50;
      if (seasonNum && t.includes(`season ${seasonNum}`)) s += 50;
      if (seasonNum && t.includes(`s${seasonNum}`)) s += 30;
      if (!t.includes('special') && !t.includes('ova') && !t.includes('movie')) s += 20;
      if (t.startsWith(meaningfulWords.slice(0, 2).join(' ').toLowerCase())) s += 15;
      return s;
    };

    const getSortedCandidates = (results: any[]): any[] => {
      const relevant = results.filter(s => isRelevant(s.title));
      return relevant.sort((a, b) => score(b.title) - score(a.title));
    };

    const queries = [
      meaningfulWords.slice(0, 3).join(' '),
      meaningfulWords.slice(0, 2).join(' '),
      meaningfulWords[0]
    ].filter((q, i, arr) => q && q.length >= 3 && arr.indexOf(q) === i);

    // 1. Samehadaku first
    for (const query of queries) {
      const results = await getSamehadakuSearch(query).catch(() => []);
      const sorted = getSortedCandidates(results);
      for (const cand of sorted) {
        const d = await getSamehadakuDetail(cand.slug).catch(() => null);
        if (d && d.episodes && d.episodes.length > 0) return d;
      }
    }

    // 2. Otakudesu fallback
    for (const query of queries) {
      const results = await getOtakudesuSearch(query).catch(() => []);
      const sorted = getSortedCandidates(results);
      for (const cand of sorted) {
        const d = await getOtakudesuDetail(cand.slug).catch(() => null);
        if (d && d.episodes && d.episodes.length > 0) return d;
      }
    }
  }

  return null;
}



export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'anime';
    const source = searchParams.get('source') || '';

    let data = null;

    // Handle AniList / Jikan slugs → smart search
    const isExternalSlug = slug.startsWith('anilist-') || slug.startsWith('jikan-');
    if (isExternalSlug) {
      data = await smartAnimeSearch(slug);

      if (!data) {
        return NextResponse.json(
          { success: false, error: `Anime "${slug}" tidak ditemukan di sumber manapun.` },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data });
    }

    // Normal slug handling
    if (source === 'otakudesu') {
      data = await getOtakudesuDetail(slug).catch(() => null);
      if (!data) data = await getSamehadakuDetail(slug).catch(() => null);
      if (!data) {
        data = await smartAnimeSearch(slug);
      }
    } else if (source === 'samehadaku') {
      data = await getSamehadakuDetail(slug).catch(() => null);
      if (!data) data = await getOtakudesuDetail(slug).catch(() => null);
      if (!data) {
        data = await smartAnimeSearch(slug);
      }
    } else if (source === 'animexin') {
      data = await getAnimeXinDetail(slug);
    } else if (source === 'donghuastream') {
      data = await getDonghuastreamDetail(slug);
    } else if (type === 'drama') {
      data = await getJuraganfilmDetail(slug);
    } else if (type === 'donghua') {
      data = await getAnichinDetail(slug);
      if (!data) data = await getAnimeXinDetail(slug);
    } else {
      data = await getSamehadakuDetail(slug).catch(() => null);
      if (!data) data = await getOtakudesuDetail(slug).catch(() => null);
      if (!data) {
        data = await smartAnimeSearch(slug);
      }
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
