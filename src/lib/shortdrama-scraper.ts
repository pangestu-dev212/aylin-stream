import { isContentSafe, isSafeQuery, filterSafeList } from '@/lib/content-filter';

const SANSEKAI_BASE = 'https://api.sansekai.my.id/api';

function getRandomIndoIp(): string {
  const prefixes = ['114.124', '114.122', '36.68', '36.72', '180.252', '182.1'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const b = Math.floor(Math.random() * 250 + 1);
  const c = Math.floor(Math.random() * 250 + 1);
  return `${prefix}.${b}.${c}`;
}

function getSansekaiHeaders(): Record<string, string> {
  const ip = getRandomIndoIp();
  return {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'X-Forwarded-For': ip,
    'Client-IP': ip,
    'X-Real-IP': ip,
    'Referer': 'https://api.sansekai.my.id/',
  };
}

export const FALLBACK_SHORT_DRAMAS: ShortDramaCard[] = [
  {
    bookId: '42000023894',
    title: 'Tolak Aku, Raja Naga (Sulih Suara)',
    slug: '42000023894-tolak-aku-raja-naga-sulih-suara',
    cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000023894/42000023894.jpg?t=1786009197962',
    chapterCount: 50,
    synopsis: 'Lyra, seorang manusia, tak sengaja bertemu Raja Naga, Kael dan menghabiskan malam yang mengubah takdirnya.',
    tags: ['Romansa Fantasi', 'Raja Naga', 'Sulih Suara'],
    isDubIndo: true,
    type: 'shortdrama',
  },
  {
    bookId: '42000023896',
    title: 'Identitas Tersembunyi Suamiku (Sulih Suara)',
    slug: '42000023896-identitas-tersembunyi-suamiku-sulih-suara',
    cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000023896/42000023896.jpg?t=1786009309924',
    chapterCount: 67,
    synopsis: 'Matt, ketua dewan Grup Utama, konglomerat terbesar di Negara Kora, pulang untuk merayakan ulang tahun ke-70 kakek istrinya.',
    tags: ['Pembalikan Identitas', 'CEO', 'Sulih Suara'],
    isDubIndo: true,
    type: 'shortdrama',
  },
  {
    bookId: '42000021621',
    title: 'Aku Raja Tersembunyi (Sulih Suara)',
    slug: '42000021621-aku-raja-tersembunyi-sulih-suara',
    cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000021621/42000021621.jpg?t=1784537880931',
    chapterCount: 63,
    synopsis: 'Di penerbangan menuju Kota Akios, Kris bertemu Hannah, pewaris Andian Tekno. Kris mengungkapkan identitas aslinya sebagai CEO Grup Titanio.',
    tags: ['Pembalikan Identitas', 'CEO', 'Sulih Suara'],
    isDubIndo: true,
    type: 'shortdrama',
  },
  {
    bookId: '42000024252',
    title: 'Sistem Super dan Tiga Primadona (Sulih Suara)',
    slug: '42000024252-sistem-super-dan-tiga-primadona-sulih-suara',
    cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000024252/42000024252.jpg?t=1786429074559',
    chapterCount: 54,
    synopsis: 'Mike hanya mahasiswa yang setiap hari bekerja keras, tapi dia mendapatkan sistem misterius yang mengubah kehidupannya.',
    tags: ['Sistem', 'Underdog', 'Sulih Suara'],
    isDubIndo: true,
    type: 'shortdrama',
  },
  {
    bookId: '42000024479',
    title: 'Kembalinya Sang Pewaris Tahta (Sulih Suara)',
    slug: '42000024479-kembalinya-sang-pewaris-tahta-sulih-suara',
    cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000024479/42000024479.jpg?t=1786600000000',
    chapterCount: 60,
    synopsis: 'Kisah perjuangan seorang pewaris tahta sejati yang kembali merebut hak keluarganya dari orang-orang serakah.',
    tags: ['Aksi', 'Pewaris', 'Sulih Suara'],
    isDubIndo: true,
    type: 'shortdrama',
  },
  {
    bookId: '42000023419',
    title: 'Bos Rahasiaku Ternyata Konglomerat (Sulih Suara)',
    slug: '42000023419-bos-rahasiaku-ternyata-konglomerat-sulih-suara',
    cover: 'https://hwztchapter.dramaboxdb.com/data/cppartner/4x2/42x0/420x0/42000023419/42000023419.jpg?t=1785500000000',
    chapterCount: 48,
    synopsis: 'Seorang karyawan magang yang tidak mengetahui bahwa manajer pemalu di kantornya adalah konglomerat pemilik seluruh gedung.',
    tags: ['Romansa Kantor', 'CEO', 'Sulih Suara'],
    isDubIndo: true,
    type: 'shortdrama',
  }
];

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
  if (cached && cached.length > 0) return cached;

  try {
    const res = await fetch(`${SANSEKAI_BASE}/dramabox/dubindo?classify=terpopuler`, {
      headers: getSansekaiHeaders(),
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

    const safeCards = filterSafeList(cards);
    if (safeCards.length > 0) {
      setCache(cacheKey, safeCards);
      return safeCards;
    }
    return filterSafeList(FALLBACK_SHORT_DRAMAS);
  } catch (err) {
    console.error('Error fetching popular short dramas, using safe fallback:', err);
    return filterSafeList(FALLBACK_SHORT_DRAMAS);
  }
}

/**
 * Fetch Latest Short Dramas
 */
export async function getShortDramaLatest(): Promise<ShortDramaCard[]> {
  const cacheKey = 'shortdrama:latest';
  const cached = getCached<ShortDramaCard[]>(cacheKey);
  if (cached && cached.length > 0) return cached;

  try {
    const res = await fetch(`${SANSEKAI_BASE}/dramabox/dubindo?classify=terbaru`, {
      headers: getSansekaiHeaders(),
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

    const safeCards = filterSafeList(cards);
    if (safeCards.length > 0) {
      setCache(cacheKey, safeCards);
      return safeCards;
    }
    return filterSafeList(FALLBACK_SHORT_DRAMAS);
  } catch (err) {
    console.error('Error fetching latest short dramas, using safe fallback:', err);
    return filterSafeList(FALLBACK_SHORT_DRAMAS);
  }
}

/**
 * Search Short Dramas
 */
export async function searchShortDrama(query: string): Promise<ShortDramaCard[]> {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ || !isSafeQuery(cleanQ)) return [];

  const cacheKey = `shortdrama:search:${cleanQ}`;
  const cached = getCached<ShortDramaCard[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${SANSEKAI_BASE}/dramabox/search?query=${encodeURIComponent(cleanQ)}`, {
      headers: getSansekaiHeaders(),
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

    const safeCards = filterSafeList(cards);
    if (safeCards.length > 0) {
      setCache(cacheKey, safeCards);
    }
    return safeCards;
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
        headers: getSansekaiHeaders(),
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

    // Guard: Block if drama matches NSFW or adult tropes
    if (!isContentSafe(detail)) {
      console.warn(`[ShortDrama] Blocked NSFW short drama: ${cleanId} - ${title}`);
      return null;
    }

    setCache(cacheKey, detail);
    return detail;
  } catch (err) {
    console.error(`Error fetching detail for short drama ${cleanId}:`, err);
    return null;
  }
}
