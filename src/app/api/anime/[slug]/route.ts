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
async function smartAnimeSearch(cleanTitle: string): Promise<any | null> {
  const words = cleanTitle.split(' ');
  const firstWord = words[0].toLowerCase();

  const isRelevant = (title: string) => title.toLowerCase().includes(firstWord);

  const pickBest = (results: any[]) => {
    const relevant = results.filter(s => isRelevant(s.title));
    if (relevant.length === 0) return null;
    return relevant.find(s => s.title.toLowerCase() === cleanTitle.toLowerCase())
      || relevant.find(s => s.title.toLowerCase().startsWith(words.slice(0, 2).join(' ').toLowerCase()))
      || relevant[0];
  };

  const queries = [
    words.slice(0, 3).join(' '),
    words.slice(0, 2).join(' '),
    words[0]
  ].filter((q, i, arr) => arr.indexOf(q) === i);

  // Samehadaku first
  for (const query of queries) {
    const results = await getSamehadakuSearch(query).catch(() => []);
    const best = pickBest(results);
    if (best) {
      const d = await getSamehadakuDetail(best.slug).catch(() => null);
      if (d && d.episodes && d.episodes.length > 0) return d;
    }
  }

  // Otakudesu fallback
  for (const query of queries) {
    const results = await getOtakudesuSearch(query).catch(() => []);
    const best = pickBest(results);
    if (best) {
      const d = await getOtakudesuDetail(best.slug).catch(() => null);
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
      data = await smartAnimeSearch(searchTitle);

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
