import * as cheerio from 'cheerio';

const KOMIKU_BASE = 'https://komiku.org';
const KOMIKINDO_BASE = 'https://komikindo.org';
const KOMIKINDO_ALT = 'https://komikindo.ch';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface MangaCard {
  title: string;
  slug: string;
  url: string;
  img: string;
  latestChapter?: string;
  chapterUrl?: string;
  chapterSlug?: string;
  type: 'manga' | 'manhwa' | 'manhua';
  isColored?: boolean;
  rating?: string;
  status?: string;
}

export interface MangaDetail {
  title: string;
  slug: string;
  url: string;
  img: string;
  synopsis: string;
  type: 'manga' | 'manhwa' | 'manhua';
  status: string;
  author?: string;
  rating?: string;
  isColored?: boolean;
  genres: string[];
  chapters: {
    title: string;
    slug: string;
    url: string;
    date?: string;
  }[];
}

export interface ChapterData {
  title: string;
  slug: string;
  mangaTitle: string;
  mangaSlug: string;
  images: string[];
  prevChapterSlug?: string | null;
  nextChapterSlug?: string | null;
  allChapters?: {
    title: string;
    slug: string;
  }[];
}

// Memory cache with TTL
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function getCached<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.data as T;
}

function setCache<T>(key: string, data: T) {
  cache.set(key, { data, timestamp: Date.now() });
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.7,en;q=0.3',
    },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(12000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

/**
 * Fetch latest comics from Komiku with Komikindo fallback
 */
export async function getLatestManga(page: number = 1): Promise<MangaCard[]> {
  const cacheKey = `manga:latest:${page}`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  const items: MangaCard[] = [];

  // 1. Try Komiku (Primary, accessible from datacenters & fast)
  try {
    const html = await fetchHtml(KOMIKU_BASE);
    const $ = cheerio.load(html);

    $('article, .ls4').each((_, el) => {
      const a = $(el).find('h4 a, h3 a, a[title*="Baca"]').first();
      const rawTitle = a.text().trim();
      const href = a.attr('href') || $(el).find('a').first().attr('href') || '';
      if (!rawTitle || !href || !href.includes('/manga/')) return;

      const title = rawTitle.replace(/^Komik\s+/i, '').trim();
      const slug = href.replace(/.*\/manga\//, '').replace(/\/$/, '');
      const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
      const chapterEl = $(el).find('.ls24, a[href*="-chapter-"]').first();
      const latestChapter = chapterEl.text().trim() || undefined;
      const chHref = chapterEl.attr('href') || '';
      const chapterSlug = chHref ? chHref.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '').replace(/^\//, '') : undefined;

      const infoText = $(el).find('.ls4s, .tpe1_inf').text().trim().toLowerCase();
      let type: 'manga' | 'manhwa' | 'manhua' = 'manga';
      if (infoText.includes('manhwa') || img.toLowerCase().includes('manhwa')) type = 'manhwa';
      else if (infoText.includes('manhua') || img.toLowerCase().includes('manhua')) type = 'manhua';

      const isColored = type === 'manhwa' || type === 'manhua' || infoText.includes('warna') || infoText.includes('color');

      items.push({
        title,
        slug,
        url: href.startsWith('http') ? href : `${KOMIKU_BASE}${href}`,
        img,
        latestChapter,
        chapterUrl: chHref ? (chHref.startsWith('http') ? chHref : `${KOMIKU_BASE}${chHref}`) : undefined,
        chapterSlug,
        type,
        isColored,
        status: 'Ongoing'
      });
    });

    if (items.length > 0) {
      setCache(cacheKey, items);
      return items;
    }
  } catch (err) {
    console.warn('[MangaScraper] Komiku fetch failed, trying Komikindo fallback:', err);
  }

  // 2. Fallback to Komikindo
  try {
    const fallbackBases = [KOMIKINDO_BASE, KOMIKINDO_ALT];
    for (const base of fallbackBases) {
      try {
        const url = page === 1 ? `${base}/komik-terbaru/` : `${base}/komik-terbaru/page/${page}/`;
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        $('.animepost').each((_, el) => {
          const link = $(el).find('a').attr('href') || '';
          if (!link || link.includes('/konten/ecchi')) return;

          const rawTitle = $(el).find('.tt h3 a, a[rel="bookmark"], .tt h4, h4').first().text().trim();
          const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
          if (!title) return;

          const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
          const slug = link.replace(/.*\/komik\//, '').replace(/\/$/, '');

          const typeFlagClass = $(el).find('.typeflag').attr('class') || '';
          let type: 'manga' | 'manhwa' | 'manhua' = 'manga';
          if (typeFlagClass.toLowerCase().includes('manhwa')) type = 'manhwa';
          else if (typeFlagClass.toLowerCase().includes('manhua')) type = 'manhua';

          const isColored = type === 'manhwa' || type === 'manhua' || $(el).text().toLowerCase().includes('warna');
          const latestChapterEl = $(el).find('.lsch a');
          const latestChapter = latestChapterEl.text().trim();
          const chapterUrl = latestChapterEl.attr('href') || '';
          const chapterSlug = chapterUrl ? chapterUrl.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '') : undefined;

          items.push({
            title,
            slug,
            url: link,
            img,
            latestChapter,
            chapterUrl,
            chapterSlug,
            type,
            isColored,
          });
        });

        if (items.length > 0) break;
      } catch {}
    }

    if (items.length > 0) {
      setCache(cacheKey, items);
      return items;
    }
  } catch (err) {
    console.error('[MangaScraper] Error fetching latest manga:', err);
  }

  return [];
}

/**
 * Fetch colored comics only (Manhwa Korea & Manhua China)
 */
export async function getColoredManga(page: number = 1): Promise<MangaCard[]> {
  const cacheKey = `manga:colored:${page}`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  const allLatest = await getLatestManga(page);
  const colored = allLatest.filter(item => item.isColored || item.type === 'manhwa' || item.type === 'manhua');

  if (colored.length > 0) {
    setCache(cacheKey, colored);
    return colored;
  }

  return allLatest;
}

/**
 * Fetch popular / trending comics
 */
export async function getPopularManga(): Promise<MangaCard[]> {
  const cacheKey = `manga:popular`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  const allLatest = await getLatestManga(1);
  if (allLatest.length > 0) {
    // Return top 20 items from primary feed
    const popular = allLatest.slice(0, 24);
    setCache(cacheKey, popular);
    return popular;
  }

  return [];
}

/**
 * Search manga across Komiku and Komikindo
 */
export async function searchManga(query: string): Promise<MangaCard[]> {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return [];

  const cacheKey = `manga:search:${cleanQ}`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  const results: MangaCard[] = [];
  const seenSlugs = new Set<string>();

  // 1. Check if the query matches titles in cached latest manga
  const latest = await getLatestManga(1);
  for (const item of latest) {
    if (item.title.toLowerCase().includes(cleanQ) || item.slug.toLowerCase().includes(cleanQ)) {
      if (!seenSlugs.has(item.slug)) {
        seenSlugs.add(item.slug);
        results.push(item);
      }
    }
  }

  // 2. Query Komikindo search
  const bases = [KOMIKINDO_BASE, KOMIKINDO_ALT];
  for (const base of bases) {
    try {
      const url = `${base}/?s=${encodeURIComponent(cleanQ)}`;
      const html = await fetchHtml(url);
      const $ = cheerio.load(html);

      $('.animepost').each((_, el) => {
        const link = $(el).find('a').attr('href') || '';
        if (!link || link.includes('/konten/ecchi')) return;

        const rawTitle = $(el).find('.tt h3 a, a[rel="bookmark"], .tt h4, h4').first().text().trim();
        const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
        if (!title) return;

        const slug = link.replace(/.*\/komik\//, '').replace(/\/$/, '');
        if (seenSlugs.has(slug)) return;
        seenSlugs.add(slug);

        const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
        const typeFlagClass = $(el).find('.typeflag').attr('class') || '';
        let type: 'manga' | 'manhwa' | 'manhua' = 'manga';
        if (typeFlagClass.toLowerCase().includes('manhwa')) type = 'manhwa';
        else if (typeFlagClass.toLowerCase().includes('manhua')) type = 'manhua';

        const isColored = type === 'manhwa' || type === 'manhua' || $(el).text().toLowerCase().includes('warna');
        const latestChapterEl = $(el).find('.lsch a');
        const latestChapter = latestChapterEl.text().trim();
        const chapterUrl = latestChapterEl.attr('href') || '';
        const chapterSlug = chapterUrl ? chapterUrl.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '') : undefined;

        results.push({
          title,
          slug,
          url: link,
          img,
          latestChapter,
          chapterUrl,
          chapterSlug,
          type,
          isColored,
        });
      });

      if (results.length > 0) break;
    } catch {}
  }

  setCache(cacheKey, results);
  return results;
}

/**
 * Fetch single manga detail and full chapter list
 */
export async function getMangaDetail(slug: string): Promise<MangaDetail | null> {
  const cacheKey = `manga:detail:${slug}`;
  const cached = getCached<MangaDetail>(cacheKey);
  if (cached) return cached;

  // 1. Try Komiku
  try {
    const candidateSlugs = [
      slug,
      slug.startsWith('komik-') ? slug : `komik-${slug}-indo`,
      slug.replace(/^komik-/, '').replace(/-indo$/, '')
    ];

    for (const testSlug of candidateSlugs) {
      try {
        const url = `${KOMIKU_BASE}/manga/${testSlug}/`;
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        const rawTitle = $('h1').text().replace(/^Komik\s+/i, '').trim();
        if (!rawTitle || rawTitle.includes('404')) continue;

        const img = $('.ims img').attr('src') || $('img.lazy').first().attr('data-src') || '';
        const synopsis = $('.desc, #Sinopsis p, p.desc').text().trim() || 'Sinopsis komik.';

        const genres: string[] = [];
        $('.genre li a, .genre a').each((_, el) => {
          const g = $(el).text().trim();
          if (g && !genres.includes(g)) genres.push(g);
        });

        const chapters: MangaDetail['chapters'] = [];
        $('table.epz tr, #Daftar_Chapter tr, .komik_info-chapters-item').each((_, el) => {
          const a = $(el).find('a[href*="-chapter-"]').first();
          const href = a.attr('href');
          const chTitle = a.text().trim();
          const date = $(el).find('.tgl, .date, .dt').text().trim();
          if (href && chTitle) {
            const chSlug = href.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '').replace(/^\//, '');
            chapters.push({ title: chTitle, slug: chSlug, url: href, date });
          }
        });

        let type: 'manga' | 'manhwa' | 'manhua' = 'manga';
        const pageText = $('body').text().toLowerCase();
        if (pageText.includes('manhwa') || img.toLowerCase().includes('manhwa')) type = 'manhwa';
        else if (pageText.includes('manhua') || img.toLowerCase().includes('manhua')) type = 'manhua';

        const detail: MangaDetail = {
          title: rawTitle,
          slug,
          url,
          img,
          synopsis,
          type,
          status: 'Ongoing',
          isColored: type === 'manhwa' || type === 'manhua',
          genres,
          chapters,
        };

        if (chapters.length > 0) {
          setCache(cacheKey, detail);
          return detail;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[MangaScraper] Komiku detail failed, trying Komikindo fallback:', err);
  }

  // 2. Fallback to Komikindo
  try {
    const bases = [KOMIKINDO_BASE, KOMIKINDO_ALT];
    for (const base of bases) {
      try {
        const url = `${base}/komik/${slug}/`;
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        const rawTitle = $('h1.entry-title').text().trim() || $('h1').text().trim();
        const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
        if (!title) continue;

        const img = $('.thumb img').attr('data-src') || $('.thumb img').attr('src') || '';
        const synopsis = $('.entry-content-single').text().trim() || 'Sinopsis belum tersedia.';

        let type: 'manga' | 'manhwa' | 'manhua' = 'manga';
        let status = 'Ongoing';
        let author = '';
        let isColored = false;

        $('.spe span').each((_, el) => {
          const text = $(el).text().trim();
          if (text.includes('Jenis Komik:')) {
            const val = text.replace('Jenis Komik:', '').trim().toLowerCase();
            if (val.includes('manhwa')) type = 'manhwa';
            else if (val.includes('manhua')) type = 'manhua';
          } else if (text.includes('Status:')) {
            status = text.replace('Status:', '').trim();
          } else if (text.includes('Pengarang:') || text.includes('Author:')) {
            author = text.replace(/Pengarang:|Author:/i, '').trim();
          }
        });

        if ((type as string) === 'manhwa' || (type as string) === 'manhua') isColored = true;
        const rating = $('.archiveanime-rating i').text().trim() || $('.rating i').text().trim() || '8.5';

        const genres: string[] = [];
        $('.genre-info a, .spe a[href*="/genre/"]').each((_, el) => {
          const g = $(el).text().trim();
          if (g && !genres.includes(g)) genres.push(g);
        });

        const chapters: MangaDetail['chapters'] = [];
        $('#chapter_list li').each((_, el) => {
          const chLink = $(el).find('.lchx a').attr('href') || $(el).find('a').attr('href') || '';
          const chTitle = $(el).find('.lchx a').text().trim() || $(el).find('a').text().trim();
          const date = $(el).find('.dt').text().trim();

          if (chLink && chTitle) {
            const chSlug = chLink.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '');
            chapters.push({ title: chTitle, slug: chSlug, url: chLink, date });
          }
        });

        const detail: MangaDetail = {
          title,
          slug,
          url,
          img,
          synopsis,
          type,
          status,
          author,
          rating,
          isColored,
          genres,
          chapters,
        };

        setCache(cacheKey, detail);
        return detail;
      } catch {}
    }
  } catch (err) {
    console.error(`[MangaScraper] Error fetching manga detail for ${slug}:`, err);
  }

  return null;
}

/**
 * Fetch chapter images and navigation
 */
export async function getChapterData(chapterSlug: string): Promise<ChapterData | null> {
  const cacheKey = `manga:chapter:${chapterSlug}`;
  const cached = getCached<ChapterData>(cacheKey);
  if (cached) return cached;

  const cleanChapterSlug = chapterSlug.replace(/^\//, '').replace(/\/$/, '');

  // 1. Try Komiku
  try {
    const url = `${KOMIKU_BASE}/${cleanChapterSlug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('h1').text().trim();
    if (title && !title.includes('404')) {
      const images: string[] = [];
      $('#Baca_Komik img, .chapter-image img, #content img, .img-land-comic img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src');
        if (src && !src.includes('iklan') && !src.includes('logo') && !src.includes('promosi') && !src.includes('lazy')) {
          const fullSrc = src.startsWith('//') ? `https:${src}` : src;
          if (!images.includes(fullSrc)) {
            images.push(fullSrc);
          }
        }
      });

      // Extract manga info
      const mangaLink = $('a[href*="/manga/"]').first().attr('href') || '';
      const mangaSlug = mangaLink ? mangaLink.replace(/.*\/manga\//, '').replace(/\/$/, '') : cleanChapterSlug.replace(/-chapter-.*$/, '');
      const mangaTitle = $('a[href*="/manga/"]').first().text().trim() || mangaSlug.replace(/-/g, ' ');

      // Navigation links
      const prevHref = $('a[rel="prev"], a.prev, .nextprev a:contains("Sebelumnya")').first().attr('href');
      const nextHref = $('a[rel="next"], a.next, .nextprev a:contains("Selanjutnya")').first().attr('href');

      const prevChapterSlug = prevHref ? prevHref.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '').replace(/^\//, '') : null;
      const nextChapterSlug = nextHref ? nextHref.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '').replace(/^\//, '') : null;

      if (images.length > 0) {
        const data: ChapterData = {
          title,
          slug: cleanChapterSlug,
          mangaTitle,
          mangaSlug,
          images,
          prevChapterSlug,
          nextChapterSlug,
        };
        setCache(cacheKey, data);
        return data;
      }
    }
  } catch (err) {
    console.warn('[MangaScraper] Komiku chapter failed, trying Komikindo fallback:', err);
  }

  // 2. Fallback to Komikindo
  try {
    const bases = [KOMIKINDO_BASE, KOMIKINDO_ALT];
    for (const base of bases) {
      try {
        const url = `${base}/${cleanChapterSlug}/`;
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        const title = $('h1.entry-title').text().trim() || $('h1').text().trim();
        if (!title) continue;

        const parentLink = $('.allc a').attr('href') || $('a[href*="/komik/"]').first().attr('href') || '';
        const mangaSlug = parentLink.replace(/.*\/komik\//, '').replace(/\/$/, '');
        const mangaTitle = $('.allc a').text().trim() || mangaSlug.replace(/-/g, ' ');

        const images: string[] = [];
        $('#chimg-auh img, #readerarea img, .chapter-image img').each((_, el) => {
          const src = $(el).attr('data-src') || $(el).attr('src') || '';
          if (src && !src.includes('iklan') && !src.includes('banner') && !src.includes('iklangif')) {
            const fullSrc = src.startsWith('//') ? `https:${src}` : src;
            if (!images.includes(fullSrc)) {
              images.push(fullSrc);
            }
          }
        });

        const prevLink = $('.nextprev a[rel="prev"]').attr('href') || $('.ch-prev-btn').attr('href');
        const nextLink = $('.nextprev a[rel="next"]').attr('href') || $('.ch-next-btn').attr('href');

        const prevChapterSlug = prevLink ? prevLink.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '') : null;
        const nextChapterSlug = nextLink ? nextLink.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '') : null;

        const chapterData: ChapterData = {
          title,
          slug: cleanChapterSlug,
          mangaTitle,
          mangaSlug,
          images,
          prevChapterSlug,
          nextChapterSlug,
        };

        if (images.length > 0) {
          setCache(cacheKey, chapterData);
          return chapterData;
        }
      } catch {}
    }
  } catch (err) {
    console.error(`[MangaScraper] Error fetching chapter data for ${chapterSlug}:`, err);
  }

  return null;
}
