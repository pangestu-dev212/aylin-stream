import { getSamehadakuOngoing, getOtakudesuOngoing, getAnichinOngoing, getJuraganfilmOngoing, getJikanOngoingAnime } from '@/lib/stream-scraper';
import { getLatestManga } from '@/lib/manga-scraper';
import { getShortDramaPopular } from '@/lib/shortdrama-scraper';
import { filterSafeList } from '@/lib/content-filter';
import DashboardClient from './components/DashboardClient';

// Revalidate every 3 minutes so fresh episodes appear promptly
export const revalidate = 180;

export default async function Home() {
  // Fetch all live data sources in parallel
  const [rawSamehadaku, rawOtakudesu, rawDonghua, rawDrama, rawJikan, rawManga, rawShortDrama] = await Promise.all([
    getSamehadakuOngoing().catch(() => []),
    getOtakudesuOngoing().catch(() => []),
    getAnichinOngoing().catch(() => []),
    getJuraganfilmOngoing().catch(() => []),
    getJikanOngoingAnime().catch(() => []),
    getLatestManga().catch(() => []),
    getShortDramaPopular().catch(() => [])
  ]);

  // Priority: Fresh sub Indo releases (Samehadaku → Otakudesu) → fallback global AniList
  const rawAnime = rawSamehadaku.length > 0
    ? rawSamehadaku
    : rawOtakudesu.length > 0
      ? rawOtakudesu
      : rawJikan;

  // Deduplicate by slug to prevent React duplicate key warning, strictly filtered for safety
  const ongoingAnime = filterSafeList([...new Map(rawAnime.map(item => [item.slug, item])).values()]);
  const ongoingDonghua = filterSafeList([...new Map(rawDonghua.map(item => [item.slug, item])).values()]);
  
  // Map type to 'drama' so client layout handles styling appropriately
  const parsedDrama = rawDrama.map(item => ({ ...item, type: 'drama' as const }));
  const ongoingDrama = filterSafeList([...new Map(parsedDrama.map(item => [item.slug, item])).values()]);
  const ongoingManga = filterSafeList([...new Map(rawManga.map(item => [item.slug, item])).values()]);
  const ongoingShortDrama = filterSafeList(rawShortDrama);

  return (
    <DashboardClient 
      initialAnime={ongoingAnime} 
      initialDonghua={ongoingDonghua} 
      initialDrama={ongoingDrama}
      initialManga={ongoingManga}
      initialShortDrama={ongoingShortDrama}
    />
  );
}
