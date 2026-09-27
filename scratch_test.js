const { getSamehadakuSearch, getSamehadakuDetail } = require('./src/lib/stream-scraper.ts');

async function testScoring(originalSlug) {
  const cleanTitle = originalSlug
    .replace(/^(anilist|jikan)-\d+-/, '')
    .replace(/-sub-indo$/i, '')
    .replace(/-[a-z0-9]{7}$/i, '')
    .replace(/^1piece/i, 'one piece')
    .replace(/-/g, ' ')
    .trim();

  const words = cleanTitle.split(' ');
  const firstWord = words[0].toLowerCase();

  const seasonMatch = originalSlug.match(/season[- ](\d+)|part[- ](\d+)|s(\d+)/i);
  const seasonNum = seasonMatch ? parseInt(seasonMatch[1] || seasonMatch[2] || seasonMatch[3]) : null;
  const romanMap = { 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v' };
  const romanNum = seasonNum ? romanMap[seasonNum] || null : null;

  console.log(`slug: ${originalSlug}`);
  console.log(`clean: "${cleanTitle}"`);
  console.log(`seasonNum: ${seasonNum}, romanNum: ${romanNum}`);

  const isRelevant = (title) => title.toLowerCase().includes(firstWord);
  const score = (title) => {
    const t = title.toLowerCase();
    let s = 0;
    if (t === cleanTitle.toLowerCase()) return 1000;
    if (romanNum && t.includes(romanNum)) s += 50;
    if (seasonNum && t.includes(`season ${seasonNum}`)) s += 50;
    if (seasonNum && t.includes(`s${seasonNum}`)) s += 30;
    if (!t.includes('special') && !t.includes('ova') && !t.includes('movie')) s += 20;
    if (t.startsWith(words.slice(0, 2).join(' ').toLowerCase())) s += 10;
    return s;
  };

  const queries = [
    words.slice(0, 3).join(' '),
    words.slice(0, 2).join(' '),
    words[0]
  ].filter((q, i, arr) => arr.indexOf(q) === i);

  for (const query of queries) {
    const results = await getSamehadakuSearch(query).catch(() => []);
    const relevant = results.filter(r => isRelevant(r.title));
    if (relevant.length === 0) { console.log(`[${query}] no relevant`); continue; }

    const scored = relevant.map(r => ({ ...r, score: score(r.title) }))
      .sort((a, b) => b.score - a.score);
    
    console.log(`[${query}] relevant results (scored):`);
    scored.slice(0, 5).forEach(r => console.log(`  score=${r.score} "${r.title}"`));
    
    const best = scored[0];
    const d = await getSamehadakuDetail(best.slug).catch(() => null);
    if (d && d.episodes?.length > 0) {
      console.log(`✓ PICKED: "${d.title}" (${d.episodes.length} eps)`);
      return;
    }
    break;
  }
}

async function run() {
  console.log('=== Mushoku Tensei Season 3 ===');
  await testScoring('anilist-178789-mushoku-tensei-jobless-reincarnation-season-3');

  console.log('\n=== Kaguya-sama Season 3 ===');
  await testScoring('anilist-124080-kaguya-sama-wa-kokurasetai-ultra-romantic-season-3');
}
run();
