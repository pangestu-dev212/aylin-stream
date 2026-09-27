import { Metadata } from 'next';
import { getShortDramaPopular, getShortDramaLatest } from '@/lib/shortdrama-scraper';
import { filterSafeList } from '@/lib/content-filter';
import ShortDramaCatalogClient from './ShortDramaCatalogClient';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Drama China Pendek (9:16 Tegak) Sub Indo - Aylin Stream',
  description: 'Tonton koleksi drama China vertikal format tegak 9:16 ala DramaBox dan ReelShort lengkap sulih suara / subtitle Indonesia gratis.',
};

export default async function ShortDramaPage() {
  const [popular, latest] = await Promise.all([
    getShortDramaPopular().catch(() => []),
    getShortDramaLatest().catch(() => []),
  ]);

  return <ShortDramaCatalogClient initialPopular={filterSafeList(popular)} initialLatest={filterSafeList(latest)} />;
}
