import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuCatalog, getAnichinCatalog, getJuraganfilmCatalog } from '@/lib/stream-scraper';
import { getShortDramaPopular, getShortDramaLatest, FALLBACK_SHORT_DRAMAS } from '@/lib/shortdrama-scraper';
import { getLatestManga } from '@/lib/manga-scraper';
import { filterSafeList } from '@/lib/content-filter';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all';
    const letter = searchParams.get('letter') || 'ALL';
    const genre = searchParams.get('genre') || '';
    const pageStr = searchParams.get('page') || '1';
    const page = parseInt(pageStr, 10) || 1;
    const limit = 24;

    if (type === 'donghua') {
      const data = await getAnichinCatalog(letter === 'ALL' ? 'A' : letter, page);
      const safeResults = filterSafeList(data.results.map(i => ({ ...i, type: 'donghua' as const, source: 'anichin' })));
      return NextResponse.json({ success: true, results: safeResults, totalPages: data.totalPages || 1 });
    } else if (type === 'drama') {
      const data = await getJuraganfilmCatalog(letter, page, genre);
      const safeResults = filterSafeList(data.results.map(i => ({ ...i, type: 'drama' as const, source: 'juraganfilm' })));
      return NextResponse.json({ success: true, results: safeResults, totalPages: data.totalPages || 1 });
    } else if (type === 'shortdrama') {
      const [pop, lat] = await Promise.all([
        getShortDramaPopular().catch(() => FALLBACK_SHORT_DRAMAS),
        getShortDramaLatest().catch(() => FALLBACK_SHORT_DRAMAS),
      ]);
      const combined = [...pop, ...lat];
      const unique = Array.from(new Map(combined.map(d => [d.bookId, d])).values());
      let filtered = unique;
      if (letter !== 'ALL') {
        filtered = filtered.filter(d => d.title.trim().toUpperCase().startsWith(letter.toUpperCase()));
      }
      const mapped = filtered.map(d => ({
        title: d.title,
        slug: d.slug,
        url: `/shortdrama/${d.slug}`,
        img: d.cover,
        type: 'shortdrama' as const,
        ep: `${d.chapterCount} Ep`,
      }));
      return NextResponse.json({ success: true, results: filterSafeList(mapped), totalPages: 1 });
    } else if (type === 'manga') {
      const mangas = await getLatestManga(page).catch(() => []);
      let filtered = mangas;
      if (letter !== 'ALL') {
        filtered = filtered.filter(m => m.title.trim().toUpperCase().startsWith(letter.toUpperCase()));
      }
      const mapped = filtered.map(m => ({
        title: m.title,
        slug: m.slug,
        url: `/manga/${m.slug}`,
        img: m.img,
        type: 'manga' as const,
        ep: m.latestChapter,
      }));
      return NextResponse.json({ success: true, results: filterSafeList(mapped), totalPages: 10 });
    } else if (type === 'all') {
      // Aggregate across all media types
      const [otaku, donghua, drama, shortDrama, manga] = await Promise.all([
        getOtakudesuCatalog(letter === 'ALL' ? 'A' : letter).catch(() => []),
        getAnichinCatalog(letter === 'ALL' ? 'A' : letter, 1).catch(() => ({ results: [], totalPages: 1 })),
        getJuraganfilmCatalog(letter, 1, genre).catch(() => ({ results: [], totalPages: 1 })),
        getShortDramaPopular().catch(() => FALLBACK_SHORT_DRAMAS),
        getLatestManga(1).catch(() => []),
      ]);

      const mappedShort = shortDrama.slice(0, 6).map(d => ({
        title: d.title,
        slug: d.slug,
        url: `/shortdrama/${d.slug}`,
        img: d.cover,
        type: 'shortdrama' as const,
        ep: `${d.chapterCount} Ep`,
      }));

      const mappedManga = manga.slice(0, 6).map(m => ({
        title: m.title,
        slug: m.slug,
        url: `/manga/${m.slug}`,
        img: m.img,
        type: 'manga' as const,
        ep: m.latestChapter,
      }));

      const combined = [
        ...otaku.slice(0, 8).map(i => ({ ...i, type: 'anime' as const, source: 'otakudesu' })),
        ...donghua.results.slice(0, 8).map(i => ({ ...i, type: 'donghua' as const, source: 'anichin' })),
        ...drama.results.slice(0, 6).map(i => ({ ...i, type: 'drama' as const, source: 'juraganfilm' })),
        ...mappedShort,
        ...mappedManga
      ];

      return NextResponse.json({ success: true, results: filterSafeList(combined), totalPages: 1 });
    } else {
      // anime default
      const fullList = await getOtakudesuCatalog(letter);
      const mapped = fullList.map(i => ({ ...i, type: 'anime' as const, source: 'otakudesu' }));
      if (letter === 'ALL') {
        const totalPages = Math.ceil(mapped.length / limit) || 1;
        const start = (page - 1) * limit;
        const pagedResults = mapped.slice(start, start + limit);
        return NextResponse.json({ success: true, results: filterSafeList(pagedResults), totalPages });
      }
      return NextResponse.json({ success: true, results: filterSafeList(mapped), totalPages: 1 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
