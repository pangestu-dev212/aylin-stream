// Replicate the fix from page.tsx
async function searchAnimeFallback(slug) {
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
  const shortQuery = words.slice(0, 3).join(' ');
  const firstWord = words[0].toLowerCase();
  const isRelevant = (title) => title.toLowerCase().includes(firstWord);

  const { getSamehadakuSearch, getSamehadakuDetail, getOtakudesuSearch, getOtakudesuDetail } = require('./src/lib/stream-scraper.ts');

  const sameResults = await getSamehadakuSearch(shortQuery).catch(() => []);
  const sameRelevant = sameResults.filter(s => isRelevant(s.title));
  
  console.log(`Query: "${shortQuery}" -> ${sameResults.length} results, ${sameRelevant.length} relevant`);
  sameRelevant.forEach(r => console.log(`  - "${r.title}" (${r.slug})`));

  if (sameRelevant.length > 0) {
    const best = sameRelevant.find(s => s.title.toLowerCase() === cleanTitle.toLowerCase())
      || sameRelevant.find(s => s.title.toLowerCase().startsWith(words.slice(0, 2).join(' ').toLowerCase()))
      || sameRelevant[0];
    console.log(`Best match: "${best.title}"`);
    const d = await getSamehadakuDetail(best.slug).catch(() => null);
    if (d && d.episodes && d.episodes.length > 0) {
      console.log(`✓ Found! ${d.episodes.length} episodes`);
      return { data: d, resolvedSource: 'samehadaku' };
    }
  }
  console.log('✗ Not found');
  return null;
}

async function run() {
  console.log('=== Mushoku Tensei ===');
  await searchAnimeFallback('anilist-178789-mushoku-tensei-jobless-reincarnation-season-3');

  console.log('\n=== Spy x Family ===');
  await searchAnimeFallback('anilist-142838-spy-x-family-season-2');

  console.log('\n=== Demon Slayer ===');
  await searchAnimeFallback('anilist-101922-kimetsu-no-yaiba-demon-slayer');
}
run();
