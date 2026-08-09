import { Metadata } from 'next';
import { 
  getOtakudesuDetail, 
  getAnichinDetail, 
  getJuraganfilmDetail,
  getAnimeXinDetail,
  getSamehadakuDetail,
  getDonghuastreamDetail
} from '@/lib/stream-scraper';
import WatchClient from './WatchClient';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const revalidate = 0;

interface PageProps {
  params: Promise<{
    type: string;
    slug: string;
  }>;
  searchParams: Promise<{
    source?: string;
  }>;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { type, slug } = await params;
  const { source } = await searchParams;

  const data = source === 'animexin'
    ? await getAnimeXinDetail(slug)
    : source === 'samehadaku'
      ? await getSamehadakuDetail(slug)
      : source === 'donghuastream'
        ? await getDonghuastreamDetail(slug)
        : type === 'drama'
          ? await getJuraganfilmDetail(slug)
          : type === 'donghua' 
            ? await getAnichinDetail(slug) 
            : await getOtakudesuDetail(slug);
     
  return {
    title: data ? `Nonton ${data.title} Subtitle Indonesia - Aylin Stream` : 'Nonton Anime & Donghua - Aylin Stream',
    description: data ? data.synopsis.substring(0, 160) : 'Streaming gratis sub Indo.',
  };
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const { type, slug } = await params;
  const { source } = await searchParams;
  
  // Fetch details based on type or source override
  const data = source === 'animexin'
    ? await getAnimeXinDetail(slug)
    : source === 'samehadaku'
      ? await getSamehadakuDetail(slug)
      : source === 'donghuastream'
        ? await getDonghuastreamDetail(slug)
        : type === 'drama'
          ? await getJuraganfilmDetail(slug)
          : type === 'donghua' 
            ? await getAnichinDetail(slug) 
            : await getOtakudesuDetail(slug);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <h2 className="text-xl font-bold text-slate-300">Seri tidak ditemukan atau gagal dimuat.</h2>
        <Link href="/" className="flex items-center gap-2 text-violet-400 hover:text-violet-300">
          <ArrowLeft size={16} /> Kembali ke Dashboard
        </Link>
      </div>
    );
  }

  // Ensure type property matches the actual page parameter
  const parsedData = { ...data, type: type as 'anime' | 'donghua' | 'drama' };

  return (
    <WatchClient 
      initialData={parsedData} 
      type={type} 
      slug={slug} 
      initialSource={source}
    />
  );
}

