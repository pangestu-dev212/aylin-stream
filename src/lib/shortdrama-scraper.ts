const SANSEKAI_BASE = 'https://api.sansekai.my.id/api';

const DEFAULT_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Referer': 'https://api.sansekai.my.id/',
};

export interface ShortDramaCard {
  bookId: string;
  title: string;
  slug: string;
  cover: string;
  chapterCount: number;
  synopsis: string;
  tags: string[];
  isDubIndo: boolean;
  type: 'shortdrama';
}

export interface ShortDramaEpisode {
  episodeNo: number;
  name: string;
  streamUrl: string;
  rawUrl?: string;
  proxyUrl?: string;
  cover: string;
  isCharge: boolean;
}

export interface ShortDramaDetail extends ShortDramaCard {
  episodes: ShortDramaEpisode[];
}

// Memory cache
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 mins

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

function normalizeTitle(title: string): string {
  return (title || '')
    .replace(/^Nonton\s+/i, '')
    .trim();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Fetch Popular Dub Indo Short Dramas
 */
export async function getShortDramaPopular(): Promise<ShortDramaCard[]> {
  const cacheKey = 'shortdrama:popular';
  const cached = getCached<ShortDramaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${SANSEKAI_BASE}/dramabox/dubindo?classify=terpopuler`, {
      headers: DEFAULT_HEADERS,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const items = Array.isArray(raw) ? raw : (raw.data || []);

    const cards: ShortDramaCard[] = items.map((item: any) => {
      const title = normalizeTitle(item.bookName || item.title || 'Short Drama');
      return {
        bookId: String(item.bookId),
        title,
        slug: `${item.bookId}-${slugify(title)}`,
        cover: item.coverWap || item.cover || '',
        chapterCount: item.chapterCount || item.totalChapter || 0,
        synopsis: item.introduction || item.synopsis || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        isDubIndo: true,
        type: 'shortdrama',
      };
    });

    if (cards.length > 0) {
      setCache(cacheKey, cards);
    }
    return cards;
  } catch (err) {
    console.error('Error fetching popular short dramas:', err);
    return [];
  }
}

/**
 * Fetch Latest Short Dramas
 */
export async function getShortDramaLatest(): Promise<ShortDramaCard[]> {
  const cacheKey = 'shortdrama:latest';
  const cached = getCached<ShortDramaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${SANSEKAI_BASE}/dramabox/dubindo?classify=terbaru`, {
      headers: DEFAULT_HEADERS,
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const items = Array.isArray(raw) ? raw : (raw.data || []);

    const cards: ShortDramaCard[] = items.map((item: any) => {
      const title = normalizeTitle(item.bookName || item.title || 'Short Drama');
      return {
        bookId: String(item.bookId),
        title,
        slug: `${item.bookId}-${slugify(title)}`,
        cover: item.coverWap || item.cover || '',
        chapterCount: item.chapterCount || item.totalChapter || 0,
        synopsis: item.introduction || item.synopsis || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        isDubIndo: true,
        type: 'shortdrama',
      };
    });

    if (cards.length > 0) {
      setCache(cacheKey, cards);
    }
    return cards;
  } catch (err) {
    console.error('Error fetching latest short dramas:', err);
    return [];
  }
}

/**
 * Search Short Dramas
 */
export async function searchShortDrama(query: string): Promise<ShortDramaCard[]> {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) return [];

  const cacheKey = `shortdrama:search:${cleanQ}`;
  const cached = getCached<ShortDramaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${SANSEKAI_BASE}/dramabox/search?query=${encodeURIComponent(cleanQ)}`, {
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw = await res.json();
    const items = Array.isArray(raw) ? raw : (raw.data || []);

    const cards: ShortDramaCard[] = items.map((item: any) => {
      const title = normalizeTitle(item.bookName || item.title || 'Short Drama');
      return {
        bookId: String(item.bookId),
        title,
        slug: `${item.bookId}-${slugify(title)}`,
        cover: item.coverWap || item.cover || '',
        chapterCount: item.chapterCount || item.totalChapter || 0,
        synopsis: item.introduction || item.synopsis || '',
        tags: Array.isArray(item.tags) ? item.tags : [],
        isDubIndo: (item.bookName || '').toLowerCase().includes('sulih suara') || (item.tags || []).some((t: string) => t.toLowerCase().includes('dub')),
        type: 'shortdrama',
      };
    });

    if (cards.length > 0) {
      setCache(cacheKey, cards);
    }
    return cards;
  } catch (err) {
    console.error('Error searching short dramas:', err);
    return [];
  }
}

/**
 * Helper to fetch JSON with retries
 */
async function fetchWithRetry(url: string, retries = 2, timeoutMs = 12000): Promise<any | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: DEFAULT_HEADERS,
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Ignore and retry
    }
    if (attempt < retries) {
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return null;
}

/**
 * Get Short Drama detail and all playable episodes
 */
export async function getShortDramaDetail(bookId: string): Promise<ShortDramaDetail | null> {
  const cleanId = bookId.trim();
  if (!cleanId) return null;

  const cacheKey = `shortdrama:detail:${cleanId}`;
  const cached = getCached<ShortDramaDetail>(cacheKey);
  if (cached && cached.episodes?.length > 0) return cached;

  try {
    // 1. Fetch metadata and episodes concurrently with automatic retries
    const [detailRes, episodesRes] = await Promise.all([
      fetchWithRetry(`${SANSEKAI_BASE}/dramabox/detail?bookId=${encodeURIComponent(cleanId)}&lang=id`),
      fetchWithRetry(`${SANSEKAI_BASE}/dramabox/get-allepisode?bookId=${encodeURIComponent(cleanId)}`),
    ]);

    const info = detailRes?.data || detailRes || {};
    const rawEpisodes = Array.isArray(episodesRes) ? episodesRes : (episodesRes?.data || []);

    const title = normalizeTitle(info.bookName || 'Short Drama');
    const cover = info.coverWap || info.cover || '';
    const synopsis = info.introduction || info.synopsis || 'Sinopsis belum tersedia.';
    const tags = Array.isArray(info.tags) ? info.tags : [];

    // Parse episodes
    const episodes: ShortDramaEpisode[] = rawEpisodes.map((ep: any, idx: number) => {
      const episodeNo = typeof ep.chapterIndex === 'number' ? ep.chapterIndex + 1 : idx + 1;
      const name = ep.chapterName || `EP ${episodeNo}`;
      const epCover = ep.chapterImg || ep.chapterImgMap?.['720'] || cover;
      const isCharge = ep.isCharge === 1 || ep.chargeChapter === true;

      // Extract best video stream path
      let rawVideoUrl = '';
      if (Array.isArray(ep.cdnList) && ep.cdnList.length > 0) {
        for (const cdn of ep.cdnList) {
          if (Array.isArray(cdn.videoPathList)) {
            // Prioritize standard 720p or 1080p, then 540p / 360p, fallback to first
            const pathObj = cdn.videoPathList.find((p: any) => p.quality === 720) ||
                            cdn.videoPathList.find((p: any) => p.quality === 1080) ||
                            cdn.videoPathList.find((p: any) => p.quality === 540) ||
                            cdn.videoPathList.find((p: any) => p.quality === 360) ||
                            cdn.videoPathList[0];
            if (pathObj?.videoPath) {
              rawVideoUrl = pathObj.videoPath;
              break;
            }
          }
          if (cdn.videoPath) {
            rawVideoUrl = cdn.videoPath;
            break;
          }
        }
      }

      if (!rawVideoUrl) {
        rawVideoUrl = ep.videoUrl || ep.playUrl || ep.videoPath || '';
      }

      // Proxy URL for ISP-blocked fallbacks
      const proxyUrl = rawVideoUrl
        ? `/api/video-proxy?url=${encodeURIComponent(rawVideoUrl)}`
        : '';

      // Direct CDN stream is fastest and has no serverless timeout; proxyUrl is fallback
      const streamUrl = rawVideoUrl || proxyUrl;

      return {
        episodeNo,
        name,
        streamUrl,
        rawUrl: rawVideoUrl,
        proxyUrl,
        cover: epCover,
        isCharge,
      };
    });

    // Guard: Only construct detail if episodes exist
    if (episodes.length === 0) {
      console.warn(`[ShortDrama] No playable episodes returned for drama: ${cleanId}`);
      return null;
    }

    const detail: ShortDramaDetail = {
      bookId: cleanId,
      title,
      slug: `${cleanId}-${slugify(title)}`,
      cover,
      chapterCount: episodes.length || info.chapterCount || 0,
      synopsis,
      tags,
      isDubIndo: title.toLowerCase().includes('sulih suara') || tags.some((t: string) => typeof t === 'string' && t.toLowerCase().includes('dub')),
      type: 'shortdrama',
      episodes,
    };

    setCache(cacheKey, detail);
    return detail;
  } catch (err) {
    console.error(`Error fetching detail for short drama ${cleanId}:`, err);
    return null;
  }
}
