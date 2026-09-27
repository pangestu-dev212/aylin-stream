import * as https from 'https';
import * as cheerio from 'cheerio';

// Ignore TLS errors for grey-market streaming sites (expired certs)
if (typeof process !== 'undefined') {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = function (warning, ...args) {
    const message = typeof warning === 'string' ? warning : warning?.message || '';
    if (message.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
      return;
    }
    return originalEmitWarning.apply(process, [warning, ...args] as any);
  };
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const OTAKUDESU_BASE = 'https://otakudesu.blog';
const ANICHIN_BASE = 'https://anichin.moe';
const JURAGANFILM_BASE = 'https://tv49.juragan.film'; // Active domain

// Simple in-memory cache system for ongoing lists (TTL: 10 minutes)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

let otakudesuOngoingCache: CacheEntry<AnimeCard[]> | null = null;
let anichinOngoingCache: CacheEntry<AnimeCard[]> | null = null;
let juraganfilmOngoingCache: CacheEntry<AnimeCard[]> | null = null;
let jikanOngoingCache: CacheEntry<AnimeCard[]> | null = null;
let animexinOngoingCache: CacheEntry<AnimeCard[]> | null = null;

// Thread-safe in-memory cache for details, catalog, searches, and episodes
const globalScraperCache = new Map<string, CacheEntry<any>>();

export function getFromCache<T>(key: string, ttlMs: number): T | null {
  const entry = globalScraperCache.get(key);
  if (entry && (Date.now() - entry.timestamp) < ttlMs) {
    return entry.data as T;
  }
  return null;
}

export function setInCache(key: string, data: any) {
  globalScraperCache.set(key, { data, timestamp: Date.now() });
}

// In-memory DNS cache to avoid repeated lookups
const dnsCache = new Map<string, { ip: string; timestamp: number }>();
const DNS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Helper to resolve domain via fast DoH (1.1.1.1 + Google DoH fallback) to bypass ISP block
async function resolveDns(domain: string): Promise<string | null> {
  const cached = dnsCache.get(domain);
  if (cached && (Date.now() - cached.timestamp) < DNS_CACHE_TTL_MS) {
    return cached.ip;
  }

  // 1. Try Cloudflare 1.1.1.1 directly (fastest and cleanest)
  try {
    const res = await fetch(`https://1.1.1.1/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { 'accept': 'application/dns-json' },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.Answer && data.Answer.length > 0) {
        const aRecord = data.Answer.find((r: any) => r.type === 1);
        if (aRecord) {
          const ip = String(aRecord.data);
          dnsCache.set(domain, { ip, timestamp: Date.now() });
          return ip;
        }
      }
    }
  } catch {}

  // 2. Try Google DoH as fallback
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { 'accept': 'application/dns-json' },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.Answer && data.Answer.length > 0) {
        const aRecord = data.Answer.find((r: any) => r.type === 1);
        if (aRecord) {
          const ip = String(aRecord.data);
          dnsCache.set(domain, { ip, timestamp: Date.now() });
          return ip;
        }
      }
    }
  } catch {}

  // 3. Fallback to cloudflare-dns.com
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { 'accept': 'application/dns-json' },
      signal: AbortSignal.timeout(2500)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.Answer && data.Answer.length > 0) {
        const aRecord = data.Answer.find((r: any) => r.type === 1);
        if (aRecord) {
          const ip = String(aRecord.data);
          dnsCache.set(domain, { ip, timestamp: Date.now() });
          return ip;
        }
      }
    }
  } catch {}

  return null;
}

// Custom request utilizing DoH and SNI for ISP bypass
async function fetchWithDoh(urlStr: string, followCount = 0): Promise<string> {
  if (followCount > 5) throw new Error("Too many redirects");
  
  const parsedUrl = new URL(urlStr);
  const domain = parsedUrl.hostname;
  const ip = await resolveDns(domain);
  if (!ip) throw new Error("DoH failed to resolve: " + domain);

  return new Promise((resolve, reject) => {
    const agent = new https.Agent({
      servername: domain,
      rejectUnauthorized: false
    });

    const req = https.request({
      hostname: ip,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'Host': domain,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      agent: agent
    }, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        const redirectUrl = res.headers.location || '';
        const absoluteUrl = redirectUrl.startsWith('http') ? redirectUrl : `https://${domain}${redirectUrl}`;
        
        // Check if redirect points back to the homepage (WordPress soft-404)
        try {
          const redirectParsed = new URL(absoluteUrl);
          if (redirectParsed.pathname === '/' && parsedUrl.pathname !== '/') {
            reject(new Error(`Redirected to homepage (soft-404): ${urlStr} -> ${absoluteUrl}`));
            return;
          }
        } catch {}

        try {
          resolve(fetchWithDoh(absoluteUrl, followCount + 1));
        } catch (err) {
          reject(err);
        }
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP error ${res.statusCode} for ${urlStr}`));
        return;
      }

      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', async () => {
        // Check if body is an explicit 404 page
        if (body.includes('<title>Page not found') || body.includes('Halaman tidak ditemukan') || body.includes('<title>404')) {
          reject(new Error(`Page Not Found: ${urlStr}`));
          return;
        }
        resolve(body);
      });
    });

    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error(`Request timeout for ${urlStr}`));
    });

    req.on('error', reject);
    req.end();
  });
}

// Helper to extract slug from URL
function extractSlug(url: string | undefined): string {
  if (!url) return '';
  const cleanUrl = url.replace(/\/$/, '');
  const parts = cleanUrl.split('/');
  return parts[parts.length - 1] || '';
}

// Helper to normalize relative URLs to absolute URLs
function normalizeUrl(path: string | undefined, base: string): string {
  if (!path) return '';
  const trimmed = path.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//')) {
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    return trimmed;
  }
  return `${base}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

// Request wrapper with custom User-Agent and intelligent DoH bypass
export async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${url}, status: ${res.status}`);
    }
    
    // Check if the final destination URL redirected to the homepage
    if (res.url) {
      try {
        const finalUrl = new URL(res.url);
        const origUrl = new URL(url);
        if (finalUrl.pathname === '/' && origUrl.pathname !== '/') {
          throw new Error(`Redirected to homepage: ${url} -> ${res.url}`);
        }
      } catch {}
    }

    const html = await res.text();
    
    // Check if the page is blocked by ISP Safesurf/Internet Positif
    if (html.includes('Safesurf') || html.includes('Internet Positif') || html.includes('Internet Sehat') || html.includes('safesurf')) {
      return await fetchWithDoh(url);
    }
    
    return html;
  } catch (err) {
    try {
      return await fetchWithDoh(url);
    } catch (dohErr) {
      throw dohErr;
    }
  }
}

// ==========================================
// OTAKUDESU SCRAPER
// ==========================================

export interface AnimeCard {
  title: string;
  slug: string;
  url: string;
  img: string;
  ep?: string;
  day?: string;
  type: 'anime' | 'donghua' | 'drama' | 'manga' | 'shortdrama';
  source?: string;
}

export interface AnimeDetail {
  title: string;
  slug: string;
  img: string;
  synopsis: string;
  details: string[];
  episodes: EpisodeLink[];
  type: 'anime' | 'donghua' | 'drama';
}

export interface EpisodeLink {
  title: string;
  slug: string;
  date?: string;
}

export interface MirrorStream {
  quality: string;
  playerText: string;
  payload: {
    id: number;
    i: number;
    q: string;
  };
}
// ==========================================
// ANILIST GRAPHQL API - Global Primary Source
// 100% reliable, no rate limiting, no auth needed
// ==========================================

export async function getJikanOngoingAnime(): Promise<AnimeCard[]> {
  const now = Date.now();
  if (jikanOngoingCache && (now - jikanOngoingCache.timestamp) < CACHE_TTL_MS) {
    return jikanOngoingCache.data;
  }

  // Determine current season
  const month = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';

  const query = `
    query {
      Page(page: 1, perPage: 30) {
        media(season: ${season}, seasonYear: ${year}, type: ANIME, status: RELEASING, sort: POPULARITY_DESC, isAdult: false) {
          id
          title { english romaji }
          coverImage { large extraLarge }
          episodes
          status
          siteUrl
          genres
          isAdult
        }
      }
    }
  `;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) throw new Error(`AniList API error: ${res.status}`);

    const json = await res.json();
    const data = json?.data?.Page?.media || [];

    const animeList: AnimeCard[] = data
      .filter((a: any) => !a.isAdult && !a.genres?.some((g: string) => ['Hentai', 'Erotica'].includes(g)))
      .map((a: any) => {
        const title = a.title?.english || a.title?.romaji || 'Unknown';
        const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        return {
          title,
          slug: `anilist-${a.id}-${slug}`,
          url: a.siteUrl || `https://anilist.co/anime/${a.id}`,
          img: a.coverImage?.extraLarge || a.coverImage?.large || '',
          ep: a.episodes ? `${a.episodes} Ep` : 'Ongoing',
          type: 'anime' as const,
          status: 'Ongoing',
        };
      });

    if (animeList.length > 0) {
      jikanOngoingCache = { data: animeList, timestamp: now };
    }
    return animeList;
  } catch (err) {
    console.error('Error in getAniListOngoingAnime:', err);

    // Secondary fallback: try Jikan API
    try {
      const jikanRes = await fetch('https://api.jikan.moe/v4/seasons/now?filter=tv&limit=25&sfw=true', {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (jikanRes.ok) {
        const jikanJson = await jikanRes.json();
        const jikanList: AnimeCard[] = (jikanJson.data || [])
          .filter((a: any) => 
            a.airing === true && 
            a.rating !== 'Rx - Hentai' && 
            !a.genres?.some((g: any) => g.name === 'Hentai' || g.name === 'Erotica')
          )
          .map((a: any) => ({
            title: a.title_english || a.title,
            slug: `jikan-${a.mal_id}-${(a.title_english || a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            url: a.url || '',
            img: a.images?.jpg?.large_image_url || '',
            ep: `Ep ${a.episodes || '?'}`,
            type: 'anime' as const,
            status: 'Ongoing',
          }));
        if (jikanList.length > 0) {
          jikanOngoingCache = { data: jikanList, timestamp: now };
          return jikanList;
        }
      }
    } catch {}

    return jikanOngoingCache ? jikanOngoingCache.data : [];
  }
}

export async function getOtakudesuOngoing(): Promise<AnimeCard[]> {
  const now = Date.now();
  if (otakudesuOngoingCache && (now - otakudesuOngoingCache.timestamp) < CACHE_TTL_MS) {
    return otakudesuOngoingCache.data;
  }

  try {
    const html = await fetchHtml(`${OTAKUDESU_BASE}/`);
    const $ = cheerio.load(html);
    const ongoing: AnimeCard[] = [];

    $('.venz .detpost').each((i, el) => {
      const title = $(el).find('.thumbz h2').text().trim();
      const url = $(el).find('.thumb a').attr('href');
      const img = $(el).find('.thumbz img').attr('src') || '';
      const ep = $(el).find('.epz').text().trim();
      const day = $(el).find('.epzti').text().trim();
      const slug = extractSlug(url);

      if (title && slug) {
        ongoing.push({ title, slug, url: url || '', img, ep, day, type: 'anime', source: 'otakudesu' });
      }
    });

    otakudesuOngoingCache = {
      data: ongoing,
      timestamp: now
    };

    return ongoing;
  } catch (err) {
    console.error("Error in getOtakudesuOngoing:", err);
    // Return stale cache if error occurs, otherwise empty array
    return otakudesuOngoingCache ? otakudesuOngoingCache.data : [];
  }
}

export async function getOtakudesuDetail(slug: string): Promise<AnimeDetail | null> {
  const cacheKey = `otakudesu:detail:${slug}`;
  const cached = getFromCache<AnimeDetail>(cacheKey, 30 * 60 * 1000); // 30 minutes
  if (cached) return cached;

  try {
    const url = `${OTAKUDESU_BASE}/anime/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.fotoanime .infozingle p').eq(0).find('span').text().replace(':', '').trim() || $('.fotoanime h1').text().trim();
    const img = $('.fotoanime img').attr('src') || '';
    const synopsis = $('.sinopse .entry-content p').text().trim() || $('.sinopse p').text().trim();

    const details: string[] = [];
    $('.fotoanime .infozingle p').each((i, el) => {
      details.push($(el).text().trim());
    });

    const episodes: EpisodeLink[] = [];
    $('.episodelist ul').each((i, ulEl) => {
      $(ulEl).find('li').each((j, el) => {
        const epTitle = $(el).find('a').text().trim();
        const epUrl = $(el).find('a').attr('href');
        const epDate = $(el).find('.zeeplay').text().trim();

        if (!epUrl) return;
        if (epTitle.toLowerCase().includes('batch') || epUrl.includes('/batch/')) return;

        const epSlug = extractSlug(epUrl);
        if (epTitle && epSlug) {
          episodes.push({ title: epTitle, slug: epSlug, date: epDate });
        }
      });
    });

    const result = { title, slug, img, synopsis, details, episodes, type: 'anime' as const };
    setInCache(cacheKey, result);
    return result;
  } catch (err: any) {
    console.warn(`[Otakudesu] Detail skipped/not found for ${slug}: ${err?.message || err}`);
    return null;
  }
}

export async function getOtakudesuEpisode(slug: string) {
  const cacheKey = `otakudesu:episode:${slug}`;
  const cached = getFromCache<any>(cacheKey, 120 * 60 * 1000); // 2 hours
  if (cached) return cached;

  try {
    const url = `${OTAKUDESU_BASE}/episode/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.venutama h1').text().trim();

    const mirrors: MirrorStream[] = [];
    $('.mirrorstream ul li').each((i, el) => {
      const quality = $(el).parent().attr('class') || 'unknown';
      const playerText = $(el).find('a').text().trim();
      const contentBase64 = $(el).find('a').attr('data-content');

      if (contentBase64) {
        try {
          const decoded = Buffer.from(contentBase64, 'base64').toString('utf-8');
          const payload = JSON.parse(decoded);
          mirrors.push({ quality, playerText, payload });
        } catch {
          // Ignore parse errors
        }
      }
    });

    const downloads: { quality: string; size: string; links: { host: string; url: string }[] }[] = [];
    $('.download ul li').each((i, el) => {
      const quality = $(el).find('strong').text().trim();
      const size = $(el).find('i').text().trim();
      const links: { host: string; url: string }[] = [];
      $(el).find('a').each((j, a) => {
        const host = $(a).text().trim();
        const href = $(a).attr('href');
        if (host && href) {
          links.push({ host, url: href });
        }
      });
      if (quality && links.length > 0) {
        downloads.push({ quality, size, links });
      }
    });

    const result = { title, slug, mirrors, downloads };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getOtakudesuEpisode for ${slug}:`, err);
    return null;
  }
}

export async function resolveOtakudesuMirror(id: number, i: number, q: string): Promise<string | null> {
  try {
    // 1. Fetch the nonce
    const nonceRes = await fetch(`${OTAKUDESU_BASE}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: new URLSearchParams({
        action: 'aa1208d27f29ca340c92c66d1926f13f'
      })
    });
    const nonceData = await nonceRes.json();
    const nonce = nonceData.data;
    if (!nonce) return null;

    // 2. Fetch the player iframe
    const embedRes = await fetch(`${OTAKUDESU_BASE}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      body: new URLSearchParams({
        id: id.toString(),
        i: i.toString(),
        q: q,
        nonce: nonce,
        action: '2a3505c93b0035d3f455df82bf976b84'
      })
    });
    const embedData = await embedRes.json();
    if (embedData.data) {
      const decodedHtml = Buffer.from(embedData.data, 'base64').toString('utf-8');
      
      // Extract iframe src
      const $ = cheerio.load(decodedHtml);
      const src = $('iframe').attr('src');
      return src || null;
    }
  } catch (err) {
    console.error("Error in resolveOtakudesuMirror:", err);
  }
  return null;
}

export async function getOtakudesuSearch(query: string): Promise<AnimeCard[]> {
  const cacheKey = `otakudesu:search:${query}`;
  const cached = getFromCache<AnimeCard[]>(cacheKey, 60 * 1000); // 1 minute
  if (cached) return cached;

  try {
    const url = `${OTAKUDESU_BASE}/?s=${encodeURIComponent(query)}&post_type=anime`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    $('.chivsrc li').each((i, el) => {
      const title = $(el).find('h2 a').text().trim();
      const url = $(el).find('h2 a').attr('href');
      const img = $(el).find('img').attr('src') || '';
      const slug = extractSlug(url);

      if (title && slug) {
        results.push({ title, slug, url: url || '', img, type: 'anime', source: 'otakudesu' });
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Error in getOtakudesuSearch:", err);
    return [];
  }
}

// ==========================================
// ANICHIN SCRAPER
// ==========================================

/**
 * Extracts the SERIES slug from an Anichin episode slug.
 * Episode slug example: "swallowed-star-episode-235-subtitle-indonesia"
 * Series slug result:   "swallowed-star"
 * 
 * Anichin detail/series pages live under /donghua/{series-slug}/
 * Episode pages live at the root: /{episode-slug}/
 */
function extractAnichinSeriesSlug(episodeSlug: string): string {
  // Remove common suffixes: "-episode-XX-subtitle-indonesia", "-ep-XX-sub-indo", etc.
  return episodeSlug
    .replace(/-episode-\d+.*$/i, '')
    .replace(/-ep-\d+.*$/i, '')
    .replace(/-subtitle-indonesia.*$/i, '')
    .replace(/-sub-indo.*$/i, '')
    .trim();
}

export async function getAnichinOngoing(): Promise<AnimeCard[]> {
  const now = Date.now();
  if (anichinOngoingCache && (now - anichinOngoingCache.timestamp) < CACHE_TTL_MS) {
    return anichinOngoingCache.data;
  }

  try {
    const html = await fetchHtml(`${ANICHIN_BASE}/`);
    const $ = cheerio.load(html);
    const ongoing: AnimeCard[] = [];

    $('.listupd .bs').each((i, el) => {
      // The series/clean title is inside .tt (before the <h2> child)
      const ttNode = $(el).find('.tt');
      // Get text content excluding the h2 child (episode title)
      const fullTitle = ttNode.clone().children().remove().end().text().trim();
      const cleanTitle = fullTitle || $(el).find('h4, .title').text().split('\t')[0].trim();

      const url = $(el).find('a').attr('href') || '';
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      
      // Extract episode number from the badge (e.g. "Ep 03")
      const epBadge = $(el).find('.epx').text().trim();
      const ep = epBadge || '';

      // Episode slug from URL — strip to get series slug
      const episodeSlug = extractSlug(url);
      const seriesSlug = extractAnichinSeriesSlug(episodeSlug);

      if (cleanTitle && seriesSlug) {
        ongoing.push({
          title: cleanTitle,
          slug: seriesSlug,       // ← series slug for the detail/watch page
          url: `${ANICHIN_BASE}/donghua/${seriesSlug}/`,
          img: normalizeUrl(img, ANICHIN_BASE),
          ep: ep || 'Release',
          type: 'donghua',
          source: 'anichin'
        });
      }
    });

    anichinOngoingCache = {
      data: ongoing,
      timestamp: now
    };

    return ongoing;
  } catch (err) {
    console.error("Error in getAnichinOngoing:", err);
    // Return stale cache if error occurs, otherwise empty array
    return anichinOngoingCache ? anichinOngoingCache.data : [];
  }
}

export async function getAnichinDetail(slug: string): Promise<AnimeDetail | null> {
  const cacheKey = `anichin:detail:${slug}`;
  const cached = getFromCache<AnimeDetail>(cacheKey, 30 * 60 * 1000); // 30 minutes
  if (cached) return cached;

  try {
    let html = '';
    let $ = cheerio.load('');
    let epCount = 0;

    // Try format 1: /anime/slug/
    try {
      const url = `${ANICHIN_BASE}/anime/${slug}/`;
      html = await fetchHtml(url);
      $ = cheerio.load(html);
      epCount = $('.eplister ul li').length;
    } catch {}

    // Try format 2: fallback /donghua/slug/
    if (epCount === 0) {
      try {
        const url = `${ANICHIN_BASE}/donghua/${slug}/`;
        html = await fetchHtml(url);
        $ = cheerio.load(html);
        epCount = $('.eplister ul li').length;
      } catch {}
    }

    // Try format 3: fallback direct /slug/
    if (epCount === 0) {
      try {
        const url = `${ANICHIN_BASE}/${slug}/`;
        html = await fetchHtml(url);
        $ = cheerio.load(html);
        epCount = $('.eplister ul li').length;
      } catch {}
    }

    const title = $('.info-content h1, .entry-title').text().trim();
    const rawImg = $('.thumb img').attr('src') || $('.thumb img').attr('data-src') || '';
    const img = normalizeUrl(rawImg, ANICHIN_BASE);
    const synopsis = $('.entry-content p, .sinopse p').text().trim();

    const details: string[] = [];
    $('.info-content .spe span').each((i, el) => {
      details.push($(el).text().trim());
    });

    const episodes: EpisodeLink[] = [];
    $('.eplister ul li').each((i, el) => {
      const epTitle = $(el).find('.epl-title').text().trim() || $(el).find('a').text().trim();
      const epUrl = $(el).find('a').attr('href') || '';
      const epDate = $(el).find('.epl-date').text().trim();

      const epSlug = extractSlug(epUrl);
      if (epTitle && epSlug) {
        episodes.push({ title: epTitle, slug: epSlug, date: epDate });
      }
    });

    const result = { title, slug, img, synopsis, details, episodes, type: 'donghua' as const };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getAnichinDetail for ${slug}:`, err);
    return null;
  }
}

/**
 * Fetches a video embed page server-side with the correct Referer header,
 * then extracts the real video stream URL (m3u8/mp4) from the JavaScript.
 * Returns null if no direct video URL is found.
 */
async function extractDirectVideoSrc(embedUrl: string): Promise<string | null> {
  if (!embedUrl) return null;
  try {
    const parsed = new URL(embedUrl);
    const origin = parsed.origin;

    const html = await (async () => {
      // Fetch with correct Referer so server-side hotlink check passes
      const res = await fetch(embedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': `${origin}/`,
          'Origin': origin,
        }
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      return res.text();
    })().catch(async () => {
      // Fallback via DoH
      return fetchWithDoh(embedUrl);
    });

    // Pattern 1: JWPlayer / common player sources array
    // e.g. sources:[{file:"https://cdn.../video.m3u8"}]
    const jwMatch = html.match(/['"](https?:\/\/[^'"]+\.(?:m3u8|mp4|ts)[^'"]*)['"]/i);
    if (jwMatch) return jwMatch[1];

    // Pattern 2: var source = "https://..."
    const varMatch = html.match(/(?:source|file|src)\s*[=:]\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)/i);
    if (varMatch) return varMatch[1];

    // Pattern 3: Plyr / Video.js config
    const plyrMatch = html.match(/["']src["']\s*:\s*["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)/i);
    if (plyrMatch) return plyrMatch[1];

    // Pattern 4: data-file attribute
    const dataFileMatch = html.match(/data-(?:file|src|url)=["'](https?:\/\/[^"']+\.(?:m3u8|mp4)[^"']*)/i);
    if (dataFileMatch) return dataFileMatch[1];

  } catch (err) {
    // Silently fail — will fall back to iframe approach
  }
  return null;
}

export async function getAnichinEpisode(slug: string) {
  const cacheKey = `anichin:episode:${slug}`;
  const cached = getFromCache<any>(cacheKey, 120 * 60 * 1000); // 2 hours
  if (cached) return cached;

  try {
    const url = `${ANICHIN_BASE}/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.entry-title, h1').text().trim();
    
    const mirrors: any[] = [];

    // 1. Get the default player iframe
    let defaultSrc = $('iframe').attr('src') || '';
    if (defaultSrc) {
      defaultSrc = normalizeUrl(defaultSrc, ANICHIN_BASE);
      // Try to extract direct video URL from the default embed
      const directSrc = await extractDirectVideoSrc(defaultSrc);
      mirrors.push({
        quality: 'HD',
        playerText: 'Default Player',
        payload: { src: defaultSrc, directSrc: directSrc || null }
      });
    }

    // 2. Extract options from select.mirror
    const mirrorPromises: Promise<void>[] = [];
    $('select.mirror option').each((i, el) => {
      const val = $(el).attr('value');
      const text = $(el).text().trim();
      if (!val) return;
      
      mirrorPromises.push((async () => {
        try {
          const decoded = Buffer.from(val, 'base64').toString('utf-8');
          const $iframe = cheerio.load(decoded);
          let iframeSrc = $iframe('iframe').attr('src') || '';
          if (iframeSrc) {
            iframeSrc = normalizeUrl(iframeSrc, ANICHIN_BASE);
            if (iframeSrc !== defaultSrc) {
              // Try to extract direct video URL
              const directSrc = await extractDirectVideoSrc(iframeSrc);
              mirrors.push({
                quality: 'HD',
                playerText: text,
                payload: { src: iframeSrc, directSrc: directSrc || null }
              });
            }
          }
        } catch {
          // Ignore decoding errors
        }
      })());
    });

    await Promise.all(mirrorPromises);

    const result = { title, slug, mirrors };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getAnichinEpisode for ${slug}:`, err);
    return null;
  }
}


export async function getAnichinSearch(query: string): Promise<AnimeCard[]> {
  const cacheKey = `anichin:search:${query}`;
  const cached = getFromCache<AnimeCard[]>(cacheKey, 60 * 1000); // 1 minute
  if (cached) return cached;

  try {
    const url = `${ANICHIN_BASE}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    $('.listupd .bs').each((i, el) => {
      const fullTitle = $(el).find('h4, .tt, .title').text().trim();
      const url = $(el).find('a').attr('href');
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      
      const cleanTitle = fullTitle.split('\t')[0].trim();
      const slug = extractSlug(url);

      if (cleanTitle && slug) {
        results.push({
          title: cleanTitle,
          slug,
          url: normalizeUrl(url, ANICHIN_BASE),
          img: normalizeUrl(img, ANICHIN_BASE),
          type: 'donghua',
          source: 'anichin'
        });
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Error in getAnichinSearch:", err);
    return [];
  }
}

// ==========================================
// JURAGANFILM SCRAPER (DRAMA & MOVIE)
// ==========================================

export async function getJuraganfilmOngoing(): Promise<AnimeCard[]> {
  const now = Date.now();
  if (juraganfilmOngoingCache && (now - juraganfilmOngoingCache.timestamp) < CACHE_TTL_MS) {
    return juraganfilmOngoingCache.data;
  }

  try {
    const urls = [
      `${JURAGANFILM_BASE}/`,
      `${JURAGANFILM_BASE}/page/2/`,
      `${JURAGANFILM_BASE}/page/3/`
    ];

    const htmls = await Promise.all(urls.map(url => fetchHtml(url).catch(() => '')));
    const ongoing: AnimeCard[] = [];

    htmls.forEach(html => {
      if (!html) return;
      const $ = cheerio.load(html);

      $('article').each((i, el) => {
        const fullTitle = $(el).find('.entry-title a').text().trim() || $(el).find('h2 a').text().trim();
        const url = $(el).find('.entry-title a').attr('href') || $(el).find('a').first().attr('href') || '';
        const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
        
        // Clean title from common prefix
        const title = fullTitle.replace(/^Nonton\s+(Film\s+)?/i, '').trim();
        const slug = extractSlug(url);

        // Extract optional episode or rating indicator
        const epText = $(el).find('.gmr-quality-item').text().trim() || 'SUB INDO';

        if (title && slug) {
          ongoing.push({
            title,
            slug,
            url,
            img,
            ep: epText,
            type: 'donghua', // will be mapped dynamically or treated generically as 'drama' in frontend
            source: 'juraganfilm'
          });
        }
      });
    });

    // Deduplicate by slug to ensure unique items
    const uniqueOngoing = [...new Map(ongoing.map(item => [item.slug, item])).values()];

    juraganfilmOngoingCache = {
      data: uniqueOngoing,
      timestamp: now
    };

    return uniqueOngoing;
  } catch (err) {
    console.error("Error in getJuraganfilmOngoing:", err);
    return juraganfilmOngoingCache ? juraganfilmOngoingCache.data : [];
  }
}

export async function getJuraganfilmDetail(slug: string): Promise<AnimeDetail | null> {
  const cacheKey = `juraganfilm:detail:${slug}`;
  const cached = getFromCache<AnimeDetail>(cacheKey, 30 * 60 * 1000); // 30 minutes
  if (cached) return cached;

  try {
    // Real Juraganfilm slugs use /film-seri/ for series and /film/ for movies
    // Slugs often start with 'nonton-' e.g. nonton-the-early-spring-2026-sub-indo
    const candidateUrls = [
      `${JURAGANFILM_BASE}/film-seri/${slug}/`,
      `${JURAGANFILM_BASE}/film/${slug}/`,
      `${JURAGANFILM_BASE}/${slug}/`
    ];

    let $: cheerio.CheerioAPI | null = null;
    let title = '';

    for (const testUrl of candidateUrls) {
      try {
        const fetched = await fetchHtml(testUrl);
        const $test = cheerio.load(fetched);
        const t = $test('.entry-title, h1').first().text().trim();
        // Reject soft-404 pages (tag pages, search result pages, "not found" pages)
        const isTagOrSearch = t.toLowerCase().startsWith('tag:') ||
                              t.toLowerCase().startsWith('search results') ||
                              t.toLowerCase().includes('page not found') ||
                              t.toLowerCase().includes('404');
        if (t && !isTagOrSearch) {
          $ = $test;
          title = t.replace(/^Nonton\s+(Film\s+)?/i, '').replace(/[–-]\s*JuraganFIlm.*$/i, '').replace(/\s+Sub Indo$/i, '').trim();
          break;
        }
      } catch {}
    }

    if (!$ || !title) {
      console.warn(`Could not find valid Juraganfilm detail page for slug: ${slug}`);
      return null;
    }

    // Poster image
    const img = $('.wp-post-image').attr('src') || 
                $('.aligncenter').attr('src') || 
                $('.pull-left img').attr('src') ||
                $('.gmr-poster-wrapper img').attr('src') || 
                $('.gmr-poster-wrapper img').attr('data-src') || 
                '';
    
    // Synopsis
    const synopsis = $('.entry-content p').text().trim() || 'Tidak ada sinopsis.';

    // Details/Meta
    const details: string[] = [];
    $('.gmr-movie-genre, .gmr-moviedata').each((i, el) => {
      details.push($(el).text().trim());
    });

    // Episodes list
    const episodes: EpisodeLink[] = [];
    
    // Episode pagination: check `.jf-eps-wrap`
    const epsWrap = $('.jf-eps-wrap');
    if (epsWrap.length > 0) {
      // Current active page is Episode 1
      episodes.push({
        title: 'Episode 1',
        slug: slug // episode 1 is the main slug itself
      });

      // Find other pages
      epsWrap.find('a.post-page-numbers').each((i, el) => {
        const epUrl = $(el).attr('href') || '';
        // Extract episode number suffix (e.g. from /slug/2/ -> epSlug = slug/2)
        try {
          const parsedUrl = new URL(epUrl);
          const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
          const pageNum = pathSegments[pathSegments.length - 1]; // "2", "3", etc.
          
          if (pageNum && !isNaN(Number(pageNum))) {
            episodes.push({
              title: `Episode ${pageNum}`,
              slug: `${slug}/${pageNum}` // relative format
            });
          }
        } catch {}
      });
    } else {
      // Standalone Movie (1 part)
      episodes.push({
        title: 'Putar Film',
        slug: slug
      });
    }

    const result = { title, slug, img, synopsis, details, episodes, type: 'donghua' as const };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getJuraganfilmDetail for ${slug}:`, err);
    return null;
  }
}

export async function getJuraganfilmEpisode(slug: string) {
  const cacheKey = `juraganfilm:episode:${slug}`;
  const cached = getFromCache<any>(cacheKey, 120 * 60 * 1000); // 2 hours
  if (cached) return cached;

  try {
    // If slug contains a slash (e.g. "nonton-drama/2"), split it
    const parts = slug.split('/');
    const mainSlug = parts[0];
    const pageNum = parts[1] || '';

    const isMovie = mainSlug.startsWith('nonton-') || mainSlug.includes('movie');
    const candidateUrls = pageNum
      ? [
          `${JURAGANFILM_BASE}/film-seri/${mainSlug}/${pageNum}/`,
          `${JURAGANFILM_BASE}/${mainSlug}/${pageNum}/`,
          `${JURAGANFILM_BASE}/film/${mainSlug}/${pageNum}/`
        ]
      : (isMovie
          ? [
              `${JURAGANFILM_BASE}/${mainSlug}/`,
              `${JURAGANFILM_BASE}/film/${mainSlug}/`,
              `${JURAGANFILM_BASE}/film-seri/${mainSlug}/`
            ]
          : [
              `${JURAGANFILM_BASE}/film-seri/${mainSlug}/`,
              `${JURAGANFILM_BASE}/${mainSlug}/`,
              `${JURAGANFILM_BASE}/film/${mainSlug}/`
            ]
        );

    let title = '';
    let playerSrc = '';

    for (const testUrl of candidateUrls) {
      try {
        const fetched = await fetchHtml(testUrl);
        const $test = cheerio.load(fetched);
        const src = $test('iframe').attr('src') || $test('iframe').attr('data-src') || '';
        if (src) {
          title = $test('.entry-title, h1').first().text().trim();
          playerSrc = normalizeUrl(src, JURAGANFILM_BASE);
          break;
        }
      } catch {}
    }

    if (!playerSrc) {
      console.warn(`No player iframe found for Juraganfilm slug: ${slug}`);
      return null;
    }

    const mirrors: any[] = [];

    // Always include web embed player as the primary high-compatibility option
    mirrors.push({
      quality: 'HD',
      playerText: 'Web Player (Embed)',
      payload: { src: playerSrc }
    });

    // If iframe is jf_engine, fetch jf_engine to extract direct SOURCES (MP4/HLS)
    if (playerSrc.includes('jf_engine')) {
      try {
        const jfHtml = await fetchHtml(playerSrc);
        const sourceMatch = jfHtml.match(/const SOURCES = ([\s\S]*?);/);
        if (sourceMatch) {
          const sources = JSON.parse(sourceMatch[1]);
          if (Array.isArray(sources)) {
            // Add MP4 sources first (compatible natively with <video>)
            const mp4Sources = sources.filter((s: any) => s.link && (s.link.includes('.mp4') || s.label?.includes('MP4')));
            mp4Sources.forEach((s: any, idx: number) => {
              mirrors.push({
                quality: s.label || 'MP4',
                playerText: `Server ${s.label || `MP4 ${idx + 1}`}`,
                payload: {
                  src: s.link,
                  directSrc: s.link
                }
              });
            });

            // Then add adaptive HLS sources
            const otherSources = sources.filter((s: any) => s.link && !s.link.includes('.mp4') && !s.label?.includes('MP4'));
            otherSources.forEach((s: any, idx: number) => {
              mirrors.push({
                quality: s.label || 'Streaming',
                playerText: `Server ${s.label || `Streaming ${idx + 1}`}`,
                payload: {
                  src: s.link,
                  directSrc: s.link
                }
              });
            });
          }
        }
      } catch (jfErr) {
        console.warn('Failed to parse jf_engine direct streams:', jfErr);
      }
    }

    const result = { title, slug, mirrors };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getJuraganfilmEpisode for ${slug}:`, err);
    return null;
  }
}

export async function getJuraganfilmSearch(query: string): Promise<AnimeCard[]> {
  const cacheKey = `juraganfilm:search:${query}`;
  const cached = getFromCache<AnimeCard[]>(cacheKey, 60 * 1000); // 1 minute
  if (cached) return cached;

  try {
    const url = `${JURAGANFILM_BASE}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    $('article').each((i, el) => {
      const fullTitle = $(el).find('.entry-title a').text().trim() || $(el).find('h2 a').text().trim();
      const url = $(el).find('.entry-title a').attr('href') || $(el).find('a').first().attr('href') || '';
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      
      const title = fullTitle.replace(/^Nonton\s+(Film\s+)?/i, '').trim();
      const slug = extractSlug(url);

      if (title && slug) {
        results.push({
          title,
          slug,
          url,
          img,
          type: 'donghua', // will resolve as 'drama' on search client mapping
          source: 'juraganfilm'
        });
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Error in getJuraganfilmSearch:", err);
    return [];
  }
}

export async function getOtakudesuCatalog(letter: string): Promise<AnimeCard[]> {
  const cacheKey = `otakudesu:catalog:${letter}`;
  const cached = getFromCache<AnimeCard[]>(cacheKey, 6 * 60 * 60 * 1000); // 6 hours
  if (cached) return cached;

  try {
    const html = await fetchHtml(`${OTAKUDESU_BASE}/anime-list/`);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();

      if (href.startsWith(`${OTAKUDESU_BASE}/anime/`) && !href.includes('/episode/') && !href.includes('/genres/') && text.length > 0) {
        const title = text;
        const slug = extractSlug(href);

        const firstChar = title.trim().charAt(0).toUpperCase();
        let match = false;
        if (letter === 'ALL') {
          match = true;
        } else if (letter === '#') {
          match = /[^A-Z]/.test(firstChar);
        } else {
          match = firstChar === letter.toUpperCase();
        }

        if (match && slug) {
          results.push({
            title,
            slug,
            url: href,
            img: '',
            type: 'anime'
          });
        }
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Error in getOtakudesuCatalog:", err);
    return [];
  }
}

export async function getAnichinCatalog(letter: string, page = 1): Promise<{ results: AnimeCard[], totalPages: number }> {
  const cacheKey = `anichin:catalog:${letter}:${page}`;
  const cached = getFromCache<{ results: AnimeCard[], totalPages: number }>(cacheKey, 6 * 60 * 60 * 1000); // 6 hours
  if (cached) return cached;

  try {
    let showParam = letter;
    if (letter === '#') showParam = '.';

    const url = `${ANICHIN_BASE}/az-lists/${page > 1 ? `page/${page}/` : ''}?show=${encodeURIComponent(showParam)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    $('.listupd .bs').each((i, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href') || '';
      const title = a.attr('title') || $(el).find('.tt').text().trim() || a.text().trim();
      const rawImg = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const img = normalizeUrl(rawImg, ANICHIN_BASE);
      const slug = extractSlug(href);

      if (title && slug) {
        results.push({
          title,
          slug,
          url: normalizeUrl(href, ANICHIN_BASE),
          img,
          type: 'donghua'
        });
      }
    });

    let totalPages = 1;
    $('.pagination .page-numbers').each((i, el) => {
      const pageText = $(el).text().trim();
      const pageNum = Number(pageText);
      if (!isNaN(pageNum) && pageNum > totalPages) {
        totalPages = pageNum;
      }
    });

    const result = { results, totalPages };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error("Error in getAnichinCatalog:", err);
    return { results: [], totalPages: 1 };
  }
}

export async function getJuraganfilmCatalog(letter: string = 'ALL', page = 1, genre = ''): Promise<{ results: AnimeCard[], totalPages: number }> {
  const cacheKey = `juraganfilm:catalog:${letter}:${genre}:${page}`;
  const cached = getFromCache<{ results: AnimeCard[], totalPages: number }>(cacheKey, 60 * 60 * 1000); // 1 hour
  if (cached) return cached;

  try {
    let url = `${JURAGANFILM_BASE}/film-terbaru/${page > 1 ? `page/${page}/` : ''}`;
    if (genre && genre !== 'ALL') {
      url = `${JURAGANFILM_BASE}/genre/${encodeURIComponent(genre.toLowerCase())}/${page > 1 ? `page/${page}/` : ''}`;
    } else if (letter && letter !== 'ALL') {
      url = `${JURAGANFILM_BASE}/${page > 1 ? `page/${page}/` : ''}?s=${encodeURIComponent(letter)}`;
    }

    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    $('article').each((i, el) => {
      const fullTitle = $(el).find('.entry-title a').text().trim() || $(el).find('h2 a').text().trim();
      const href = $(el).find('.entry-title a').attr('href') || $(el).find('a').first().attr('href') || '';
      const rawImg = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const epText = $(el).find('.gmr-quality-item').text().trim() || 'SUB INDO';
      
      const title = fullTitle.replace(/^Nonton\s+(Film\s+)?/i, '').trim();
      const slug = extractSlug(href);

      if (title && slug) {
        results.push({
          title,
          slug,
          url: href,
          img: rawImg,
          ep: epText,
          type: 'drama',
          source: 'juraganfilm'
        });
      }
    });

    let totalPages = 1;
    $('.pagination .page-numbers, .page-numbers').each((i, el) => {
      const pageText = $(el).text().trim().replace(/,/g, '');
      const pageNum = Number(pageText);
      if (!isNaN(pageNum) && pageNum > totalPages) {
        totalPages = pageNum;
      }
    });

    const result = { results, totalPages };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error("Error in getJuraganfilmCatalog:", err);
    return { results: [], totalPages: 1 };
  }
}

export interface DaySchedule {
  day: string;
  anime: { title: string; slug: string; url: string }[];
}

export async function getWeeklySchedule(): Promise<DaySchedule[]> {
  const cacheKey = `stream:weekly_schedule`;
  const cached = getFromCache<DaySchedule[]>(cacheKey, 2 * 60 * 60 * 1000); // 2 hours
  if (cached) return cached;

  try {
    const html = await fetchHtml(`${OTAKUDESU_BASE}/jadwal-rilis/`);
    const $ = cheerio.load(html);
    const schedule: DaySchedule[] = [];

    $('.kglist321').each((i, el) => {
      const day = $(el).find('h2').text().trim();
      const animeList: { title: string; slug: string; url: string }[] = [];

      $(el).find('ul li a').each((j, a) => {
        const title = $(a).text().trim();
        const href = $(a).attr('href') || '';
        const slug = extractSlug(href);
        if (title && slug) {
          animeList.push({ title, slug, url: href });
        }
      });

      if (day && animeList.length > 0) {
        schedule.push({ day, anime: animeList });
      }
    });

    if (schedule.length > 0) {
      setInCache(cacheKey, schedule);
      return schedule;
    }
    return [];
  } catch (err: any) {
    console.warn("[Otakudesu] getWeeklySchedule notice:", err?.message || err);
    return [];
  }
}

// ==========================================
// SAMEHADAKU SCRAPER (ALTERNATIVE ANIME)
// ==========================================

const SAMEHADAKU_BASE = 'https://v2.samehadaku.how';

let samehadakuOngoingCache: { data: AnimeCard[]; timestamp: number } | null = null;

export async function getSamehadakuOngoing(): Promise<AnimeCard[]> {
  const now = Date.now();
  if (samehadakuOngoingCache && (now - samehadakuOngoingCache.timestamp) < CACHE_TTL_MS) {
    return samehadakuOngoingCache.data;
  }

  try {
    let html = '';
    try {
      html = await fetchHtml(`${SAMEHADAKU_BASE}/`);
    } catch {
      try {
        html = await fetchHtml(`${SAMEHADAKU_BASE}/anime-terbaru/`);
      } catch {}
    }

    const $ = cheerio.load(html);
    const ongoing: AnimeCard[] = [];

    // Parse samehadaku post items & cards
    $('article, .animepost, .animpost, .sw-eps, .post-item').each((i, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href') || '';
      const title = $(el).find('.sw-eps-judul a, h2 a, h3 a, .title a, .entry-title a').first().text().trim() ||
                    $(el).find('.sw-eps-judul, .title, .entry-title, h2, h3').first().text().trim() ||
                    a.attr('title') || '';
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const epMatch = title.match(/Episode\s+\d+/i);
      const ep = epMatch ? epMatch[0] : ($(el).find('.sw-eps-baris a, .ep, .epx, .sw-eps-baris').first().text().trim() || 'Ongoing');
      const slug = extractSlug(href);

      if (title && slug) {
        ongoing.push({
          title,
          slug,
          url: href,
          img: normalizeUrl(img, SAMEHADAKU_BASE),
          ep,
          type: 'anime',
          source: 'samehadaku'
        });
      }
    });

    // Deduplicate by slug
    const uniqueOngoing = [...new Map(ongoing.map(item => [item.slug, item])).values()];

    if (uniqueOngoing.length > 0) {
      samehadakuOngoingCache = { data: uniqueOngoing, timestamp: now };
      return uniqueOngoing;
    }

    return samehadakuOngoingCache ? samehadakuOngoingCache.data : [];
  } catch (err) {
    console.error('Error in getSamehadakuOngoing:', err);
    return samehadakuOngoingCache ? samehadakuOngoingCache.data : [];
  }
}

export async function getSamehadakuDetail(slug: string): Promise<AnimeDetail | null> {
  const cacheKey = `samehadaku:detail:${slug}`;
  const cached = getFromCache<AnimeDetail>(cacheKey, 30 * 60 * 1000); // 30 minutes
  if (cached) return cached;

  try {
    let seriesSlug = slug;
    let html = '';
    let $: cheerio.CheerioAPI | null = null;

    // Check if the slug is an episode slug (e.g. contains '-episode-' or was opened from latest releases)
    const isEpisodeSlug = slug.includes('-episode-') || slug.startsWith('nonton-');
    if (isEpisodeSlug) {
      try {
        const epHtml = await fetchHtml(`${SAMEHADAKU_BASE}/${slug}/`);
        const $ep = cheerio.load(epHtml);
        const parentAnimeHref = $ep('a[href*="/anime/"]').first().attr('href');
        if (parentAnimeHref) {
          seriesSlug = extractSlug(parentAnimeHref);
        }
      } catch {}
    }

    // Fetch the series detail page
    const candidateUrls = [
      `${SAMEHADAKU_BASE}/anime/${seriesSlug}/`,
      `${SAMEHADAKU_BASE}/${slug}/`,
      `${SAMEHADAKU_BASE}/nonton/${slug}/`
    ];

    for (const testUrl of candidateUrls) {
      try {
        const fetched = await fetchHtml(testUrl);
        const $test = cheerio.load(fetched);
        const t = $test('.entry-title, h1').first().text().trim();
        if (t && !t.toLowerCase().includes('page not found') && !t.toLowerCase().includes('404')) {
          html = fetched;
          $ = $test;
          break;
        }
      } catch {}
    }

    if (!$ || !html) {
      return null;
    }

    const rawTitle = $('.entry-title, h1').first().text().trim();
    if (!rawTitle || rawTitle.toLowerCase().includes('page not found') || rawTitle.toLowerCase().includes('404')) {
      return null;
    }

    const title = rawTitle.replace(/Sub\s+Indo/i, '').replace(/Nonton\s+Anime\s+/i, '').trim();
    const rawImg = $('.thumb img').attr('src') || $('.info-content img').attr('src') || $('img.sw-poster-gbr').attr('src') || $('img').first().attr('src') || '';
    const img = normalizeUrl(rawImg, SAMEHADAKU_BASE);
    const synopsis = $('.entry-content p, .desc p, .desc').text().trim() || $('.entry-content').text().trim() || 'Tidak ada sinopsis.';

    const details: string[] = [];
    $('.info-content .spe span, .spe span').each((i, el) => {
      details.push($(el).text().trim());
    });

    const episodes: EpisodeLink[] = [];
    
    // Extract all episodes (Samehadaku uses a[href*="-episode-"], a[href*="/nonton/"], or .episodelist a, .lchx a)
    $('a[href*="-episode-"], a[href*="/nonton/"], .episodelist a, .lchx a').each((i, el) => {
      const epUrl = $(el).attr('href') || '';
      const epText = $(el).text().trim();
      const epSlug = extractSlug(epUrl);
      if (epSlug && !epSlug.includes('/anime/') && !episodes.some(e => e.slug === epSlug)) {
        const epMatch = epText.match(/Episode\s+\d+/i);
        const displayTitle = epMatch ? epMatch[0] : (epText || `Episode`);
        episodes.push({ title: displayTitle, slug: epSlug });
      }
    });

    // If no episodes were found, this is not a valid series page
    if (episodes.length === 0) {
      return null;
    }

    const result: AnimeDetail = { title, slug: seriesSlug, img, synopsis, details, episodes, type: 'anime' };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getSamehadakuDetail for ${slug}:`, err);
    return null;
  }
}

export async function getSamehadakuEpisode(slug: string) {
  const cacheKey = `samehadaku:episode:${slug}`;
  const cached = getFromCache<any>(cacheKey, 120 * 60 * 1000); // 2 hours
  if (cached) return cached;

  try {
    let html = '';
    const candidateUrls = [
      `${SAMEHADAKU_BASE}/${slug}/`,
      `${SAMEHADAKU_BASE}/nonton/${slug}/`
    ];

    for (const testUrl of candidateUrls) {
      try {
        html = await fetchHtml(testUrl);
        if (html && !html.includes('Page not found')) break;
      } catch {}
    }

    if (!html) return null;

    const $ = cheerio.load(html);
    const title = $('.entry-title, h1').first().text().trim();
    const mirrors: any[] = [];

    // 1. Direct Pixeldrain MP4 video streams from download sections (Highest priority: genuine video/mp4, zero ads, HTML5 video compatible)
    const rawMirrors: { quality: string; isMp4: boolean; streamUrl: string }[] = [];
    $('.download-eps, .dl, [class*="download"]').each((i, el) => {
      const sectionHeader = $(el).find('b, strong, span').first().text().trim() || $(el).text().split('\n')[0].trim();
      const isMp4Section = /mp4/i.test(sectionHeader);

      $(el).find('li, p, div').each((j, row) => {
        const rowText = $(row).text().replace(/\s+/g, ' ').trim();
        const pixeldrainLink = $(row).find('a[href*="pixeldrain.com"]').attr('href');

        if (pixeldrainLink) {
          const idMatch = pixeldrainLink.match(/pixeldrain\.com\/u\/([a-zA-Z0-9]+)/);
          if (idMatch) {
            const fileId = idMatch[1];
            let quality = '720p';
            if (/4k/i.test(rowText)) quality = '4K';
            else if (/1080p|fullhd/i.test(rowText)) quality = '1080p';
            else if (/720p|mp4hd/i.test(rowText)) quality = '720p';
            else if (/480p/i.test(rowText)) quality = '480p';
            else if (/360p/i.test(rowText)) quality = '360p';

            rawMirrors.push({
              quality,
              isMp4: isMp4Section,
              streamUrl: `https://pixeldrain.com/api/file/${fileId}`
            });
          }
        }
      });
    });

    // Prefer MP4 sections first so HTML5 video in Chrome/Safari works seamlessly
    const mp4List = rawMirrors.filter(m => m.isMp4);
    const chosenList = mp4List.length > 0 ? mp4List : rawMirrors;

    // Quality sort: 720p > 1080p > 480p > 360p > 4K
    const qualityWeight: Record<string, number> = { '720p': 10, '1080p': 9, '480p': 8, '360p': 7, '4K': 6 };
    chosenList.sort((a, b) => (qualityWeight[b.quality] || 0) - (qualityWeight[a.quality] || 0));

    const seenUrls = new Set<string>();
    for (const item of chosenList) {
      if (!seenUrls.has(item.streamUrl)) {
        seenUrls.add(item.streamUrl);
        const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(item.streamUrl)}`;
        mirrors.push({
          quality: item.quality,
          playerText: `Pixeldrain MP4 (${item.quality})`,
          payload: { src: proxyUrl, directSrc: proxyUrl }
        });
      }
    }

    // 2. Direct iframe player in page (if any)
    const defaultSrc = $('iframe').attr('src') || $('iframe').attr('data-src') || '';
    if (defaultSrc && !defaultSrc.includes('facebook.com')) {
      const normalizedDefault = normalizeUrl(defaultSrc, SAMEHADAKU_BASE);
      mirrors.push({
        quality: 'HD',
        playerText: 'Web Player (Embed)',
        payload: { src: normalizedDefault }
      });
    }

    // 3. Samehadaku .east_player_option elements (ajax mirrors)
    const optionPromises: Promise<void>[] = [];
    $('.east_player_option, #server ul li, .server_option').each((i, el) => {
      const post = $(el).attr('data-post');
      const nume = $(el).attr('data-nume');
      const type = $(el).attr('data-type');
      const text = $(el).find('span').text().trim() || $(el).text().trim();
      
      if (!post || !nume || !type) return;

      optionPromises.push((async () => {
        try {
          const ajaxUrl = `${SAMEHADAKU_BASE}/wp-admin/admin-ajax.php`;
          const res = await fetch(ajaxUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Referer': `${SAMEHADAKU_BASE}/${slug}/`,
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: new URLSearchParams({
              action: 'player_ajax',
              post: post,
              nume: nume,
              type: type
            }).toString(),
            signal: AbortSignal.timeout(5000)
          });

          if (res.ok) {
            const resHtml = await res.text();
            const $iframe = cheerio.load(resHtml);
            let iframeSrc = $iframe('iframe').attr('src') || '';
            if (iframeSrc) {
              iframeSrc = normalizeUrl(iframeSrc, SAMEHADAKU_BASE);
              mirrors.push({
                quality: 'HD',
                playerText: text,
                payload: { src: iframeSrc }
              });
            }
          }
        } catch {}
      })());
    });

    await Promise.all(optionPromises);

    const result = { title, slug, mirrors };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getSamehadakuEpisode for ${slug}:`, err);
    return null;
  }
}

export async function getSamehadakuSearch(query: string): Promise<AnimeCard[]> {
  const cacheKey = `samehadaku:search:${query}`;
  const cached = getFromCache<AnimeCard[]>(cacheKey, 60 * 1000); // 1 minute
  if (cached) return cached;

  try {
    const url = `${SAMEHADAKU_BASE}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    // Match v2 Samehadaku and legacy layouts
    $('article, .animepost, .animpost, a.sw-kartu-tautan').each((i, el) => {
      const a = $(el).is('a') ? $(el) : $(el).find('a').first();
      const href = a.attr('href') || '';
      if (!href || !href.includes('/anime/')) return;

      const title = $(el).find('.sw-kartu-judul').text().trim() ||
                    $(el).find('h2, h3, .title').first().text().trim() ||
                    a.attr('title') ||
                    $(el).attr('title') || '';

      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const ep = $(el).find('.jarvis-eps, .epx, .ep').first().text().trim() || '';
      const slug = extractSlug(href);

      if (title && slug && !results.some(r => r.slug === slug)) {
        results.push({
          title,
          slug,
          url: normalizeUrl(href, SAMEHADAKU_BASE),
          img: normalizeUrl(img, SAMEHADAKU_BASE),
          ep,
          type: 'anime',
          source: 'samehadaku'
        });
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err: any) {
    console.warn("[Samehadaku] getSamehadakuSearch notice:", err?.message || err);
    return [];
  }
}

// ==========================================
// ANIMEXIN SCRAPER (ALTERNATIVE DONGHUA)
// ==========================================

const ANIMEXIN_BASE = 'https://animexin.dev';

export async function getAnimeXinOngoing(): Promise<AnimeCard[]> {
  const now = Date.now();
  if (animexinOngoingCache && (now - animexinOngoingCache.timestamp) < CACHE_TTL_MS) {
    return animexinOngoingCache.data;
  }

  try {
    // Fetch recently updated donghua list
    const html = await fetchHtml(`${ANIMEXIN_BASE}/anime/?status=ongoing&type=&order=update`);
    const $ = cheerio.load(html);
    const ongoing: AnimeCard[] = [];

    // Structure: article.bs > div.bsx > a[href][title] > div.limit > img, div.tt (text + h2)
    $('.listupd article.bs, article.bs').each((i, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href') || '';
      const title = a.attr('title') || '';

      // Get clean title from .tt — it contains text node + h2 child; take text node only
      const ttNode = $(el).find('.tt');
      const cleanTitle = title || ttNode.clone().children().remove().end().text().trim() || ttNode.text().split('\t')[0].trim();

      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const ep = $(el).find('.epx').text().trim();
      const slug = extractSlug(href);

      if (cleanTitle && slug) {
        ongoing.push({
          title: cleanTitle,
          slug,
          url: href,
          img: normalizeUrl(img, ANIMEXIN_BASE),
          ep: ep || 'Ongoing',
          type: 'donghua',
          source: 'animexin'
        });
      }
    });

    if (ongoing.length > 0) {
      animexinOngoingCache = { data: ongoing, timestamp: now };
    }
    return ongoing;
  } catch (err) {
    console.error('Error in getAnimeXinOngoing:', err);
    return animexinOngoingCache ? animexinOngoingCache.data : [];
  }
}

export async function getAnimeXinDetail(slug: string): Promise<AnimeDetail | null> {
  const cacheKey = `animexin:detail:${slug}`;
  const cached = getFromCache<AnimeDetail>(cacheKey, 30 * 60 * 1000); // 30 minutes
  if (cached) return cached;

  try {
    let html = '';
    let $ = cheerio.load('');
    let epCount = 0;

    // Try format 1: /{slug}/ (most common on animexin.dev)
    try {
      const url = `${ANIMEXIN_BASE}/${slug}/`;
      html = await fetchHtml(url);
      $ = cheerio.load(html);
      epCount = $('.eplister ul li').length;
    } catch {}

    // Try format 2: /anime/{slug}/
    if (epCount === 0) {
      try {
        const url = `${ANIMEXIN_BASE}/anime/${slug}/`;
        html = await fetchHtml(url);
        $ = cheerio.load(html);
        epCount = $('.eplister ul li').length;
      } catch {}
    }

    // Animexin detail page: title in h1.entry-title, img in .thumb img, desc in .desc
    const title = $('h1.entry-title, .bigcontent .infox h1').text().trim() || $('h1').first().text().trim();
    const rawImg = $('.thumb img').attr('src') || $('.bigcontent img').attr('src') || '';
    const img = normalizeUrl(rawImg, ANIMEXIN_BASE);
    const synopsis = $('.desc').text().trim() || $('.entry-content p').first().text().trim() || '';

    const details: string[] = [];
    $('.spe span').each((i, el) => {
      details.push($(el).text().trim());
    });

    const episodes: EpisodeLink[] = [];
    $('.eplister ul li').each((i, el) => {
      const epNum = $(el).find('.epl-num').text().trim();
      const epTitle = $(el).find('.epl-title').text().trim() || $(el).find('a').text().trim();
      const epUrl = $(el).find('a').attr('href') || '';
      const epDate = $(el).find('.epl-date').text().trim();

      const epSlug = extractSlug(epUrl);
      const displayTitle = epTitle || (epNum ? `Episode ${epNum}` : '');
      if (displayTitle && epSlug) {
        episodes.push({ title: displayTitle, slug: epSlug, date: epDate });
      }
    });

    const result: AnimeDetail = { title, slug, img, synopsis, details, episodes, type: 'donghua' };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getAnimeXinDetail for ${slug}:`, err);
    return null;
  }
}

export async function getAnimeXinEpisode(slug: string) {
  const cacheKey = `animexin:episode:${slug}`;
  const cached = getFromCache<any>(cacheKey, 120 * 60 * 1000); // 2 hours
  if (cached) return cached;

  try {
    const url = `${ANIMEXIN_BASE}/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('h1.entry-title, h1').first().text().trim();
    const mirrors: any[] = [];

    // AnimeXin uses select.mirror containing base64 encoded iframes
    let defaultSrc = $('iframe').attr('src') || '';
    if (defaultSrc) {
      defaultSrc = normalizeUrl(defaultSrc, ANIMEXIN_BASE);
      const directSrc = await extractDirectVideoSrc(defaultSrc);
      mirrors.push({
        quality: 'HD',
        playerText: 'Default Player',
        payload: { src: defaultSrc, directSrc: directSrc || null }
      });
    }

    const mirrorPromises: Promise<void>[] = [];
    $('select.mirror option').each((i, el) => {
      const val = $(el).attr('value');
      const text = $(el).text().trim();
      if (!val || text.toLowerCase().includes('select')) return;

      mirrorPromises.push((async () => {
        try {
          const decoded = Buffer.from(val, 'base64').toString('utf-8');
          const $iframe = cheerio.load(decoded);
          let iframeSrc = $iframe('iframe').attr('src') || '';
          if (iframeSrc) {
            iframeSrc = normalizeUrl(iframeSrc, ANIMEXIN_BASE);
            if (iframeSrc !== defaultSrc) {
              const directSrc = await extractDirectVideoSrc(iframeSrc);
              mirrors.push({
                quality: 'HD',
                playerText: text,
                payload: { src: iframeSrc, directSrc: directSrc || null }
              });
            }
          }
        } catch {
          // Ignore decoding errors
        }
      })());
    });

    await Promise.all(mirrorPromises);

    const result = { title, slug, mirrors };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getAnimeXinEpisode for ${slug}:`, err);
    return null;
  }
}

export async function getAnimeXinSearch(query: string): Promise<AnimeCard[]> {
  const cacheKey = `animexin:search:${query}`;
  const cached = getFromCache<AnimeCard[]>(cacheKey, 60 * 1000); // 1 minute
  if (cached) return cached;

  try {
    const url = `${ANIMEXIN_BASE}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    // Structure: article.bs > div.bsx > a[href][title] > img, div.tt
    $('article.bs').each((i, el) => {
      const a = $(el).find('a').first();
      const href = a.attr('href') || '';
      const title = a.attr('title') || '';

      // .tt contains text node + h2 — grab the a[title] which is already clean
      const ttNode = $(el).find('.tt');
      const cleanTitle = title || ttNode.clone().children().remove().end().text().trim() || ttNode.text().split('\t')[0].trim();

      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const slug = extractSlug(href);

      if (cleanTitle && slug) {
        results.push({
          title: cleanTitle,
          slug,
          url: href,
          img: normalizeUrl(img, ANIMEXIN_BASE),
          type: 'donghua',
          source: 'animexin'
        });
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Error in getAnimeXinSearch:", err);
    return [];
  }
}

// ==========================================
// DONGHUASTREAM SCRAPER (ALTERNATIVE DONGHUA)
// ==========================================

const DONGHUASTREAM_BASE = 'https://donghuastream.org';

export async function getDonghuastreamDetail(slug: string): Promise<AnimeDetail | null> {
  const cacheKey = `donghuastream:detail:${slug}`;
  const cached = getFromCache<AnimeDetail>(cacheKey, 30 * 60 * 1000); // 30 minutes
  if (cached) return cached;

  try {
    const url = `${DONGHUASTREAM_BASE}/anime/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.info-content h1, .entry-title').text().trim();
    const rawImg = $('.thumb img').attr('data-src') || $('.thumb img').attr('src') || '';
    const img = normalizeUrl(rawImg, DONGHUASTREAM_BASE);
    const synopsis = $('.entry-content p, .sinopse p').text().trim() || $('.entry-content').text().trim();

    const details: string[] = [];
    $('.info-content .spe span, .spe span').each((i, el) => {
      details.push($(el).text().trim());
    });

    const episodes: EpisodeLink[] = [];
    $('.eplister ul li').each((i, el) => {
      const epTitle = $(el).find('.epl-title').text().trim() || $(el).find('a').text().trim();
      const epUrl = $(el).find('a').attr('href') || '';
      const epDate = $(el).find('.epl-date').text().trim();

      const epSlug = extractSlug(epUrl);
      if (epTitle && epSlug) {
        episodes.push({ title: epTitle, slug: epSlug, date: epDate });
      }
    });

    const result: AnimeDetail = { title, slug, img, synopsis, details, episodes, type: 'donghua' };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getDonghuastreamDetail for ${slug}:`, err);
    return null;
  }
}

export async function getDonghuastreamEpisode(slug: string) {
  const cacheKey = `donghuastream:episode:${slug}`;
  const cached = getFromCache<any>(cacheKey, 120 * 60 * 1000); // 2 hours
  if (cached) return cached;

  try {
    const url = `${DONGHUASTREAM_BASE}/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.entry-title, h1').text().trim();
    const mirrors: any[] = [];

    // 1. Extract default lazyloaded player iframe
    let defaultSrc = $('iframe').attr('data-litespeed-src') || $('iframe').attr('data-src') || $('iframe').attr('src') || '';
    if (defaultSrc && defaultSrc !== 'about:blank') {
      defaultSrc = normalizeUrl(defaultSrc, DONGHUASTREAM_BASE);
      const directSrc = await extractDirectVideoSrc(defaultSrc);
      mirrors.push({
        quality: 'HD',
        playerText: 'Default Player',
        payload: { src: defaultSrc, directSrc: directSrc || null }
      });
    }

    // 2. Extract options from select.mirror
    const mirrorPromises: Promise<void>[] = [];
    $('select.mirror option').each((i, el) => {
      const val = $(el).attr('value');
      const text = $(el).text().trim();
      if (!val || text.toLowerCase().includes('select video server')) return;

      mirrorPromises.push((async () => {
        try {
          const decoded = Buffer.from(val, 'base64').toString('utf-8');
          const $iframe = cheerio.load(decoded);
          let iframeSrc = $iframe('iframe').attr('data-litespeed-src') || $iframe('iframe').attr('data-src') || $iframe('iframe').attr('src') || '';
          if (iframeSrc) {
            iframeSrc = normalizeUrl(iframeSrc, DONGHUASTREAM_BASE);
            if (iframeSrc !== defaultSrc) {
              const directSrc = await extractDirectVideoSrc(iframeSrc);
              mirrors.push({
                quality: 'HD',
                playerText: text,
                payload: { src: iframeSrc, directSrc: directSrc || null }
              });
            }
          }
        } catch {
          // Ignore decoding errors
        }
      })());
    });

    await Promise.all(mirrorPromises);

    const result = { title, slug, mirrors };
    setInCache(cacheKey, result);
    return result;
  } catch (err) {
    console.error(`Error in getDonghuastreamEpisode for ${slug}:`, err);
    return null;
  }
}

export async function getDonghuastreamSearch(query: string): Promise<AnimeCard[]> {
  const cacheKey = `donghuastream:search:${query}`;
  const cached = getFromCache<AnimeCard[]>(cacheKey, 60 * 1000); // 1 minute
  if (cached) return cached;

  try {
    const url = `${DONGHUASTREAM_BASE}/?s=${encodeURIComponent(query)}`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);
    const results: AnimeCard[] = [];

    $('.listupd .bs, .bs').each((i, el) => {
      const ttNode = $(el).find('.tt');
      const fullTitle = ttNode.clone().children().remove().end().text().trim();
      const cleanTitle = fullTitle || $(el).find('h4, .title').text().split('\t')[0].trim();
      
      const url = $(el).find('a').attr('href');
      const img = $(el).find('img').attr('data-src') || $(el).find('img').attr('src') || '';
      const slug = extractSlug(url);

      if (cleanTitle && slug) {
        results.push({
          title: cleanTitle,
          slug,
          url: normalizeUrl(url, DONGHUASTREAM_BASE),
          img: normalizeUrl(img, DONGHUASTREAM_BASE),
          type: 'donghua',
          source: 'donghuastream'
        });
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Error in getDonghuastreamSearch:", err);
    return [];
  }
}


