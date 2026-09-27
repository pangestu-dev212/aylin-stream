import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getChapterData } from '@/lib/manga-scraper';
import MangaReaderClient from './MangaReaderClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ chapterSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { chapterSlug } = await params;
  const chapter = await getChapterData(chapterSlug);
  if (!chapter) {
    return { title: 'Chapter Tidak Ditemukan - Aylin Stream' };
  }

  return {
    title: `${chapter.title} - Baca Online Bahasa Indonesia | Aylin Stream`,
    description: `Baca ${chapter.title} dari ${chapter.mangaTitle} bahasa Indonesia lengkap gambar resolusi tinggi di Aylin Stream.`,
  };
}

export default async function MangaReaderPage({ params }: Props) {
  const { chapterSlug } = await params;
  const chapter = await getChapterData(chapterSlug);

  if (!chapter) {
    notFound();
  }

  return <MangaReaderClient chapter={chapter} />;
}
