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

async function searchAnimeFallback(slug: string): Promise<{ data: any; resolvedSource: string } | null> {
  const cleanTitle = slug
    .replace(/^(anilist|jikan)-\d+-/, '')
    .replace(/-sub-indo$/i, '')
    .replace(/-episode-\d+.*$/i, '')
    .replace(/-[a-z0-9]{7}$/i, '')
    .replace(/^1piece/i, 'one piece')
    .replace(/-/g, ' ')
    .trim();

  if (!cleanTitle) return null;

  const words = cleanTitle.split(' ');
  const firstWord = words[0].toLowerCase();

  // Extract season/part number from original slug (e.g. "season-3" → 3, "part-2" → 2)
  const seasonMatch = slug.match(/season[- ](\d+)|part[- ](\d+)|s(\d+)/i);
  const seasonNum = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3]) : null;
  // Roman numerals map: season 2 → ii, season 3 → iii, etc.
  const romanMap: Record<number, string> = { 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v' };
  const romanNum = seasonNum ? romanMap[seasonNum] || null : null;

  // Helper: does result title contain at least first keyword?
  const isRelevant = (title: string) => title.toLowerCase().includes(firstWord);

  // Score a candidate: higher = better match
  const score = (title: string): number => {
    const t = title.toLowerCase();
    let s = 0;
    // Exact match wins
    if (t === cleanTitle.toLowerCase()) return 1000;
    // Season number match (roman or digit)
    if (romanNum && t.includes(romanNum)) s += 50;
    if (seasonNum && t.includes(`season ${seasonNum}`)) s += 50;
    if (seasonNum && t.includes(`s${seasonNum}`)) s += 30;
    // Not a special/ova (avoid these for season searches)
    if (!t.includes('special') && !t.includes('ova') && !t.includes('movie')) s += 20;
    // Starts with first 2 words
    if (t.startsWith(words.slice(0, 2).join(' ').toLowerCase())) s += 10;
    return s;
  };

  // Get sorted candidate matches by relevance and score
  const getSortedCandidates = (results: any[]): any[] => {
    const relevant = results.filter(s => isRelevant(s.title));
    return relevant.sort((a, b) => score(b.title) - score(a.title));
  };

  // Try progressively shorter queries: 3 words → 2 words → 1 word
  const queries = [
    words.slice(0, 3).join(' '),
    words.slice(0, 2).join(' '),
    words[0]
  ].filter((q, i, arr) => arr.indexOf(q) === i); // deduplicate

  // Try Samehadaku first (works reliably on Vercel)
  for (const query of queries) {
    const results = await getSamehadakuSearch(query).catch(() => []);
    const sorted = getSortedCandidates(results);
    for (const cand of sorted) {
      const d = await getSamehadakuDetail(cand.slug).catch(() => null);
      if (d && d.episodes && d.episodes.length > 0) {
        return { data: d, resolvedSource: 'samehadaku' };
      }
    }
  }

  // Try Otakudesu fallback
  for (const query of queries) {
    const results = await getOtakudesuSearch(query).catch(() => []);
    const sorted = getSortedCandidates(results);
    for (const cand of sorted) {
      const d = await getOtakudesuDetail(cand.slug).catch(() => null);
      if (d && d.episodes && d.episodes.length > 0) {
        return { data: d, resolvedSource: 'otakudesu' };
      }
    }
  }

  return null;
}



async function fetchDetail(type: string, slug: string, source?: string) {
  // 1. External AniList/Jikan slug
  if (slug.startsWith('anilist-') || slug.startsWith('jikan-')) {
    const fallback = await searchAnimeFallback(slug);
    if (fallback) return fallback;
  }

  // 2. Specific source requested
  if (source === 'otakudesu') {
    const d = await getOtakudesuDetail(slug).catch(() => null);
    if (d && d.episodes && d.episodes.length > 0) return { data: d, resolvedSource: 'otakudesu' };
    const alt = await getSamehadakuDetail(slug).catch(() => null);
    if (alt && alt.episodes && alt.episodes.length > 0) return { data: alt, resolvedSource: 'samehadaku' };
    // Otakudesu blocked/failed, auto-search Samehadaku
    const fallback = await searchAnimeFallback(slug);
    if (fallback) return fallback;
  } else if (source === 'samehadaku') {
    const d = await getSamehadakuDetail(slug).catch(() => null);
    if (d && d.episodes && d.episodes.length > 0) return { data: d, resolvedSource: 'samehadaku' };
    const d2 = await getOtakudesuDetail(slug).catch(() => null);
    if (d2 && d2.episodes && d2.episodes.length > 0) return { data: d2, resolvedSource: 'otakudesu' };
    const fallback = await searchAnimeFallback(slug);
    if (fallback) return fallback;
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
    // anime default: try Samehadaku direct & Otakudesu direct
    const dSame = await getSamehadakuDetail(slug).catch(() => null);
    if (dSame && dSame.episodes && dSame.episodes.length > 0) return { data: dSame, resolvedSource: 'samehadaku' };
    const dOtaku = await getOtakudesuDetail(slug).catch(() => null);
    if (dOtaku && dOtaku.episodes && dOtaku.episodes.length > 0) return { data: dOtaku, resolvedSource: 'otakudesu' };
    // Cross-search fallback
    const fallback = await searchAnimeFallback(slug);
    if (fallback) return fallback;
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

