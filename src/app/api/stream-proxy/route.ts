import { NextRequest, NextResponse } from 'next/server';
import * as https from 'https';
import * as http from 'http';

// Ignore TLS errors for streaming sites with self-signed/expired certs
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

/**
 * Resolve domain to IP via Cloudflare DNS-over-HTTPS
 */
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
  } catch { /* silent */ }
  return null;
}

/**
 * Fetch a URL server-side with custom headers and optional DoH fallback.
 */
async function fetchWithDoh(
  urlStr: string,
  refererOrigin: string
): Promise<{ buffer: Buffer; contentType: string; status: number }> {
  const parsedUrl = new URL(urlStr);
  const domain = parsedUrl.hostname;

  const requestHeaders: Record<string, string> = {
    'Host': domain,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Referer': `${refererOrigin}/`,
    'Origin': refererOrigin,
  };

  const makeRequest = (hostname: string): Promise<{ buffer: Buffer; contentType: string; status: number }> => {
    return new Promise((resolve, reject) => {
      const isHttps = parsedUrl.protocol === 'https:';
      const lib = isHttps ? https : http;
      const agent = isHttps ? new https.Agent({ servername: domain, rejectUnauthorized: false }) : undefined;
      const port = Number(parsedUrl.port || (isHttps ? 443 : 80));

      const options: any = {
        hostname,
        port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: requestHeaders,
      };
      if (agent) options.agent = agent;

      const req = lib.request(options, (res: any) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || 'text/html; charset=utf-8';
          resolve({ buffer, contentType, status: res.statusCode || 200 });
        });
      });

      req.on('error', reject);
      req.end();
    });
  };

  // Try direct first
  try {
    return await makeRequest(domain);
  } catch {
    // Fallback to DoH
    const ip = await resolveDns(domain);
    if (!ip) throw new Error(`Cannot resolve domain: ${domain}`);
    return await makeRequest(ip);
  }
}

/**
 * Rewrite proxied HTML:
 * 1. Inject <base href> so relative URLs resolve to original domain
 * 2. Inject a script that overrides document.referrer to trick anti-embed checks
 * 3. Rewrites nested iframe src pointing to target domains to also go through this proxy
 */
function rewriteHtml(html: string, originalUrl: string, refererOrigin: string): string {
  const parsed = new URL(originalUrl);
  const origin = parsed.origin;
  const baseHref = origin + '/';

  let refererDomain = 'anichin.moe';
  try {
    refererDomain = new URL(refererOrigin).hostname;
  } catch {}

  const spoofScript = `<script>
(function() {
  try {
    Object.defineProperty(document, 'referrer', {
      get: function() { return ${JSON.stringify(refererOrigin)}; },
      configurable: true
    });
  } catch(e) {}
  try {
    Object.defineProperty(document, 'domain', {
      get: function() { return ${JSON.stringify(refererDomain)}; },
      configurable: true
    });
  } catch(e) {}
})();
</script>`;

  // Remove any existing <base> tags first
  let rewritten = html.replace(/<base[^>]*>/gi, '');

  // Inject base + spoof into <head>
  if (/<head[^>]*>/i.test(rewritten)) {
    rewritten = rewritten.replace(/(<head[^>]*>)/i, `$1\n<base href="${baseHref}">\n${spoofScript}`);
  } else if (/<html[^>]*>/i.test(rewritten)) {
    rewritten = rewritten.replace(/(<html[^>]*>)/i, `$1\n<head><base href="${baseHref}">\n${spoofScript}\n</head>`);
  } else {
    rewritten = `<base href="${baseHref}">\n${spoofScript}\n` + rewritten;
  }

  // Rewrite nested iframe sources to route through this proxy
  rewritten = rewritten.replace(/(<iframe[^>]+src=["'])([^"']+)["']/gi, (match, prefix, iframeSrc) => {
    if (iframeSrc.includes('/api/stream-proxy')) return match;

    // Resolve relative URL to absolute
    let absoluteIframeSrc = iframeSrc;
    if (iframeSrc.startsWith('//')) {
      absoluteIframeSrc = 'https:' + iframeSrc;
    } else if (iframeSrc.startsWith('/')) {
      absoluteIframeSrc = origin + iframeSrc;
    } else if (!iframeSrc.startsWith('http://') && !iframeSrc.startsWith('https://')) {
      absoluteIframeSrc = origin + '/' + iframeSrc;
    }

    try {
      const iframeUrl = new URL(absoluteIframeSrc);
      const host = iframeUrl.hostname;
      
      const matchDomains = ['anichin', 'animexin', 'samehadaku', 'otakudesu', 'gdriveplayer', 'juragan'];
      if (matchDomains.some(d => host.includes(d))) {
        return `${prefix}/api/stream-proxy?url=${encodeURIComponent(absoluteIframeSrc)}&referer=${encodeURIComponent(refererOrigin)}"`;
      }
    } catch {}

    return match;
  });

  return rewritten;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');
  const customReferer = searchParams.get('referer');

  if (!targetUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedTarget.protocol)) {
      return new NextResponse('Invalid URL protocol', { status: 400 });
    }
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  // Spoof Referer/Origin context based on target domain or custom query
  let refererOrigin = customReferer || parsedTarget.origin;
  if (!customReferer) {
    if (parsedTarget.hostname.includes('anichin') || parsedTarget.hostname.includes('anichin-player')) {
      refererOrigin = 'https://anichin.moe';
    } else if (parsedTarget.hostname.includes('animexin')) {
      refererOrigin = 'https://animexin.dev';
    } else if (parsedTarget.hostname.includes('samehadaku')) {
      refererOrigin = 'https://v2.samehadaku.how';
    } else if (parsedTarget.hostname.includes('otakudesu')) {
      refererOrigin = 'https://otakudesu.cloud';
    }
  }

  try {
    const { buffer, contentType, status } = await fetchWithDoh(targetUrl, refererOrigin);

    const isHtml = contentType.includes('text/html');

    if (isHtml) {
      const html = buffer.toString('utf-8');
      const rewritten = rewriteHtml(html, targetUrl, refererOrigin);
      return new NextResponse(rewritten, {
        status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache',
        },
      });
    }

    // Binary passthrough (JS, CSS, images, etc.)
    return new NextResponse(new Uint8Array(buffer), {
      status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache',
      },
    });

  } catch (err) {
    console.error('[stream-proxy] Error:', targetUrl, err);
    return new NextResponse(
      `<html><body style="background:#0a0714;color:#f43f5e;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:8px">
        <div style="font-size:32px">⚠️</div>
        <div style="font-weight:bold">Gagal memuat stream</div>
        <div style="font-size:11px;color:#64748b">Coba ganti ke server mirror lain</div>
      </body></html>`,
      { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
