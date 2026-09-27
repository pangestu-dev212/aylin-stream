import { NextRequest, NextResponse } from 'next/server';
import { getMangaDetail } from '@/lib/manga-scraper';
import { isContentSafe } from '@/lib/content-filter';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    if (!slug) {
      return NextResponse.json({ success: false, error: 'Slug is required' }, { status: 400 });
    }

    const detail = await getMangaDetail(slug);
    if (!detail || !isContentSafe(detail)) {
      return NextResponse.json({ success: false, error: 'Manga not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: detail });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
