import * as cheerio from 'cheerio';
import { isContentSafe, isSafeQuery, filterSafeList, isNsfwText } from '@/lib/content-filter';
import { cleanSynopsis } from '@/lib/stream-scraper';

export const KOMIKU_BASES = ['https://komiku.org', 'https://komiku.id', 'https://komiku.co.id'];
export const KOMIKINDO_BASES = ['https://komikindo.ch', 'https://komikindo.org', 'https://komikindo.tv', 'https://komikindo.moe'];

export let KOMIKU_BASE = KOMIKU_BASES[0];
export let KOMIKINDO_BASE = KOMIKINDO_BASES[0];
export const KOMIKINDO_ALT = KOMIKINDO_BASES[1];
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function fetchFromKomikindo(pathBuilder: string | ((base: string) => string)): Promise<{ html: string; base: string }> {
  const currentBase = KOMIKINDO_BASE;
  const orderedBases = [currentBase, ...KOMIKINDO_BASES.filter(b => b !== currentBase)];
  let lastErr: any = null;
  for (const base of orderedBases) {
    try {
      const url = typeof pathBuilder === 'function' ? pathBuilder(base) : `${base}${pathBuilder.startsWith('/') ? '' : '/'}${pathBuilder}`;
      const html = await fetchHtml(url);
      if (html && html.length > 200) {
        if (base !== currentBase) {
          KOMIKINDO_BASE = base;
        }
        return { html, base };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All Komikindo mirror domains failed');
}

export async function fetchFromKomiku(pathBuilder: string | ((base: string) => string)): Promise<{ html: string; base: string }> {
  const currentBase = KOMIKU_BASE;
  const orderedBases = [currentBase, ...KOMIKU_BASES.filter(b => b !== currentBase)];
  let lastErr: any = null;
  for (const base of orderedBases) {
    try {
      const url = typeof pathBuilder === 'function' ? pathBuilder(base) : `${base}${pathBuilder.startsWith('/') ? '' : '/'}${pathBuilder}`;
      const html = await fetchHtml(url);
      if (html && html.length > 200) {
        if (base !== currentBase) {
          KOMIKU_BASE = base;
        }
        return { html, base };
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('All Komiku mirror domains failed');
}

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

async function fetchHtml(url: string, timeoutMs = 5000): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.7,en;q=0.3',
    },
    signal: AbortSignal.timeout(timeoutMs),
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

  // 1. Try Komikindo First (Fast, active, no Cloudflare block)
  try {
    const { html } = await fetchFromKomikindo(b => page === 1 ? `${b}/komik-terbaru/` : `${b}/komik-terbaru/page/${page}/`);
    const $ = cheerio.load(html);

    $('.animepost').each((_, el) => {
      const link = $(el).find('a').attr('href') || '';
      if (!link || link.includes('/konten/ecchi') || link.includes('/konten/hentai')) return;

      const rawTitle = $(el).find('.tt h3 a, a[rel="bookmark"], .tt h4, h4').first().text().trim();
      const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
      if (!title) return;

      const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
      const slug = link.replace(/.*\/komik\//, '').replace(/\/$/, '');

      if (!isContentSafe({ title, slug })) return;

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

    const safeItems = filterSafeList(items);
    if (safeItems.length > 0) {
      setCache(cacheKey, safeItems);
      return safeItems;
    }
  } catch (err) {
    console.warn('[MangaScraper] Komikindo fetch failed, trying Komiku fallback:', err);
  }

  // 2. Fallback to Komiku
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

    const safeItems = filterSafeList(items);
    if (safeItems.length > 0) {
      setCache(cacheKey, safeItems);
      return safeItems;
    }
  } catch (err) {
    console.error('[MangaScraper] Error fetching latest manga from Komiku:', err);
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
  if (!cleanQ || !isSafeQuery(cleanQ)) return [];

  const cacheKey = `manga:search:${cleanQ}`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  const results: MangaCard[] = [];
  const seenSlugs = new Set<string>();

  // 1. Check if the query matches titles in cached latest manga
  const latest = await getLatestManga(1);
  for (const item of latest) {
    if (item.title.toLowerCase().includes(cleanQ) || item.slug.toLowerCase().includes(cleanQ)) {
      if (!seenSlugs.has(item.slug) && isContentSafe(item)) {
        seenSlugs.add(item.slug);
        results.push(item);
      }
    }
  }

  // 2. Query Komikindo search
  try {
    const { html } = await fetchFromKomikindo(b => `${b}/?s=${encodeURIComponent(cleanQ)}`);
    const $ = cheerio.load(html);

    $('.animepost').each((_, el) => {
      const link = $(el).find('a').attr('href') || '';
      if (!link || link.includes('/konten/ecchi') || link.includes('/konten/hentai')) return;

      const rawTitle = $(el).find('.tt h3 a, a[rel="bookmark"], .tt h4, h4').first().text().trim();
      const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
      if (!title) return;

      const slug = link.replace(/.*\/komik\//, '').replace(/\/$/, '');
      if (seenSlugs.has(slug) || !isContentSafe({ title, slug })) return;
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
  } catch {}

  const safeResults = filterSafeList(results);
  setCache(cacheKey, safeResults);
  return safeResults;
}

/**
 * Fetch single manga detail and full chapter list
 */
export async function getMangaDetail(slug: string): Promise<MangaDetail | null> {
  if (!slug || !isSafeQuery(slug)) return null;

  const cacheKey = `manga:detail:${slug}`;
  const cached = getCached<MangaDetail>(cacheKey);
  if (cached && isContentSafe(cached)) return cached;

  const cleanBaseSlug = slug
    .replace(/^komik-/, '')
    .replace(/-indonesia$/, '')
    .replace(/-indo$/, '')
    .replace(/-id$/, '');

  const candidateSlugs = [
    slug,
    cleanBaseSlug,
    `${cleanBaseSlug}-id`,
    `${cleanBaseSlug}-indonesia`,
    `komik-${cleanBaseSlug}`,
    `komik-${cleanBaseSlug}-indo`,
    `${cleanBaseSlug}-indo`,
  ].filter((s, i, a) => s && a.indexOf(s) === i);

  // 1. Try Komikindo First (Fast, 200ms, active, no Cloudflare block)
  try {
    for (const testSlug of candidateSlugs) {
      try {
        const { html, base: activeBase } = await fetchFromKomikindo(`/komik/${testSlug}/`);
        const $ = cheerio.load(html);

        const rawTitle = $('h1.entry-title').text().trim() || $('h1').text().trim();
        const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
        if (!title) continue;

        const img = $('.thumb img').attr('data-src') || $('.thumb img').attr('src') || '';
        const rawSynopsis = $('.entry-content-single').text().trim() || 'Sinopsis belum tersedia.';
        const synopsis = cleanSynopsis(rawSynopsis);

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
          slug: testSlug,
          url: `${activeBase}/komik/${testSlug}/`,
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

        if (!isContentSafe(detail)) {
          console.warn(`[MangaScraper] Blocked NSFW manga detail from Komikindo: ${slug}`);
          return null;
        }

        if (chapters.length > 0) {
          setCache(cacheKey, detail);
          return detail;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[MangaScraper] Komikindo detail failed, trying Komiku fallback:', err);
  }

  // 2. Fallback to Komiku
  try {
    for (const testSlug of candidateSlugs) {
      try {
        const url = `${KOMIKU_BASE}/manga/${testSlug}/`;
        const html = await fetchHtml(url);
        const $ = cheerio.load(html);

        const rawTitle = $('h1').text().replace(/^Komik\s+/i, '').trim();
        if (!rawTitle || rawTitle.includes('404')) continue;

        const img = $('.ims img').attr('src') || $('img.lazy').first().attr('data-src') || '';
        const rawSynopsis = $('.desc, #Sinopsis p, p.desc').text().trim() || 'Sinopsis komik.';
        const synopsis = cleanSynopsis(rawSynopsis);

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

        if (chapters.length > 0 && isContentSafe(detail)) {
          setCache(cacheKey, detail);
          return detail;
        }
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
  if (!chapterSlug || isNsfwText(chapterSlug)) return null;

  const cacheKey = `manga:chapter:${chapterSlug}`;
  const cached = getCached<ChapterData>(cacheKey);
  if (cached) return cached;

  const cleanChapterSlug = chapterSlug.replace(/^\//, '').replace(/\/$/, '');

  // 1. Try Komikindo First (Fast, 200ms, no Cloudflare block)
  try {
    const candidatePaths = [
      `${cleanChapterSlug}`,
      `${cleanChapterSlug.replace(/chapter-(\d+)-(\d+)/i, 'chapter-$1.$2')}`,
      `ch/${cleanChapterSlug}`,
    ];

    for (const path of candidatePaths) {
      try {
        const { html } = await fetchFromKomikindo(`/${path}/`);
        const $ = cheerio.load(html);

        const title = $('h1.entry-title').text().trim() || $('h1').text().trim();
        if (!title || title.includes('404')) continue;

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

        if (images.length > 0) {
          const chapterData: ChapterData = {
            title,
            slug: cleanChapterSlug,
            mangaTitle,
            mangaSlug,
            images,
            prevChapterSlug,
            nextChapterSlug,
          };
          setCache(cacheKey, chapterData);
          return chapterData;
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[MangaScraper] Komikindo chapter fetch error:', err);
  }

  // 2. Fallback to Komiku (Short timeout)
  try {
    const url = `${KOMIKU_BASE}/${cleanChapterSlug}/`;
    const html = await fetchHtml(url, 3500);
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

      const mangaLink = $('a[href*="/manga/"]').first().attr('href') || '';
      const mangaSlug = mangaLink ? mangaLink.replace(/.*\/manga\//, '').replace(/\/$/, '') : cleanChapterSlug.replace(/-chapter-.*$/, '');
      const mangaTitle = $('a[href*="/manga/"]').first().text().trim() || mangaSlug.replace(/-/g, ' ');

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
    console.warn('[MangaScraper] Komiku chapter fallback failed:', err);
  }

  return null;
}
