/**
 * Content Safety Filter for Aylin Stream
 * Strictly blocks and filters Hentai, Pornography, Ecchi, and Adult Erotic Content
 * across Manga, Short Drama, Anime, and Search APIs.
 */

// Normalized forbidden words and phrases (lower-case)
export const FORBIDDEN_KEYWORDS: string[] = [
  // Hentai & Erotica terms
  'hentai',
  'ecchi',
  'smut',
  'eromanga',
  'eroge',
  'erotis',
  'erotic',
  'erotica',
  'doujinshi',
  'doujin',
  'h-manga',
  '18+',
  'r18',
  'r-18',
  'r 18',
  'mature 18+',
  'konten dewasa',
  'dewasa 18+',
  'nsfw',

  // Explicit pornography & sex terms (Indonesian & English)
  'porn',
  'porno',
  'pornografi',
  'pornography',
  'xxx',
  'bokep',
  'seks',
  'sex',
  'sexual',
  'seksual',
  'bugil',
  'telanjang',
  'nude',
  'naked',
  'vulgar',
  'mesum',
  'cabul',
  'ngentot',
  'ngewe',
  'kontol',
  'memek',
  'pepek',
  'itil',
  'masturbasi',
  'masturbation',
  'orgasme',
  'orgasm',
  'persetubuhan',
  'hubungan seksual',

  // Adult / Erotic drama & comic tropes
  'tidur dengan',
  'skandal ranjang',
  'di ranjang',
  'atas ranjang',
  'cinta semalam',
  'one night stand',
  'one-night stand',
  'kenikmatan semalam',
  'gairah ranjang',
  'gairah liar',
  'gairah membara',
  'nafsu birahi',
  'wanita penghibur',
  'wanita simpanan',
  'istri simpanan',
  'istri sewaan panas',
  'istri tetangga',
  'istri orang',
  'tante girang',
  'tante seksi',
  'pelakor',
  'hubungan terlarang',
  'cinta terlarang',
  'malam pertama',
  'skandal panas',
  'sugar daddy',
  'sugar baby',
  'bobo bareng',
  'sange',
  'sensual',

  // Japanese / Manga adult & suggestive tropes
  'atm ojisan',
  'ojisan',
  'mote-ki',
  'mote-kiga',
  'mote ki',
  'motekiga',
  'saigo no natsu',
  'hitozuma',
  'chikan',
  'netorare',
  'ntr',
  'netori',
  'enjo kosai',
  'enjokosai',
  'yari',
  'yariman',
  'yarichin',
  'oppai',
  'ahegao',
  'paizuri',
  'milf',
  'bukkake',
  'gangbang',
  'creampie',
  'uncensored',
  'lewd',
  'shota',
  'shotacon',
  'lolicon',
];

// Forbidden tags & genres (exact or partial match)
export const FORBIDDEN_GENRES_AND_TAGS: string[] = [
  'hentai',
  'ecchi',
  'smut',
  'erotica',
  'erotic',
  'erotis',
  'doujinshi',
  'doujin',
  'adult',
  '18+',
  'r18',
  'r-18',
  'nsfw',
  'mature',
  'gairah',
  'cinta semalam',
  'porno',
  'porn',
  'pornografi',
  'seksual',
  'sexual',
  'perselingkuhan', // often used for erotic infidelity short dramas
  'sensual',
  'hitozuma',
  'netorare',
  'ntr',
];

/**
 * Checks if a string contains any forbidden NSFW/pornographic keywords
 */
export function isNsfwText(text: string | undefined | null): boolean {
  if (!text) return false;
  const clean = text.toLowerCase();

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (clean.includes(keyword)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if any tag or genre matches forbidden NSFW tags
 */
export function isNsfwTags(tagsOrGenres: string[] | undefined | null): boolean {
  if (!Array.isArray(tagsOrGenres) || tagsOrGenres.length === 0) return false;

  for (const item of tagsOrGenres) {
    if (typeof item !== 'string') continue;
    const clean = item.trim().toLowerCase();

    for (const forbidden of FORBIDDEN_GENRES_AND_TAGS) {
      if (clean === forbidden || clean.includes(forbidden)) {
        return true;
      }
    }
    // Also check forbidden keywords inside tag
    if (isNsfwText(clean)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates whether a content item (Manga, Short Drama, Anime) is safe to display.
 * Returns true if clean, false if NSFW/pornographic.
 */
export function isContentSafe(item: {
  title?: string;
  slug?: string;
  tags?: string[];
  genres?: string[];
  synopsis?: string;
}): boolean {
  if (!item) return false;

  // 1. Check title
  if (isNsfwText(item.title)) {
    return false;
  }

  // 2. Check slug
  if (isNsfwText(item.slug)) {
    return false;
  }

  // 3. Check tags
  if (isNsfwTags(item.tags)) {
    return false;
  }

  // 4. Check genres
  if (isNsfwTags(item.genres)) {
    return false;
  }

  // 5. Check synopsis for explicit terms
  if (item.synopsis && isNsfwText(item.synopsis)) {
    return false;
  }

  return true;
}

/**
 * Validates search query to ensure no NSFW / pornographic search is permitted
 */
export function isSafeQuery(query: string | undefined | null): boolean {
  if (!query) return true;
  const clean = query.trim().toLowerCase();
  return !isNsfwText(clean);
}

/**
 * Filters an array of content items, removing any NSFW/pornographic entries
 */
export function filterSafeList<T extends {
  title?: string;
  slug?: string;
  tags?: string[];
  genres?: string[];
  synopsis?: string;
}>(list: T[]): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter(item => isContentSafe(item));
}
