import * as cheerio from 'cheerio';

const KOMIKINDO_BASE = 'https://komikindo.ch';
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
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return res.text();
}

function parseMangaPost($: cheerio.CheerioAPI, el: any): MangaCard | null {
  const link = $(el).find('a').attr('href') || '';
  if (!link || link.includes('/konten/ecchi') || link.includes('/iklan')) return null;

  const rawTitle = $(el).find('.tt h3 a').text().trim() ||
                   $(el).find('a[rel="bookmark"]').attr('title') ||
                   $(el).find('.tt h4').text().trim() ||
                   $(el).find('h4').text().trim() ||
                   '';

  const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
  if (!title) return null;

  const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
  const slug = link.replace(/.*\/komik\//, '').replace(/\/$/, '');

  const typeFlagClass = $(el).find('.typeflag').attr('class') || '';
  let type: 'manga' | 'manhwa' | 'manhua' = 'manga';
  if (typeFlagClass.toLowerCase().includes('manhwa')) type = 'manhwa';
  else if (typeFlagClass.toLowerCase().includes('manhua')) type = 'manhua';

  const isColored = $(el).find('.warnacolor, .color, .warna').length > 0 || 
                    $(el).text().toLowerCase().includes('warna') ||
                    type === 'manhwa' || 
                    type === 'manhua';

  const latestChapterEl = $(el).find('.lsch a');
  const latestChapter = latestChapterEl.text().trim();
  const chapterUrl = latestChapterEl.attr('href') || '';
  const chapterSlug = chapterUrl ? chapterUrl.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '') : undefined;

  const rating = $(el).find('.rating i').text().trim();

  return {
    title,
    slug,
    url: link,
    img,
    latestChapter,
    chapterUrl,
    chapterSlug,
    type,
    isColored,
    rating,
  };
}

/**
 * Fetch latest updated comics (mix of manga, manhwa, colored)
 */
export async function getLatestManga(page: number = 1): Promise<MangaCard[]> {
  const cacheKey = `manga:latest:${page}`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = page === 1 ? `${KOMIKINDO_BASE}/komik-terbaru/` : `${KOMIKINDO_BASE}/komik-terbaru/page/${page}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const items: MangaCard[] = [];

    $('.animepost').each((_, el) => {
      const parsed = parseMangaPost($, el);
      if (parsed) items.push(parsed);
    });

    setCache(cacheKey, items);
    return items;
  } catch (err) {
    console.error('Error fetching latest manga:', err);
    return [];
  }
}

/**
 * Fetch colored comics only
 */
export async function getColoredManga(page: number = 1): Promise<MangaCard[]> {
  const cacheKey = `manga:colored:${page}`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = page === 1 ? `${KOMIKINDO_BASE}/komik-berwarna/` : `${KOMIKINDO_BASE}/komik-berwarna/page/${page}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const items: MangaCard[] = [];

    $('.animepost').each((_, el) => {
      const parsed = parseMangaPost($, el);
      if (parsed) {
        parsed.isColored = true;
        items.push(parsed);
      }
    });

    setCache(cacheKey, items);
    return items;
  } catch (err) {
    console.error('Error fetching colored manga:', err);
    return [];
  }
}

/**
 * Fetch popular / trending comics
 */
export async function getPopularManga(): Promise<MangaCard[]> {
  const cacheKey = `manga:popular`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${KOMIKINDO_BASE}/komik-populer/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const items: MangaCard[] = [];

    $('.animepost').each((_, el) => {
      const parsed = parseMangaPost($, el);
      if (parsed) items.push(parsed);
    });

    setCache(cacheKey, items);
    return items;
  } catch (err) {
    console.error('Error fetching popular manga:', err);
    return [];
  }
}

/**
 * Search manga by keyword
 */
export async function searchManga(query: string): Promise<MangaCard[]> {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return [];

  const cacheKey = `manga:search:${cleanQ}`;
  const cached = getCached<MangaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${KOMIKINDO_BASE}/?s=${encodeURIComponent(cleanQ)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const items: MangaCard[] = [];

    $('.animepost').each((_, el) => {
      const parsed = parseMangaPost($, el);
      if (parsed) items.push(parsed);
    });

    setCache(cacheKey, items);
    return items;
  } catch (err) {
    console.error('Error searching manga:', err);
    return [];
  }
}

/**
 * Fetch single manga detail and full chapter list
 */
export async function getMangaDetail(slug: string): Promise<MangaDetail | null> {
  const cacheKey = `manga:detail:${slug}`;
  const cached = getCached<MangaDetail>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${KOMIKINDO_BASE}/komik/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const rawTitle = $('h1.entry-title').text().trim() || $('h1').text().trim();
    const title = rawTitle.replace(/^Komik\s+/i, '').replace(/^Manga\s+/i, '').trim();
    if (!title) return null;

    const img = $('.thumb img').attr('data-src') || $('.thumb img').attr('src') || '';
    const synopsis = $('.entry-content-single').text().trim() || 'Sinopsis belum tersedia.';

    // Extract Info from .spe spans
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
      } else if (text.includes('Warna:')) {
        isColored = text.toLowerCase().includes('berwarna') || text.toLowerCase().includes('color');
      }
    });

    if ((type as string) === 'manhwa' || (type as string) === 'manhua') {
      isColored = true;
    }

    const rating = $('.archiveanime-rating i').text().trim() || $('.rating i').text().trim() || '8.5';

    // Genres
    const genres: string[] = [];
    $('.genre-info a, .spe a[href*="/genre/"]').each((_, el) => {
      const g = $(el).text().trim();
      if (g && !genres.includes(g)) genres.push(g);
    });

    // Chapter List
    const chapters: MangaDetail['chapters'] = [];
    $('#chapter_list li').each((_, el) => {
      const chLink = $(el).find('.lchx a').attr('href') || $(el).find('a').attr('href') || '';
      const chTitle = $(el).find('.lchx a').text().trim() || $(el).find('a').text().trim();
      const date = $(el).find('.dt').text().trim();

      if (chLink && chTitle) {
        const chSlug = chLink.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '');
        chapters.push({
          title: chTitle,
          slug: chSlug,
          url: chLink,
          date,
        });
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
  } catch (err) {
    console.error(`Error fetching manga detail for ${slug}:`, err);
    return null;
  }
}

/**
 * Fetch chapter images and navigation
 */
export async function getChapterData(chapterSlug: string): Promise<ChapterData | null> {
  const cacheKey = `manga:chapter:${chapterSlug}`;
  const cached = getCached<ChapterData>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${KOMIKINDO_BASE}/${chapterSlug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('h1.entry-title').text().trim() || $('h1').text().trim();
    if (!title) return null;

    // Extract manga parent link
    const parentLink = $('.allc a').attr('href') || $('a[href*="/komik/"]').first().attr('href') || '';
    const mangaSlug = parentLink.replace(/.*\/komik\//, '').replace(/\/$/, '');
    const mangaTitle = $('.allc a').text().trim() || mangaSlug.replace(/-/g, ' ');

    // Extract reader images
    const images: string[] = [];
    $('#chimg-auh img, #readerarea img, .chapter-image img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src') || '';
      if (src && !src.includes('iklan') && !src.includes('banner') && !src.includes('iklangif')) {
        // Ensure protocol
        const fullSrc = src.startsWith('//') ? `https:${src}` : src;
        if (!images.includes(fullSrc)) {
          images.push(fullSrc);
        }
      }
    });

    // Navigation (prev & next chapter)
    const prevLink = $('.nextprev a[rel="prev"]').attr('href') || $('.ch-prev-btn').attr('href');
    const nextLink = $('.nextprev a[rel="next"]').attr('href') || $('.ch-next-btn').attr('href');

    const prevChapterSlug = prevLink ? prevLink.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '') : null;
    const nextChapterSlug = nextLink ? nextLink.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '') : null;

    // All chapters dropdown options if present
    const allChapters: ChapterData['allChapters'] = [];
    $('select[name="chapter"] option, #select-chapter option').each((_, el) => {
      const optVal = $(el).attr('value') || '';
      const optText = $(el).text().trim();
      if (optVal && optText) {
        const slug = optVal.replace(/https?:\/\/[^\/]+\//, '').replace(/\/$/, '');
        allChapters.push({ title: optText, slug });
      }
    });

    const chapterData: ChapterData = {
      title,
      slug: chapterSlug,
      mangaTitle,
      mangaSlug,
      images,
      prevChapterSlug,
      nextChapterSlug,
      allChapters: allChapters.length > 0 ? allChapters : undefined,
    };

    setCache(cacheKey, chapterData);
    return chapterData;
  } catch (err) {
    console.error(`Error fetching chapter data for ${chapterSlug}:`, err);
    return null;
  }
}
