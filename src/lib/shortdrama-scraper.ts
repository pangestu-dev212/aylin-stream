const SANSEKAI_BASE = 'https://api.sansekai.my.id/api';

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
      headers: { 'Accept': 'application/json' },
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

    setCache(cacheKey, cards);
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
      headers: { 'Accept': 'application/json' },
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

    setCache(cacheKey, cards);
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
      headers: { 'Accept': 'application/json' },
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

    setCache(cacheKey, cards);
    return cards;
  } catch (err) {
    console.error('Error searching short dramas:', err);
    return [];
  }
}

/**
 * Get Short Drama detail and all playable episodes
 */
export async function getShortDramaDetail(bookId: string): Promise<ShortDramaDetail | null> {
  const cacheKey = `shortdrama:detail:${bookId}`;
  const cached = getCached<ShortDramaDetail>(cacheKey);
  if (cached) return cached;

  try {
    // 1. Fetch metadata and episodes concurrently
    const [detailRes, episodesRes] = await Promise.all([
      fetch(`${SANSEKAI_BASE}/dramabox/detail?bookId=${encodeURIComponent(bookId)}&lang=id`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(10000),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${SANSEKAI_BASE}/dramabox/get-allepisode?bookId=${encodeURIComponent(bookId)}`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(12000),
      }).then(r => r.ok ? r.json() : null).catch(() => null),
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
            // Prefer 720p or 1080p, fallback to first
            const pathObj = cdn.videoPathList.find((p: any) => p.quality === 720) ||
                            cdn.videoPathList.find((p: any) => p.quality === 1080) ||
                            cdn.videoPathList[0];
            if (pathObj?.videoPath) {
              rawVideoUrl = pathObj.videoPath;
              break;
            }
          }
        }
      }

      // Format decrypt streamUrl
      const streamUrl = rawVideoUrl
        ? `https://api.sansekai.my.id/api/dramabox/decrypt-video?url=${encodeURIComponent(rawVideoUrl)}`
        : '';

      return {
        episodeNo,
        name,
        streamUrl,
        cover: epCover,
        isCharge,
      };
    });

    const detail: ShortDramaDetail = {
      bookId,
      title,
      slug: `${bookId}-${slugify(title)}`,
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
    console.error(`Error fetching detail for short drama ${bookId}:`, err);
    return null;
  }
}
