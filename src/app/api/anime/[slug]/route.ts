import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuDetail, getOtakudesuSearch, getAnichinDetail, getSamehadakuDetail, getSamehadakuSearch, getAnimeXinDetail, getDonghuastreamDetail, getJuraganfilmDetail } from '@/lib/stream-scraper';

/**
 * Extract a clean search query from an AniList or Jikan prefixed slug.
 * e.g. "anilist-135865-saga-of-tanya-the-evil-season-2" → "saga of tanya the evil season 2"
 */
function extractTitleFromExternalSlug(slug: string): string {
  const cleaned = slug.replace(/^(anilist|jikan)-\d+-/, '');
  return cleaned.replace(/-/g, ' ').trim();
}

/**
 * Smart anime search with progressive keyword shortening + relevance filtering.
 * Tries 3 words → 2 words → 1 word until relevant results are found.
 */
async function smartAnimeSearch(cleanTitle: string, originalSlug = ''): Promise<any | null> {
  const words = cleanTitle.split(' ');
  const firstWord = words[0].toLowerCase();

  // Extract season/part number from original slug
  const seasonMatch = originalSlug.match(/season[- ](\d+)|part[- ](\d+)|s(\d+)/i);
  const seasonNum = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3]) : null;
  const romanMap: Record<number, string> = { 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v' };
  const romanNum = seasonNum ? romanMap[seasonNum] || null : null;

  const isRelevant = (title: string) => title.toLowerCase().includes(firstWord);

  const score = (title: string): number => {
    const t = title.toLowerCase();
    let s = 0;
    if (t === cleanTitle.toLowerCase()) return 1000;
    if (romanNum && t.includes(romanNum)) s += 50;
    if (seasonNum && t.includes(`season ${seasonNum}`)) s += 50;
    if (seasonNum && t.includes(`s${seasonNum}`)) s += 30;
    if (!t.includes('special') && !t.includes('ova') && !t.includes('movie')) s += 20;
    if (t.startsWith(words.slice(0, 2).join(' ').toLowerCase())) s += 10;
    return s;
  };

  const getSortedCandidates = (results: any[]): any[] => {
    const relevant = results.filter(s => isRelevant(s.title));
    return relevant.sort((a, b) => score(b.title) - score(a.title));
  };

  const queries = [
    words.slice(0, 3).join(' '),
    words.slice(0, 2).join(' '),
    words[0]
  ].filter((q, i, arr) => arr.indexOf(q) === i);

  // Samehadaku first
  for (const query of queries) {
    const results = await getSamehadakuSearch(query).catch(() => []);
    const sorted = getSortedCandidates(results);
    for (const cand of sorted) {
      const d = await getSamehadakuDetail(cand.slug).catch(() => null);
      if (d && d.episodes && d.episodes.length > 0) return d;
    }
  }

  // Otakudesu fallback
  for (const query of queries) {
    const results = await getOtakudesuSearch(query).catch(() => []);
    const sorted = getSortedCandidates(results);
    for (const cand of sorted) {
      const d = await getOtakudesuDetail(cand.slug).catch(() => null);
      if (d && d.episodes && d.episodes.length > 0) return d;
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
      const searchTitle = extractTitleFromExternalSlug(slug);
      data = await smartAnimeSearch(searchTitle, slug);

      if (!data) {
        return NextResponse.json(
          { success: false, error: `Anime "${searchTitle}" tidak ditemukan di sumber manapun.` },
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
        const cleanTitle = slug.replace(/-sub-indo$/i, '').replace(/^1piece/i, 'one piece').replace(/-/g, ' ').trim();
        data = await smartAnimeSearch(cleanTitle);
      }
    } else if (source === 'samehadaku') {
      data = await getSamehadakuDetail(slug).catch(() => null);
      if (!data) data = await getOtakudesuDetail(slug).catch(() => null);
      if (!data) {
        const cleanTitle = slug.replace(/-[a-z0-9]{7}$/i, '').replace(/-/g, ' ').trim();
        data = await smartAnimeSearch(cleanTitle);
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
        const cleanTitle = slug.replace(/-sub-indo$/i, '').replace(/^1piece/i, 'one piece').replace(/-[a-z0-9]{7}$/i, '').replace(/-/g, ' ').trim();
        data = await smartAnimeSearch(cleanTitle);
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
