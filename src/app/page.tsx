import { getSamehadakuOngoing, getOtakudesuOngoing, getAnichinOngoing, getJuraganfilmOngoing, getJikanOngoingAnime } from '@/lib/stream-scraper';
import { getLatestManga } from '@/lib/manga-scraper';
import DashboardClient from './components/DashboardClient';

// Revalidate every 3 minutes so fresh episodes appear promptly
export const revalidate = 180;

export default async function Home() {
  // Fetch all live data sources in parallel
  const [rawSamehadaku, rawOtakudesu, rawDonghua, rawDrama, rawJikan, rawManga] = await Promise.all([
    getSamehadakuOngoing().catch(() => []),
    getOtakudesuOngoing().catch(() => []),
    getAnichinOngoing().catch(() => []),
    getJuraganfilmOngoing().catch(() => []),
    getJikanOngoingAnime().catch(() => []),
    getLatestManga().catch(() => [])
  ]);

  // Priority: Fresh sub Indo releases (Samehadaku → Otakudesu) → fallback global AniList
  const rawAnime = rawSamehadaku.length > 0
    ? rawSamehadaku
    : rawOtakudesu.length > 0
      ? rawOtakudesu
      : rawJikan;

  // Deduplicate by slug to prevent React duplicate key warning
  const ongoingAnime = [...new Map(rawAnime.map(item => [item.slug, item])).values()];
  const ongoingDonghua = [...new Map(rawDonghua.map(item => [item.slug, item])).values()];
  
  // Map type to 'drama' so client layout handles styling appropriately
  const parsedDrama = rawDrama.map(item => ({ ...item, type: 'drama' as const }));
  const ongoingDrama = [...new Map(parsedDrama.map(item => [item.slug, item])).values()];
  const ongoingManga = [...new Map(rawManga.map(item => [item.slug, item])).values()];

  return (
    <DashboardClient 
      initialAnime={ongoingAnime} 
      initialDonghua={ongoingDonghua} 
      initialDrama={ongoingDrama}
      initialManga={ongoingManga}
    />
  );
}
