import { NextRequest, NextResponse } from 'next/server';
import { getOtakudesuOngoing, getAnichinOngoing, getJuraganfilmOngoing, getAnimeXinOngoing } from '@/lib/stream-scraper';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'anime';

    let results = [];
    if (type === 'donghua') {
      results = await getAnichinOngoing().catch(() => []);
    } else if (type === 'animexin') {
      // AnimeXin as alternative donghua source
      results = await getAnimeXinOngoing().catch(() => []);
    } else if (type === 'drama') {
      const rawDrama = await getJuraganfilmOngoing().catch(() => []);
      results = rawDrama.map(item => ({ ...item, type: 'drama' as const }));
    } else {
      results = await getOtakudesuOngoing().catch(() => []);
    }

    // Return the top 8 popular/ongoing items for recommendations
    return NextResponse.json({ success: true, results: results.slice(0, 8) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
