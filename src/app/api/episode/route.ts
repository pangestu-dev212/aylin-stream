import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuEpisode, getAnichinEpisode, getJuraganfilmEpisode, getSamehadakuEpisode, getAnimeXinEpisode, getDonghuastreamEpisode, resolveOtakudesuMirror } from '@/lib/stream-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'anime';
    const slug = searchParams.get('slug') || '';
    const source = searchParams.get('source') || '';
    
    // Check if we are resolving a specific Otakudesu mirror
    const id = searchParams.get('id');
    const i = searchParams.get('i');
    const q = searchParams.get('q');

    if (!slug) {
      return NextResponse.json({ success: false, error: 'Missing slug parameter' }, { status: 400 });
    }

    if (type === 'anime' && id && i && q) {
      const src = await resolveOtakudesuMirror(parseInt(id), parseInt(i), q);
      if (!src) {
        return NextResponse.json({ success: false, error: 'Failed to resolve mirror link' }, { status: 500 });
      }
      return NextResponse.json({ success: true, src });
    }

    let data = null;
    if (source === 'samehadaku') {
      data = await getSamehadakuEpisode(slug);
    } else if (source === 'animexin') {
      data = await getAnimeXinEpisode(slug);
    } else if (source === 'donghuastream') {
      data = await getDonghuastreamEpisode(slug);
    } else if (type === 'drama') {
      data = await getJuraganfilmEpisode(slug);
    } else if (type === 'donghua') {
      data = await getAnichinEpisode(slug);
    } else {
      data = await getOtakudesuEpisode(slug);
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'Episode not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
