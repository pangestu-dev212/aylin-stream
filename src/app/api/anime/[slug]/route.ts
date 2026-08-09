import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuDetail, getOtakudesuSearch, getAnichinDetail, getSamehadakuDetail, getSamehadakuSearch, getAnimeXinDetail, getDonghuastreamDetail } from '@/lib/stream-scraper';

/**
 * Extract a clean search query from an AniList or Jikan prefixed slug.
 * e.g. "anilist-135865-saga-of-tanya-the-evil-season-2" → "saga of tanya the evil season 2"
 */
function extractTitleFromExternalSlug(slug: string): string {
  // Remove "anilist-{id}-" or "jikan-{id}-" prefix
  const cleaned = slug.replace(/^(anilist|jikan)-\d+-/, '');
  // Convert hyphens back to spaces
  return cleaned.replace(/-/g, ' ').trim();
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

    // Handle AniList / Jikan slugs → auto-search Otakudesu/Samehadaku
    const isExternalSlug = slug.startsWith('anilist-') || slug.startsWith('jikan-');
    if (isExternalSlug) {
      const searchTitle = extractTitleFromExternalSlug(slug);

      // Try Otakudesu search first
      const otakuResults = await getOtakudesuSearch(searchTitle).catch(() => []);
      if (otakuResults.length > 0) {
        data = await getOtakudesuDetail(otakuResults[0].slug).catch(() => null);
      }

      // Fallback: try Samehadaku search
      if (!data) {
        const sameResults = await getSamehadakuSearch(searchTitle).catch(() => []);
        if (sameResults.length > 0) {
          data = await getSamehadakuDetail(sameResults[0].slug).catch(() => null);
        }
      }

      if (!data) {
        return NextResponse.json(
          { success: false, error: `Anime "${searchTitle}" tidak ditemukan di sumber manapun.` },
          { status: 404 }
        );
      }

      return NextResponse.json({ success: true, data });
    }

    // Normal slug handling
    if (source === 'samehadaku') {
      data = await getSamehadakuDetail(slug);
    } else if (source === 'animexin') {
      data = await getAnimeXinDetail(slug);
    } else if (source === 'donghuastream') {
      data = await getDonghuastreamDetail(slug);
    } else if (type === 'donghua') {
      data = await getAnichinDetail(slug);
    } else {
      data = await getOtakudesuDetail(slug);
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
