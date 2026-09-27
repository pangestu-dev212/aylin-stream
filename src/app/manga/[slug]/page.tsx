import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMangaDetail } from '@/lib/manga-scraper';
import MangaDetailClient from './MangaDetailClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getMangaDetail(slug);
  if (!detail) {
    return { title: 'Komik Tidak Ditemukan - Aylin Stream' };
  }

  return {
    title: `Baca Komik ${detail.title} Bahasa Indonesia - Aylin Stream`,
    description: detail.synopsis ? detail.synopsis.slice(0, 160) : `Baca manga / komik ${detail.title} bahasa Indonesia terbaru di Aylin Stream.`,
    openGraph: {
      title: `${detail.title} - Baca Manga & Komik Online`,
      description: detail.synopsis?.slice(0, 160),
      images: detail.img ? [detail.img] : [],
    },
  };
}

export default async function MangaDetailPage({ params }: Props) {
  const { slug } = await params;
  const detail = await getMangaDetail(slug);

  if (!detail) {
    notFound();
  }

  return <MangaDetailClient detail={detail} />;
}
