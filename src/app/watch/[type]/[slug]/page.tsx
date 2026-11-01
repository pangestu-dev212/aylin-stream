import { Metadata } from 'next';
import { 
  getOtakudesuDetail, 
  getOtakudesuSearch,
  getAnichinDetail, 
  getJuraganfilmDetail,
  getAnimeXinDetail,
  getSamehadakuDetail,
  getSamehadakuSearch,
  getDonghuastreamDetail,
  getAniListTitleInfo
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

const STOP_WORDS = new Set([
  'i', 'm', 'a', 'an', 'the', 'to', 'in', 'on', 'of', 'and', 'or', 'for', 'with', 
  'at', 'by', 'from', 'no', 'wa', 'ga', 'ni', 'de', 'wo', 'da', 'ka', 'te'
]);

async function searchAnimeFallback(slug: string): Promise<{ data: any; resolvedSource: string } | null> {
  const searchTitles: string[] = [];

  // 1. If it's an AniList slug, fetch precise Romaji & English titles directly
  const anilistMatch = slug.match(/^anilist-(\d+)/);
  if (anilistMatch) {
    const aniId = parseInt(anilistMatch[1], 10);
    const titleInfo = await getAniListTitleInfo(aniId);
    if (titleInfo) {
      if (titleInfo.romaji) searchTitles.push(titleInfo.romaji);
      if (titleInfo.english && titleInfo.english !== titleInfo.romaji) searchTitles.push(titleInfo.english);
      if (Array.isArray(titleInfo.synonyms)) {
        searchTitles.push(...titleInfo.synonyms.slice(0, 2));
      }
    }
  }

  // 2. Also clean the slug itself
  const rawClean = slug
    .replace(/^(anilist|jikan)-\d+-/, '')
    .replace(/-sub-indo$/i, '')
    .replace(/-episode-\d+.*$/i, '')
    .replace(/-[a-z0-9]{7}$/i, '')
    .replace(/^1piece/i, 'one piece')
    .replace(/-/g, ' ')
    .trim();

  if (rawClean && !searchTitles.includes(rawClean)) {
    searchTitles.push(rawClean);
  }

  if (searchTitles.length === 0) return null;

  // Extract season number
  const seasonMatch = slug.match(/season[- ](\d+)|part[- ](\d+)|s(\d+)/i);
  const seasonNum = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3]) : null;
  const romanMap: Record<number, string> = { 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v' };
  const romanNum = seasonNum ? romanMap[seasonNum] || null : null;

  for (const baseTitle of searchTitles) {
    const allWords = baseTitle.split(/\s+/).map(w => w.trim()).filter(Boolean);
    const meaningfulWords = allWords.filter(w => !STOP_WORDS.has(w.toLowerCase()) && w.length >= 2);

    if (meaningfulWords.length === 0) continue;

    const primaryKeyword = meaningfulWords.find(w => w.length >= 3)?.toLowerCase() || meaningfulWords[0].toLowerCase();
    if (!primaryKeyword || primaryKeyword.length < 2) continue;

    // Strict relevance: candidate must contain primary meaningful keyword (never single character)
    const isRelevant = (candidateTitle: string): boolean => {
      const lower = candidateTitle.toLowerCase();
      if (!lower.includes(primaryKeyword)) return false;
      if (meaningfulWords.length >= 2) {
        const secondKeyword = meaningfulWords.find(w => w.toLowerCase() !== primaryKeyword && w.length >= 3)?.toLowerCase();
        if (secondKeyword && !lower.includes(secondKeyword)) {
          return lower.startsWith(primaryKeyword);
        }
      }
      return true;
    };

    const score = (candidateTitle: string): number => {
      const t = candidateTitle.toLowerCase();
      let s = 0;
      if (t === baseTitle.toLowerCase()) return 1000;
      if (romanNum && t.includes(romanNum)) s += 50;
      if (seasonNum && t.includes(`season ${seasonNum}`)) s += 50;
      if (seasonNum && t.includes(`s${seasonNum}`)) s += 30;
      if (!t.includes('special') && !t.includes('ova') && !t.includes('movie')) s += 20;
      if (t.startsWith(meaningfulWords.slice(0, 2).join(' ').toLowerCase())) s += 15;
      return s;
    };

    const getSortedCandidates = (results: any[]): any[] => {
      const relevant = results.filter(s => isRelevant(s.title));
      return relevant.sort((a, b) => score(b.title) - score(a.title));
    };

    // Construct search queries without stop words
    const queries = [
      meaningfulWords.slice(0, 3).join(' '),
      meaningfulWords.slice(0, 2).join(' '),
      meaningfulWords[0]
    ].filter((q, i, arr) => q && q.length >= 3 && arr.indexOf(q) === i);

    // 1. Try Samehadaku
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

    // 2. Try Otakudesu fallback
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
    const alt = await getAnichinDetail(slug).catch(() => null);
    if (alt) return { data: alt, resolvedSource: 'anichin' };
    const alt2 = await getDonghuastreamDetail(slug).catch(() => null);
    if (alt2) return { data: alt2, resolvedSource: 'donghuastream' };
  } else if (source === 'donghuastream') {
    const d = await getDonghuastreamDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'donghuastream' };
    const alt = await getAnichinDetail(slug).catch(() => null);
    if (alt) return { data: alt, resolvedSource: 'anichin' };
    const alt2 = await getAnimeXinDetail(slug).catch(() => null);
    if (alt2) return { data: alt2, resolvedSource: 'animexin' };
  } else if (type === 'drama') {
    const d = await getJuraganfilmDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'juraganfilm' };
  } else if (type === 'donghua') {
    const d = await getAnichinDetail(slug).catch(() => null);
    if (d) return { data: d, resolvedSource: 'anichin' };
    const alt = await getAnimeXinDetail(slug).catch(() => null);
    if (alt) return { data: alt, resolvedSource: 'animexin' };
    const alt2 = await getDonghuastreamDetail(slug).catch(() => null);
    if (alt2) return { data: alt2, resolvedSource: 'donghuastream' };
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

