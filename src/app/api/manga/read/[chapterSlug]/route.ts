import { NextRequest, NextResponse } from 'next/server';
import { getChapterData } from '@/lib/manga-scraper';

export const revalidate = 600;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chapterSlug: string }> }
) {
  try {
    const { chapterSlug } = await params;
    if (!chapterSlug) {
      return NextResponse.json({ success: false, error: 'Chapter slug is required' }, { status: 400 });
    }

    const chapter = await getChapterData(chapterSlug);
    if (!chapter) {
      return NextResponse.json({ success: false, error: 'Chapter data not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: chapter });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
