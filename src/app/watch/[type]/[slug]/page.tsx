import { Metadata } from 'next';
import { 
  getOtakudesuDetail, 
  getOtakudesuSearch,
  getAnichinDetail, 
  getJuraganfilmDetail,
  getAnimeXinDetail,
  getSamehadakuDetail,
  getSamehadakuSearch,
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

async function fetchDetail(type: string, slug: string, source?: string) {
  // 1. External AniList/Jikan slug
  if (slug.startsWith('anilist-') || slug.startsWith('jikan-')) {
    const searchTitle = slug.replace(/^(anilist|jikan)-\d+-/, '').replace(/-/g, ' ').trim();
    const [sameSearch, otakuSearch] = await Promise.all([
      getSamehadakuSearch(searchTitle).catch(() => []),
      getOtakudesuSearch(searchTitle).catch(() => [])
    ]);

    if (sameSearch.length > 0) {
      const d = await getSamehadakuDetail(sameSearch[0].slug).catch(() => null);
      if (d) return { data: d, resolvedSource: 'samehadaku' };
    }
    if (otakuSearch.length > 0) {
      const d = await getOtakudesuDetail(otakuSearch[0].slug).catch(() => null);
      if (d) return { data: d, resolvedSource: 'otakudesu' };
    }
  }

  // 2. Specific source requested
  if (source === 'samehadaku') {
    const d = await getSamehadakuDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'samehadaku' };
    // fallback to otakudesu
    const d2 = await getOtakudesuDetail(slug).catch(() => null);
    if (d2) return { data: d2, resolvedSource: 'otakudesu' };
  } else if (source === 'animexin') {
    const d = await getAnimeXinDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'animexin' };
  } else if (source === 'donghuastream') {
    const d = await getDonghuastreamDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'donghuastream' };
  } else if (type === 'drama') {
    const d = await getJuraganfilmDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'juraganfilm' };
  } else if (type === 'donghua') {
    const d = await getAnichinDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'anichin' };
    const alt = await getAnimeXinDetail(slug).catch(() => null);
    if (alt) return { data: alt, resolvedSource: 'animexin' };
  } else {
    // anime default: try Samehadaku then Otakudesu
    const dSame = await getSamehadakuDetail(slug).catch(() => null);
    if (dSame) return { data: dSame, resolvedSource: 'samehadaku' };
    const dOtaku = await getOtakudesuDetail(slug).catch(() => null);
    if (dOtaku) return { data: dOtaku, resolvedSource: 'otakudesu' };
  }

  return { data: null, resolvedSource: source };
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { type, slug } = await params;
  const { source } = await searchParams;

  const { data } = await fetchDetail(type, slug, source);
     
  return {
    title: data ? `Nonton ${data.title} Subtitle Indonesia - Aylin Stream` : 'Nonton Anime & Donghua - Aylin Stream',
    description: data ? data.synopsis.substring(0, 160) : 'Streaming gratis sub Indo.',
  };
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const { type, slug } = await params;
  const { source } = await searchParams;
  
  const { data, resolvedSource } = await fetchDetail(type, slug, source);

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
      initialSource={resolvedSource}
    />
  );
}

