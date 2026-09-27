import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

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

  // Forward range header if present from browser HTML5 video
  const rangeHeader = req.headers.get('range');
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity',
  };

  if (rangeHeader) {
    headers['Range'] = rangeHeader;
  }

  if (parsedTarget.hostname.includes('pixeldrain.com')) {
    headers['Referer'] = 'https://pixeldrain.com/';
    headers['Origin'] = 'https://pixeldrain.com';
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000),
    });

    if (!upstreamRes.ok && upstreamRes.status !== 206) {
      return new NextResponse(`Upstream error: HTTP ${upstreamRes.status}`, {
        status: upstreamRes.status,
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Range, Accept, Content-Type');
    responseHeaders.set('Accept-Ranges', 'bytes');

    const passHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'content-disposition',
      'cache-control',
      'last-modified',
      'etag'
    ];

    for (const h of passHeaders) {
      const val = upstreamRes.headers.get(h);
      if (val) {
        responseHeaders.set(h, val);
      }
    }

    if (!responseHeaders.has('content-type')) {
      responseHeaders.set('content-type', 'video/mp4');
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('[video-proxy] Stream error:', targetUrl, err);
    return new NextResponse(`Streaming error: ${err.message}`, { status: 502 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Accept, Content-Type',
    }
  });
}
