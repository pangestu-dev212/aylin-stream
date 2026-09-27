import { NextRequest, NextResponse } from 'next/server';
import { getShortDramaDetail } from '@/lib/shortdrama-scraper';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Extract bookId from slug if passed as slug format e.g. "42000028273-title"
    const bookId = id.split('-')[0];

    const detail = await getShortDramaDetail(bookId);
    if (!detail) {
      return NextResponse.json({ success: false, error: 'Short drama not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: detail });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
