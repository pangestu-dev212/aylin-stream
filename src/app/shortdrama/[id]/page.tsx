import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getShortDramaDetail } from '@/lib/shortdrama-scraper';
import ShortDramaPlayerClient from './ShortDramaPlayerClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const bookId = id.split('-')[0];
  const detail = await getShortDramaDetail(bookId);

  if (!detail) {
    return { title: 'Drama Tidak Ditemukan - Aylin Stream' };
  }

  return {
    title: `${detail.title} (Drama Pendek 9:16) Sub Indo - Aylin Stream`,
    description: detail.synopsis ? detail.synopsis.slice(0, 160) : `Nonton ${detail.title} episode lengkap drama pendek format tegak 9:16 di Aylin Stream.`,
    openGraph: {
      title: `${detail.title} - Drama Pendek 9:16`,
      description: detail.synopsis?.slice(0, 160),
      images: detail.cover ? [detail.cover] : [],
    },
  };
}

export default async function ShortDramaDetailPage({ params }: Props) {
  const { id } = await params;
  const bookId = id.split('-')[0];
  const detail = await getShortDramaDetail(bookId);

  if (!detail) {
    notFound();
  }

  return <ShortDramaPlayerClient detail={detail} />;
}
