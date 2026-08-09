import { getOtakudesuOngoing, getAnichinOngoing, getJuraganfilmOngoing } from '@/lib/stream-scraper';
import DashboardClient from './components/DashboardClient';

// Enable layout/page caching to serve static pages and revalidate in the background every 5 minutes (ISR)
export const revalidate = 300;

export default async function Home() {
  // Fetch ongoing anime, donghua & drama lists on the server
  const [rawAnime, rawDonghua, rawDrama] = await Promise.all([
    getOtakudesuOngoing().catch(() => []),
    getAnichinOngoing().catch(() => []),
    getJuraganfilmOngoing().catch(() => [])
  ]);

  // Deduplicate by slug to prevent React duplicate key warning
  const ongoingAnime = [...new Map(rawAnime.map(item => [item.slug, item])).values()];
  const ongoingDonghua = [...new Map(rawDonghua.map(item => [item.slug, item])).values()];
  
  // Map type to 'drama' so client layout handles styling appropriately
  const parsedDrama = rawDrama.map(item => ({ ...item, type: 'drama' as const }));
  const ongoingDrama = [...new Map(parsedDrama.map(item => [item.slug, item])).values()];

  return (
    <DashboardClient 
      initialAnime={ongoingAnime} 
      initialDonghua={ongoingDonghua} 
      initialDrama={ongoingDrama}
    />
  );
}
