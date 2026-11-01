import { NextRequest, NextResponse } from 'next/server';
import * as https from 'https';

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

async function fetchImageWithDoh(urlStr: string): Promise<{ buffer: Buffer; contentType: string }> {
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
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'image/jpeg';
        resolve({ buffer, contentType });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

interface CachedImage {
  buffer: Buffer;
  contentType: string;
  timestamp: number;
}
const imageMemoryCache = new Map<string, CachedImage>();
const MAX_IMAGE_CACHE_ENTRIES = 300;
const IMAGE_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours memory cache

function getCachedImage(url: string): CachedImage | null {
  const item = imageMemoryCache.get(url);
  if (!item) return null;
  if (Date.now() - item.timestamp > IMAGE_CACHE_TTL_MS) {
    imageMemoryCache.delete(url);
    return null;
  }
  return item;
}

function setCachedImage(url: string, buffer: Buffer, contentType: string) {
  if (imageMemoryCache.size >= MAX_IMAGE_CACHE_ENTRIES) {
    const oldestKey = imageMemoryCache.keys().next().value;
    if (oldestKey) imageMemoryCache.delete(oldestKey);
  }
  imageMemoryCache.set(url, { buffer, contentType, timestamp: Date.now() });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return new NextResponse('Missing url parameter', { status: 400 });
    }

    // 0. Check in-memory image cache (sub-millisecond instant response)
    const memCached = getCachedImage(imageUrl);
    if (memCached) {
      return new NextResponse(new Uint8Array(memCached.buffer), {
        headers: {
          'Content-Type': memCached.contentType,
          'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
          'X-Image-Cache': 'HIT',
        },
      });
    }

    // 1. Try fast direct fetch first (works for 90%+ unblocked CDNs)
    try {
      const directRes = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': new URL(imageUrl).origin + '/',
        },
        signal: AbortSignal.timeout(4000)
      });
      if (directRes.ok) {
        const arrayBuf = await directRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        const contentType = directRes.headers.get('content-type') || 'image/jpeg';
        setCachedImage(imageUrl, buffer, contentType);

        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
            'X-Image-Cache': 'MISS',
          },
        });
      }
    } catch {}

    // 2. Fallback to server-side DoH resolution
    const { buffer, contentType } = await fetchImageWithDoh(imageUrl);
    setCachedImage(imageUrl, buffer, contentType);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400',
        'X-Image-Cache': 'DOH-MISS',
      },
    });
  } catch (err) {
    console.error('Image proxy failed:', err);
    // Return empty 1x1 transparent PNG fallback if anything goes wrong
    const fallbackPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
    return new NextResponse(new Uint8Array(fallbackPng), {
      headers: { 'Content-Type': 'image/png' },
    });
  }
}
