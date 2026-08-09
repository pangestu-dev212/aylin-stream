import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuDetail, getAnichinDetail, getSamehadakuDetail, getAnimeXinDetail, getDonghuastreamDetail } from '@/lib/stream-scraper';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'anime';
    const source = searchParams.get('source') || '';

    let data = null;

    if (source === 'samehadaku') {
      data = await getSamehadakuDetail(slug);
    } else if (source === 'animexin') {
      data = await getAnimeXinDetail(slug);
    } else if (source === 'donghuastream') {
      data = await getDonghuastreamDetail(slug);
    } else if (type === 'donghua') {
      data = await getAnichinDetail(slug);
    } else {
      data = await getOtakudesuDetail(slug);
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
