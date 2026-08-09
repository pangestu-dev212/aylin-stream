import * as https from 'https';
import * as cheerio from 'cheerio';

// Ignore TLS errors for grey-market streaming sites (expired certs)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const OTAKUDESU_BASE = 'https://otakudesu.blog';
const ANICHIN_BASE = 'https://anichin.moe';
const JURAGANFILM_BASE = 'https://tv48.juragan.film'; // Active redirect domain

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

// Helper to resolve domain via Cloudflare DoH to bypass ISP block
async function resolveDns(domain: string): Promise<string | null> {
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { 'accept': 'application/dns-json' }
    });
    const data = await res.json();
    if (data.Answer && data.Answer.length > 0) {
      const aRecord = data.Answer.find((r: any) => r.type === 1);
      if (aRecord) return String(aRecord.data);
    }
  } catch {
    // Fail silently
  }
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      agent: agent
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', async () => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location || '';
          const absoluteUrl = redirectUrl.startsWith('http') ? redirectUrl : `https://${domain}${redirectUrl}`;
          
          // Check if redirect points back to the homepage (WordPress soft-404)
          try {
            const redirectParsed = new URL(absoluteUrl);
            if (redirectParsed.pathname === '/' && parsedUrl.pathname !== '/') {
              reject(new Error(`Redirected to homepage: ${urlStr} -> ${absoluteUrl}`));
              return;
            }
          } catch {}

          try {
            resolve(await fetchWithDoh(absoluteUrl, followCount + 1));
          } catch (err) {
            reject(err);
          }
        } else {
          resolve(body);
        }
      });
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
async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
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
      console.log(`[ISP BLOCK] Block detected for ${url}. Bypassing using DNS-over-HTTPS...`);
      return await fetchWithDoh(url);
    }
    
    return html;
  } catch (err) {
    console.log(`[FETCH ERROR] Native fetch failed for ${url}. Falling back to DoH bypass...`);
    try {
      return await fetchWithDoh(url);
    } catch (dohErr) {
      throw err; // throw original fetch error if DoH also fails
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
  type: 'anime' | 'donghua' | 'drama';
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
// JIKAN API (MyAnimeList) - Global Fallback
// Always accessible from any server worldwide
// ==========================================

export async function getJikanOngoingAnime(): Promise<AnimeCard[]> {
  const now = Date.now();
  if (jikanOngoingCache && (now - jikanOngoingCache.timestamp) < CACHE_TTL_MS) {
    return jikanOngoingCache.data;
  }

  try {
    // Fetch current season anime from Jikan API (free, no auth needed)
    const res = await fetch('https://api.jikan.moe/v4/seasons/now?filter=tv&limit=25', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 300 }
    });

    if (!res.ok) throw new Error(`Jikan API error: ${res.status}`);

    const json = await res.json();
    const data = json.data || [];

    const animeList: AnimeCard[] = data
      .filter((a: any) => a.status === 'Currently Airing' || a.airing === true)
      .map((a: any) => {
        const slug = a.title_english
          ? a.title_english.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
          : a.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

        return {
          title: a.title_english || a.title,
          slug: `jikan-${a.mal_id}-${slug}`,
          url: a.url || `https://myanimelist.net/anime/${a.mal_id}`,
          img: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || '',
          ep: `Ep ${a.episodes || '?'}`,
          type: 'anime' as const,
          status: a.status === 'Currently Airing' ? 'Ongoing' : 'Completed',
        };
      });

    if (animeList.length > 0) {
      jikanOngoingCache = { data: animeList, timestamp: now };
    }
    return animeList;
  } catch (err) {
    console.error('Error in getJikanOngoingAnime:', err);
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
        ongoing.push({ title, slug, url: url || '', img, ep, day, type: 'anime' });
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
  } catch (err) {
    console.error(`Error in getOtakudesuDetail for ${slug}:`, err);
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

    const result = { title, slug, mirrors };
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
        results.push({ title, slug, url: url || '', img, type: 'anime' });
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
          type: 'donghua'
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
          type: 'donghua'
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
            type: 'donghua' // will be mapped dynamically or treated generically as 'drama' in frontend
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
    // Determine whether to request under /film-seri/ or /film/
    // Default to /film-seri/ first
    let url = `${JURAGANFILM_BASE}/film-seri/${slug}/`;
    let html = '';
    // Try format 1: /film-seri/slug/
    try {
      html = await fetchHtml(`${JURAGANFILM_BASE}/film-seri/${slug}/`);
    } catch {
      // Try format 2: /film/slug/
      try {
        html = await fetchHtml(`${JURAGANFILM_BASE}/film/${slug}/`);
      } catch {
        // Try format 3: raw /slug/ path (direct root post)
        html = await fetchHtml(`${JURAGANFILM_BASE}/${slug}/`);
      }
    }

    const $ = cheerio.load(html);

    const fullTitle = $('.entry-title').text().trim();
    const title = fullTitle.replace(/^Nonton\s+(Film\s+)?/i, '').trim();
    
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
        const parsedUrl = new URL(epUrl);
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        const pageNum = pathSegments[pathSegments.length - 1]; // "2", "3", etc.
        
        if (pageNum && !isNaN(Number(pageNum))) {
          episodes.push({
            title: `Episode ${pageNum}`,
            slug: `${slug}/${pageNum}` // relative format
          });
        }
      });
    } else {
      // If no episodes pagination list, this is a standalone Movie (1 part)
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

    let html = '';
    // Try format 1: /film-seri/slug/page/
    try {
      html = await fetchHtml(`${JURAGANFILM_BASE}/film-seri/${mainSlug}/${pageNum ? `${pageNum}/` : ''}`);
    } catch {
      // Try format 2: /film/slug/page/
      try {
        html = await fetchHtml(`${JURAGANFILM_BASE}/film/${mainSlug}/${pageNum ? `${pageNum}/` : ''}`);
      } catch {
        // Try format 3: raw /slug/page/
        html = await fetchHtml(`${JURAGANFILM_BASE}/${mainSlug}/${pageNum ? `${pageNum}/` : ''}`);
      }
    }

    const $ = cheerio.load(html);
    const title = $('.entry-title').text().trim();

    // Extract player iframe
    const playerSrc = $('iframe').attr('src') || '';

    const mirrors = playerSrc ? [{
      quality: 'HD',
      playerText: 'Default Server',
      payload: { src: playerSrc }
    }] : [];

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
          type: 'donghua' // will resolve as 'drama' on search client mapping
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
    const html = await fetchHtml(`${SAMEHADAKU_BASE}/ongoing-anime/`);
    const $ = cheerio.load(html);
    const ongoing: AnimeCard[] = [];

    // Samehadaku uses .animepost or .bs .bsx structure
    $('.animepost, .bs .bsx, .listupd .bs').each((i, el) => {
      const title = $(el).find('.tt, .ntitle, h4, h3').first().text().trim();
      const href = $(el).find('a').first().attr('href') || '';
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';
      const ep = $(el).find('.epx, .ep').text().trim();
      const slug = extractSlug(href);

      if (title && slug) {
        ongoing.push({ title, slug, url: href, img: normalizeUrl(img, SAMEHADAKU_BASE), ep, type: 'anime' });
      }
    });

    if (ongoing.length > 0) {
      samehadakuOngoingCache = { data: ongoing, timestamp: now };
      return ongoing;
    }

    // Fallback: try homepage
    const homeHtml = await fetchHtml(`${SAMEHADAKU_BASE}/`);
    const $home = cheerio.load(homeHtml);
    const homeList: AnimeCard[] = [];

    $home('.animepost, .bs .bsx, .listupd .bs, .releases .rl-left .data').each((i, el) => {
      const title = $home(el).find('.tt, .ntitle, h4, h3').first().text().trim();
      const href = $home(el).find('a').first().attr('href') || '';
      const img = $home(el).find('img').attr('src') || $home(el).find('img').attr('data-src') || '';
      const ep = $home(el).find('.epx, .ep').text().trim();
      const slug = extractSlug(href);

      if (title && slug) {
        homeList.push({ title, slug, url: href, img: normalizeUrl(img, SAMEHADAKU_BASE), ep, type: 'anime' });
      }
    });

    if (homeList.length > 0) {
      samehadakuOngoingCache = { data: homeList, timestamp: now };
    }
    return homeList;
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
    const url = `${SAMEHADAKU_BASE}/anime/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.entry-title').text().replace(/Sub\s+Indo/i, '').replace(/Nonton\s+Anime\s+/i, '').trim();
    const rawImg = $('.thumb img').attr('src') || $('.info-content img').attr('src') || '';
    const img = normalizeUrl(rawImg, SAMEHADAKU_BASE);
    const synopsis = $('.entry-content p, .desc p').text().trim() || $('.entry-content, .desc').text().trim();

    const details: string[] = [];
    $('.info-content .spe span, .spe span').each((i, el) => {
      details.push($(el).text().trim());
    });

    const episodes: EpisodeLink[] = [];
    
    // Format A: listeps (for multi-episode Series)
    if ($('.listeps ul li').length > 0) {
      $('.listeps ul li').each((i, el) => {
        const epTitle = $(el).find('.epsleft .lchx a').text().trim();
        const epUrl = $(el).find('.epsleft .lchx a').attr('href') || '';
        const epDate = $(el).find('.epsleft .date').text().trim();
        const epSlug = extractSlug(epUrl);
        if (epTitle && epSlug) {
          episodes.push({ title: epTitle, slug: epSlug, date: epDate });
        }
      });
    } 
    // Format B: eplister (for Special/Movies or standard list)
    else if ($('.eplister ul li').length > 0) {
      $('.eplister ul li').each((i, el) => {
        const epTitle = $(el).find('.epl-title').text().trim() || $(el).find('a').text().trim();
        const epUrl = $(el).find('a').attr('href') || '';
        const epDate = $(el).find('.epl-date').text().trim();
        const epSlug = extractSlug(epUrl);
        if (epTitle && epSlug) {
          episodes.push({ title: epTitle, slug: epSlug, date: epDate });
        }
      });
    }

    const result: AnimeDetail = { title, slug, img, synopsis, details, episodes, type: 'anime' };
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
    const url = `${SAMEHADAKU_BASE}/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.entry-title, h1').text().trim();
    const mirrors: any[] = [];

    // Samehadaku uses .east_player_option elements
    const optionPromises: Promise<void>[] = [];
    $('.east_player_option').each((i, el) => {
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
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': url,
              'X-Requested-With': 'XMLHttpRequest'
            },
            body: new URLSearchParams({
              action: 'player_ajax',
              post: post,
              nume: nume,
              type: type
            }).toString()
          });

          if (res.ok) {
            const resHtml = await res.text();
            const $iframe = cheerio.load(resHtml);
            let iframeSrc = $iframe('iframe').attr('src') || '';
            if (iframeSrc) {
              iframeSrc = normalizeUrl(iframeSrc, SAMEHADAKU_BASE);
              const directSrc = await extractDirectVideoSrc(iframeSrc);
              mirrors.push({
                quality: 'HD',
                playerText: text,
                payload: { src: iframeSrc, directSrc: directSrc || null }
              });
            }
          }
        } catch (e) {
          // Ignore mirror errors
        }
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

    $('.animpost, .animepost').each((i, el) => {
      const title = $(el).find('.animposx .data .title h2').text().trim() || $(el).find('.animposx a').attr('title') || '';
      const url = $(el).find('.animposx a').attr('href') || '';
      const img = $(el).find('.animposx img').attr('src') || '';
      const ep = $(el).find('.animposx .type').first().text().trim() || '';
      const slug = extractSlug(url);

      if (title && slug) {
        results.push({
          title,
          slug,
          url: normalizeUrl(url, SAMEHADAKU_BASE),
          img: normalizeUrl(img, SAMEHADAKU_BASE),
          ep,
          type: 'anime'
        });
      }
    });

    setInCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Error in getSamehadakuSearch:", err);
    return [];
  }
}

// ==========================================
// ANIMEXIN SCRAPER (ALTERNATIVE DONGHUA)
// ==========================================

const ANIMEXIN_BASE = 'https://animexin.dev';

export async function getAnimeXinDetail(slug: string): Promise<AnimeDetail | null> {
  const cacheKey = `animexin:detail:${slug}`;
  const cached = getFromCache<AnimeDetail>(cacheKey, 30 * 60 * 1000); // 30 minutes
  if (cached) return cached;

  try {
    const url = `${ANIMEXIN_BASE}/${slug}/`;
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const title = $('.info-content h1, .entry-title').text().trim();
    const rawImg = $('.thumb img').attr('src') || $('.info-content img').attr('src') || '';
    const img = normalizeUrl(rawImg, ANIMEXIN_BASE);
    const synopsis = $('.entry-content p, .sinopse p').text().trim() || $('.entry-content, .desc').text().trim();

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

    const title = $('.entry-title, h1').text().trim();
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
      if (!val) return;

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

    $('.listupd .bs, .bs').each((i, el) => {
      const fullTitle = $(el).find('h4, .tt, .title').text().trim();
      const url = $(el).find('a').attr('href');
      const img = $(el).find('img').attr('src') || $(el).find('img').attr('data-src') || '';

      const cleanTitle = fullTitle.split('\t')[0].trim();
      const slug = extractSlug(url);

      if (cleanTitle && slug) {
        results.push({
          title: cleanTitle,
          slug,
          url: normalizeUrl(url, ANIMEXIN_BASE),
          img: normalizeUrl(img, ANIMEXIN_BASE),
          type: 'donghua'
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
          type: 'donghua'
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


