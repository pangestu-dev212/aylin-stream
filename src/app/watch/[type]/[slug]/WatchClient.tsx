'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Play, Star, ArrowLeft, List, 
  Maximize2, Minimize2, Lightbulb, RefreshCw, AlertTriangle,
  Search, X, ChevronDown, Trash2, Plus, ArrowUpRight
} from 'lucide-react';
import { AnimeDetail, EpisodeLink } from '@/lib/stream-scraper';
import { useTheme } from '@/app/context/ThemeContext';

interface MirrorItem {
  quality: string;
  playerText: string;
  payload: {
    id?: number;
    i?: number;
    q?: string;
    src?: string;
    directSrc?: string | null;
  };
}

interface BookmarkedItem {
  title: string;
  slug: string;
  img: string;
  type: string;
  ep?: string;
}

interface WatchClientProps {
  initialData: AnimeDetail;
  type: string;
  slug: string;
}

function getCleanEpisodeNumber(title: string, fallbackNum: number): string {
  // Try matching range first, e.g. "Episode 951 – 975" -> "951-975"
  const rangeMatch = title.match(/Episode\s+(\d+)\s*–\s*(\d+)/i);
  if (rangeMatch) return `Ep ${rangeMatch[1]}-${rangeMatch[2]}`;

  // Try matching single episode number, e.g. "Episode 1172" -> "1172"
  const singleMatch = title.match(/Episode\s+(\d+)/i);
  if (singleMatch) return `Ep ${singleMatch[1]}`;

  // Try matching "Ep 123" pattern
  const epMatch = title.match(/Ep\s+(\d+)/i);
  if (epMatch) return `Ep ${epMatch[1]}`;

  // Fallback to title cleanup (removing common boilerplate)
  const cleaned = title
    .replace(/Subtitle Indonesia/i, '')
    .replace(/Sub Indo/i, '')
    .replace(/One Piece/i, '')
    .trim();

  if (cleaned.length > 0 && cleaned.length < 15) return cleaned;

  return `Ep ${fallbackNum}`;
}

export default function WatchClient({ initialData, type, slug }: WatchClientProps) {
  const { theme, setTheme } = useTheme();
  const [data, setData] = useState<AnimeDetail>(initialData);
  const [activeSource, setActiveSource] = useState<'utama' | 'cadangan' | 'alternatif'>('utama');
  const [activeEpisode, setActiveEpisode] = useState<EpisodeLink | null>(null);
  
  // Player state
  const [mirrors, setMirrors] = useState<MirrorItem[]>([]);
  const [activeMirror, setActiveMirror] = useState<MirrorItem | null>(null);
  const [playerSrc, setPlayerSrc] = useState<string>('');
  const [episodeLoading, setEpisodeLoading] = useState(false);
  const [playerLoading, setPlayerLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // UI state
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [theatreMode, setTheatreMode] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [watchedEpisodes, setWatchedEpisodes] = useState<string[]>([]);

  const [activeProfile, setActiveProfile] = useState<string>('Utama');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Profile management input
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState('from-violet-500 to-indigo-500');

  // Recommendations state
  const [recommendations, setRecommendations] = useState<any[]>([]);

  // Auto-Next & Skip Intro States
  const [isAutoNextEnabled, setIsAutoNextEnabled] = useState(false);
  const [episodeDuration, setEpisodeDuration] = useState(1320); // 22 mins default
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const [showNextTransition, setShowNextTransition] = useState(false);
  const [transitionCountdown, setTransitionCountdown] = useState(5);

  const getScopedKey = (key: string, profile: string) => {
    if (profile === 'Utama') return key;
    return `${key}_profile_${profile.replace(/\s+/g, '_')}`;
  };

  // Load bookmarks, watched episodes list, and player preferences on profile change
  useEffect(() => {
    // Load profiles list
    const savedProfiles = localStorage.getItem('aylin_profiles');
    let loadedProfiles: any[] = [];
    if (savedProfiles) {
      try {
        loadedProfiles = JSON.parse(savedProfiles);
        setProfiles(loadedProfiles);
      } catch {}
    }
    if (loadedProfiles.length === 0) {
      const defaultProfiles = [{ name: 'Utama', color: 'from-violet-500 to-indigo-500' }];
      setProfiles(defaultProfiles);
      localStorage.setItem('aylin_profiles', JSON.stringify(defaultProfiles));
    }

    setMounted(true);

    const timer = setTimeout(() => {
      // Bookmarks
      const bookKey = getScopedKey('aylin_bookmarks', activeProfile);
      const saved = localStorage.getItem(bookKey);
      if (saved) {
        try {
          const list: BookmarkedItem[] = JSON.parse(saved);
          const exists = list.some((item) => item.slug === slug && item.type === type);
          setIsBookmarked(exists);
        } catch {
          setIsBookmarked(false);
        }
      } else {
        setIsBookmarked(false);
      }

      // Watched episodes
      const watchedKey = getScopedKey('aylin_watched_episodes', activeProfile);
      const savedWatched = localStorage.getItem(watchedKey);
      if (savedWatched) {
        try {
          const mapping = JSON.parse(savedWatched);
          if (mapping[slug]) {
            setWatchedEpisodes(mapping[slug]);
          } else {
            setWatchedEpisodes([]);
          }
        } catch {
          setWatchedEpisodes([]);
        }
      } else {
        setWatchedEpisodes([]);
      }

      // Player preferences
      const savedPrefs = localStorage.getItem('aylin_player_prefs');
      if (savedPrefs) {
        try {
          const prefs = JSON.parse(savedPrefs);
          if (prefs.theatreMode !== undefined) setTheatreMode(prefs.theatreMode);
          if (prefs.cinemaMode !== undefined) setCinemaMode(prefs.cinemaMode);
        } catch {}
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [slug, type, activeProfile]);

  // Load profiles active profile initially
  useEffect(() => {
    const profile = localStorage.getItem('aylin_active_profile') || 'Utama';
    setActiveProfile(profile);
  }, []);

  // Fetch ongoing recommendations on mount
  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const res = await fetch(`/api/ongoing?type=${type}`);
        const json = await res.json();
        if (json.success) {
          // Filter out the current series to avoid recommending what they are already watching
          const filtered = (json.results || []).filter((item: any) => item.slug !== slug);
          setRecommendations(filtered);
        }
      } catch (e) {
        console.error("Failed to load recommendations:", e);
      }
    };
    fetchRecommendations();
  }, [type, slug]);

  const handleAddProfile = (name: string, color: string) => {
    if (!name.trim()) return;
    const exists = profiles.some(p => p.name.toLowerCase() === name.toLowerCase().trim());
    if (exists) return;
    
    const newProfiles = [...profiles, { name: name.trim(), color }];
    setProfiles(newProfiles);
    localStorage.setItem('aylin_profiles', JSON.stringify(newProfiles));
  };

  const handleRemoveProfile = (name: string) => {
    if (name === 'Utama') return;
    const newProfiles = profiles.filter(p => p.name !== name);
    setProfiles(newProfiles);
    localStorage.setItem('aylin_profiles', JSON.stringify(newProfiles));
    
    if (activeProfile === name) {
      setActiveProfile('Utama');
      localStorage.setItem('aylin_active_profile', 'Utama');
    }
  };

  // Handle search typing & fetch
  const handleSearchChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
      const json = await res.json();
      if (json.success) {
        setSearchResults(json.results || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  // Keyboard Shortcuts Handler
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' || 
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'n') {
        e.preventDefault();
        playNextEpisode();
      } else if (key === 'p') {
        e.preventDefault();
        playPrevEpisode();
      } else if (key === 't') {
        e.preventDefault();
        setTheatreMode(prev => !prev);
      } else if (key === 'c') {
        e.preventDefault();
        setCinemaMode(prev => !prev);
      } else if (key === 'b') {
        e.preventDefault();
        toggleBookmark();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [activeEpisode, isBookmarked, theatreMode, cinemaMode]);

  // Auto-Next Countdown Timer Logic
  useEffect(() => {
    if (!isAutoNextEnabled || isTimerPaused || showNextTransition || !playerSrc) return;

    const timer = setInterval(() => {
      setElapsedTime((prev) => {
        if (prev + 1 >= episodeDuration) {
          clearInterval(timer);
          setShowNextTransition(true);
          setTransitionCountdown(5);
          return episodeDuration;
        }
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoNextEnabled, isTimerPaused, showNextTransition, episodeDuration, playerSrc]);

  // Transition Countdown Timer Logic
  useEffect(() => {
    if (!showNextTransition) return;

    const timer = setInterval(() => {
      setTransitionCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setShowNextTransition(false);
          if (hasNextEpisode()) {
            playNextEpisode();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showNextTransition]);

  // Save player layout preferences when toggled
  useEffect(() => {
    const savedPrefs = localStorage.getItem('aylin_player_prefs');
    let prefs: any = {};
    if (savedPrefs) {
      try {
        prefs = JSON.parse(savedPrefs);
      } catch {}
    }
    prefs.theatreMode = theatreMode;
    prefs.cinemaMode = cinemaMode;
    localStorage.setItem('aylin_player_prefs', JSON.stringify(prefs));
  }, [theatreMode, cinemaMode]);

  // Toggle bookmark function
  const toggleBookmark = () => {
    const profile = localStorage.getItem('aylin_active_profile') || 'Utama';
    const bookKey = getScopedKey('aylin_bookmarks', profile);
    const saved = localStorage.getItem(bookKey);
    let list: BookmarkedItem[] = [];
    if (saved) {
      try {
        list = JSON.parse(saved);
      } catch {
        // Ignore JSON error
      }
    }

    if (isBookmarked) {
      list = list.filter((item) => !(item.slug === slug && item.type === type));
      setIsBookmarked(false);
    } else {
      list.push({
        title: data.title,
        slug: slug,
        img: data.img,
        type: type,
        ep: data.episodes[0]?.title || 'Release'
      });
      setIsBookmarked(true);
    }
    localStorage.setItem(bookKey, JSON.stringify(list));
  };

  // Helper to save preferred mirror to preferences
  const savePreferredMirror = (mirrorName: string) => {
    const savedPrefs = localStorage.getItem('aylin_player_prefs');
    let prefs: any = {};
    if (savedPrefs) {
      try {
        prefs = JSON.parse(savedPrefs);
      } catch {}
    }
    prefs.preferredPlayerText = mirrorName;
    localStorage.setItem('aylin_player_prefs', JSON.stringify(prefs));
  };

  /**
   * Determines whether a player embed src URL should be routed through
   * our server-side stream-proxy to bypass domain-based hotlink protection.
   * Any domain that isn't a well-known public embed service is proxied.
   */
  const wrapWithProxy = (src: string): string => {
    if (!src) return src;
    try {
      const parsed = new URL(src);
      const hostname = parsed.hostname;
      // Public video hosts that do NOT block by Referer — proxy not needed
      const publicHosts = [
        'ok.ru', 'odnoklassniki.ru',
        'dailymotion.com', 'dai.ly',
        'youtube.com', 'youtu.be',
        'drive.google.com', 'docs.google.com',
        'streamtape.com', 'streamtape.net',
        'doodstream.com', 'dood.watch',
        'filemoon.sx', 'filemoon.in',
        'fembed.com', 'fembed.net',
        'mega.nz',
      ];
      const needsProxy = !publicHosts.some(host =>
        hostname === host || hostname.endsWith('.' + host)
      );
      if (needsProxy) {
        let refererParam = '';
        if (activeSource === 'cadangan') {
          refererParam = type === 'donghua' ? 'https://animexin.dev' : 'https://v2.samehadaku.how';
        } else if (type === 'donghua') {
          refererParam = 'https://anichin.moe';
        } else if (type === 'drama') {
          refererParam = 'https://tv48.juragan.film';
        } else {
          refererParam = 'https://otakudesu.cloud';
        }
        return `/api/stream-proxy?url=${encodeURIComponent(src)}&referer=${encodeURIComponent(refererParam)}`;
      }
      return src;
    } catch {
      return src;
    }
  };

  // Switch source dynamically between Utama and Cadangan (AnimeXin/Samehadaku)
  const handleSourceChange = async (source: 'utama' | 'cadangan' | 'alternatif') => {
    setActiveSource(source);
    setEpisodeLoading(true);
    setMirrors([]);
    setActiveMirror(null);
    setPlayerSrc('');
    setError('');

    if (source === 'utama') {
      setData(initialData);
      // Auto load default episode from utama
      if (initialData.episodes && initialData.episodes.length > 0) {
        const defaultEp = type === 'drama' 
          ? initialData.episodes[0] 
          : initialData.episodes[initialData.episodes.length - 1];
        loadEpisode(defaultEp);
      }
      return;
    }

    try {
      let provider = '';
      if (source === 'cadangan') {
        provider = type === 'donghua' ? 'animexin' : 'samehadaku';
      } else if (source === 'alternatif') {
        provider = type === 'donghua' ? 'donghuastream' : '';
      }
      
      if (!provider) {
        throw new Error('Sumber alternatif belum didukung untuk kategori ini.');
      }
      
      // Step 1: Search for this series title on the backup provider
      const searchRes = await fetch(`/api/search?q=${encodeURIComponent(initialData.title)}&source=${provider}`);
      const searchJson = await searchRes.json();
      
      if (!searchJson.success || !searchJson.results || searchJson.results.length === 0) {
        throw new Error(`Seri "${initialData.title}" tidak ditemukan di sumber cadangan.`);
      }

      // Find exact title match, or default to first result
      const bestMatch = searchJson.results.find((r: any) => 
        r.title.toLowerCase().replace(/sub\s+indo/i, '').trim() === initialData.title.toLowerCase().trim()
      ) || searchJson.results[0];
      
      const alternativeSlug = bestMatch.slug;

      // Step 2: Fetch details of this alternative series slug
      const detailRes = await fetch(`/api/anime/${alternativeSlug}?type=${type}&source=${provider}`);
      const detailJson = await detailRes.json();

      if (!detailJson.success || !detailJson.data) {
        throw new Error('Gagal mengambil rincian seri dari sumber cadangan.');
      }

      const updatedData: AnimeDetail = {
        ...detailJson.data,
        title: initialData.title, // keep clean title
        type: type as 'anime' | 'donghua' | 'drama'
      };

      setData(updatedData);

      // Step 3: Auto-select and load the closest matching episode
      if (updatedData.episodes && updatedData.episodes.length > 0) {
        // Find episode matching the number of the last active episode, or default to first/last
        let targetEp = null;
        if (activeEpisode) {
          const actEpNumMatch = activeEpisode.title.match(/Episode\s+(\d+)/i) || activeEpisode.title.match(/Ep\s+(\d+)/i);
          if (actEpNumMatch) {
            const epNum = actEpNumMatch[1];
            targetEp = updatedData.episodes.find(ep => 
              ep.title.includes(`Episode ${epNum}`) || ep.title.includes(`Ep ${epNum}`) || ep.slug.includes(`-episode-${epNum}-`) || ep.slug.includes(`-ep-${epNum}-`)
            );
          }
        }

        if (!targetEp) {
          targetEp = type === 'drama' 
            ? updatedData.episodes[0] 
            : updatedData.episodes[updatedData.episodes.length - 1];
        }

        loadEpisode(targetEp);
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghubungkan ke sumber cadangan.';
      setError(msg);
      setActiveSource('utama');
      setData(initialData);
      
      // Fallback load default episode from utama
      if (initialData.episodes && initialData.episodes.length > 0) {
        const defaultEp = type === 'drama' 
          ? initialData.episodes[0] 
          : initialData.episodes[initialData.episodes.length - 1];
        loadEpisode(defaultEp);
      }
    } finally {
      setEpisodeLoading(false);
    }
  };

  // Load episode and fetch mirrors
  const loadEpisode = async (episode: EpisodeLink) => {
    setActiveEpisode(episode);
    setEpisodeLoading(true);
    setMirrors([]);
    setActiveMirror(null);
    setPlayerSrc('');
    setError('');

    // Update query parameter dynamically in the URL
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('ep', episode.slug);
        window.history.replaceState({ ...window.history.state, as: url.pathname + url.search, url: url.pathname + url.search }, '', url.toString());
      } catch (e) {}
    }

    // Reset Auto-Next timer parameters
    setElapsedTime(0);
    setShowNextTransition(false);
    setTransitionCountdown(5);
    setIsTimerPaused(false);
    const duration = type === 'donghua' ? 900 : type === 'drama' ? 2700 : 1320;
    setEpisodeDuration(duration);

    // --- Save Watch History ---
    try {
      const profile = localStorage.getItem('aylin_active_profile') || 'Utama';
      const histKey = getScopedKey('aylin_history', profile);
      const historyJson = localStorage.getItem(histKey);
      let historyList: any[] = [];
      if (historyJson) {
        historyList = JSON.parse(historyJson);
      }
      
      // Remove any existing entry for this series slug to move it to the top
      historyList = historyList.filter((item: any) => !(item.slug === slug && item.type === type));
      
      // Prepend the new watch history entry
      historyList.unshift({
        title: data.title,
        slug: slug,
        img: data.img,
        type: type,
        lastEpTitle: episode.title,
        lastEpSlug: episode.slug,
        timestamp: Date.now()
      });
      
      // Limit to 12 items
      if (historyList.length > 12) {
        historyList = historyList.slice(0, 12);
      }
      localStorage.setItem(histKey, JSON.stringify(historyList));
    } catch (e) {
      console.error("Failed to save watch history:", e);
    }

    // --- Save Watched Episode Progress ---
    try {
      const profile = localStorage.getItem('aylin_active_profile') || 'Utama';
      const watchedKey = getScopedKey('aylin_watched_episodes', profile);
      const watchedJson = localStorage.getItem(watchedKey);
      let watchedMap: Record<string, string[]> = {};
      if (watchedJson) {
        watchedMap = JSON.parse(watchedJson);
      }
      if (!watchedMap[slug]) {
        watchedMap[slug] = [];
      }
      if (!watchedMap[slug].includes(episode.slug)) {
        watchedMap[slug].push(episode.slug);
      }
      localStorage.setItem(watchedKey, JSON.stringify(watchedMap));
      setWatchedEpisodes(watchedMap[slug]);
    } catch (e) {
      console.error("Failed to save watched episodes:", e);
    }

    try {
      const provider = activeSource === 'cadangan' 
        ? (type === 'donghua' ? 'animexin' : 'samehadaku') 
        : activeSource === 'alternatif'
          ? (type === 'donghua' ? 'donghuastream' : '')
          : '';
      const res = await fetch(`/api/episode?type=${type}&slug=${episode.slug}${provider ? `&source=${provider}` : ''}`);
      const json = await res.json();
      
      if (!json.success || !json.data) {
        setError('Gagal memuat player video untuk episode ini.');
        return;
      }

      const fetchedMirrors = json.data.mirrors || [];
      setMirrors(fetchedMirrors);

      if (fetchedMirrors.length > 0) {
        // Auto-select preferred mirror or fallback to first mirror
        let selectedMirror = fetchedMirrors[0];
        const savedPrefs = localStorage.getItem('aylin_player_prefs');
        if (savedPrefs) {
          try {
            const prefs = JSON.parse(savedPrefs);
            if (prefs.preferredPlayerText) {
              const matched = fetchedMirrors.find((m: MirrorItem) => m.playerText === prefs.preferredPlayerText);
              if (matched) {
                selectedMirror = matched;
              }
            }
          } catch {}
        }
        
        setActiveMirror(selectedMirror);
        
        if (type === 'donghua' || type === 'drama') {
          // Anichin and Juraganfilm use direct iframe sources — route via proxy to bypass hotlink protection
          if (selectedMirror.payload.src) {
            setPlayerSrc(wrapWithProxy(selectedMirror.payload.src));
          }
        } else {
          // Otakudesu needs mirror resolution
          await resolveMirrorLink(episode.slug, selectedMirror);
        }
      } else {
        setError('Tidak ada server video yang tersedia.');
      }
    } catch (e) {
      console.error(e);
      setError('Terjadi kesalahan jaringan.');
    } finally {
      setEpisodeLoading(false);
    }
  };

  // Resolve Otakudesu mirror link
  const resolveMirrorLink = async (epSlug: string, mirror: MirrorItem) => {
    setPlayerLoading(true);
    setPlayerSrc('');
    setError('');

    try {
      const { id, i, q } = mirror.payload;
      const res = await fetch(`/api/episode?type=anime&slug=${epSlug}&id=${id}&i=${i}&q=${q}`);
      const json = await res.json();

      if (json.success && json.src) {
        setPlayerSrc(json.src);
      } else {
        setError('Gagal menghubungkan ke server video. Silakan pilih server/kualitas alternatif.');
      }
    } catch (e) {
      console.error(e);
      setError('Kesalahan saat memuat mirror player.');
    } finally {
      setPlayerLoading(false);
    }
  };

  // Handle mirror click
  const selectMirror = async (mirror: MirrorItem) => {
    if (!activeEpisode) return;
    setActiveMirror(mirror);
    savePreferredMirror(mirror.playerText);
    
    if (type === 'donghua' || type === 'drama') {
      if (mirror.payload.src) {
        setPlayerSrc(wrapWithProxy(mirror.payload.src));
      }
    } else {
      await resolveMirrorLink(activeEpisode.slug, mirror);
    }
  };

  // Episode Navigation Helpers
  const hasNextEpisode = () => {
    if (!activeEpisode || !data.episodes) return false;
    const idx = data.episodes.findIndex(ep => ep.slug === activeEpisode.slug);
    if (idx === -1) return false;
    return type === 'drama' ? idx < data.episodes.length - 1 : idx > 0;
  };

  const hasPrevEpisode = () => {
    if (!activeEpisode || !data.episodes) return false;
    const idx = data.episodes.findIndex(ep => ep.slug === activeEpisode.slug);
    if (idx === -1) return false;
    return type === 'drama' ? idx > 0 : idx < data.episodes.length - 1;
  };

  const playNextEpisode = () => {
    if (!hasNextEpisode() || !activeEpisode || !data.episodes) return;
    const idx = data.episodes.findIndex(ep => ep.slug === activeEpisode.slug);
    const nextEp = type === 'drama' ? data.episodes[idx + 1] : data.episodes[idx - 1];
    loadEpisode(nextEp);
  };

  const playPrevEpisode = () => {
    if (!hasPrevEpisode() || !activeEpisode || !data.episodes) return;
    const idx = data.episodes.findIndex(ep => ep.slug === activeEpisode.slug);
    const prevEp = type === 'drama' ? data.episodes[idx - 1] : data.episodes[idx + 1];
    loadEpisode(prevEp);
  };

  // Auto-play the first episode on mount (or load from URL if 'ep' param exists)
  useEffect(() => {
    if (data.episodes && data.episodes.length > 0) {
      let targetEp = null;
      if (typeof window !== 'undefined') {
        const searchParams = new URLSearchParams(window.location.search);
        const epParam = searchParams.get('ep');
        if (epParam) {
          targetEp = data.episodes.find(ep => ep.slug === epParam);
        }
      }

      // Fallback to default episode if not specified or not found in list
      if (!targetEp) {
        targetEp = type === 'drama' 
          ? data.episodes[0] 
          : data.episodes[data.episodes.length - 1]; // Anime/Donghua release lists are in reverse order
      }

      const timer = setTimeout(() => {
        loadEpisode(targetEp);
      }, 0);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.episodes, type]);

  return (
    <div className="flex flex-col min-h-screen pb-16 relative">
      {/* Cinema Mode Dimming Overlay */}
      {cinemaMode && (
        <div 
          className="fixed inset-0 bg-black/95 z-40 transition-opacity duration-300"
          onClick={() => setCinemaMode(false)}
        />
      )}

      {/* Header Bar */}
      <nav className={`w-full glass-nav px-4 sm:px-8 py-3 flex items-center justify-between gap-4 z-50 ${cinemaMode ? 'relative' : 'sticky top-0'}`}>
        <div className="flex items-center gap-4 sm:gap-6 flex-shrink-0">
          <Link href="/" className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors">
            <ArrowLeft size={18} />
            <span className="text-sm font-semibold">Dashboard</span>
          </Link>
          <Link href="/catalog" className="text-sm font-semibold text-slate-400 hover:text-white transition-colors hidden xs:inline">
            Katalog A-Z
          </Link>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md w-full flex-1">
          <div className="flex items-center bg-slate-900/80 border border-slate-800 rounded-full px-3 py-1.5 focus-within:border-violet-500/50 transition-colors">
            <Search size={16} className="text-slate-400 mr-2 flex-shrink-0" />
            <input
              type="text"
              placeholder="Cari anime, donghua..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="bg-transparent text-xs text-slate-100 outline-none w-full placeholder-slate-500 font-medium"
            />
            {searchQuery && (
              <button onClick={clearSearch} className="text-slate-400 hover:text-slate-200 cursor-pointer flex-shrink-0">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Search Result Dropdown Overlay */}
          {searchOpen && (
            <div className="absolute left-0 right-0 mt-3 bg-slate-950/95 border border-slate-905 rounded-2xl p-4 shadow-2xl z-50 backdrop-blur-md max-h-[380px] overflow-y-auto animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-805/80 pb-2 mb-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hasil Pencarian</span>
                <span className="text-[10px] text-slate-500">{searchResults.length} ditemukan</span>
              </div>

              {searchLoading ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-[10px] text-slate-400">Sedang mencari...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-500">
                  Tidak ada hasil ditemukan
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {searchResults.map((item) => (
                    <Link
                      key={`${item.type}-${item.slug}`}
                      href={`/watch/${item.type}/${item.slug}`}
                      onClick={() => clearSearch()}
                      className="flex items-center gap-3 p-1.5 hover:bg-white/5 rounded-xl transition-colors group"
                    >
                      <div className="relative w-9 h-12 rounded bg-slate-900 flex-shrink-0 overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={item.img ? `/api/image-proxy?url=${encodeURIComponent(item.img)}` : undefined} 
                          alt={item.title} 
                          className="object-cover w-full h-full group-hover:scale-105 transition-transform" 
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-200 truncate group-hover:text-violet-400 transition-colors">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[8px] px-1 py-0.2 rounded font-extrabold uppercase ${
                            item.type === 'donghua' 
                              ? 'bg-fuchsia-950 text-fuchsia-400 border border-fuchsia-800/20' 
                              : item.type === 'drama'
                                ? 'bg-rose-950 text-rose-400 border border-rose-800/20'
                                : 'bg-violet-950 text-violet-400 border border-violet-800/20'
                          }`}>
                            {item.type}
                          </span>
                        </div>
                      </div>
                      <ArrowUpRight size={14} className="text-slate-500 group-hover:text-violet-400 transition-colors" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Profile Switcher */}
        {mounted && (
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-1.5 p-1 bg-slate-900/60 border border-slate-805 rounded-full hover:border-slate-700 transition-all cursor-pointer"
              title={`Profil aktif: ${activeProfile}`}
            >
              <div className={`w-7 h-7 rounded-full bg-gradient-to-tr ${profiles.find(p => p.name === activeProfile)?.color || 'from-violet-500 to-indigo-500'} flex items-center justify-center text-[10px] font-black text-white uppercase shadow-md`}>
                {activeProfile.substring(0, 2)}
              </div>
              <ChevronDown size={12} className="text-slate-400 mr-1" />
            </button>

            {isProfileOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-slate-950/95 border border-slate-900 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-2 z-50 backdrop-blur-md animate-fade-in">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-2">Ganti Profil</span>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto scrollbar-thin">
                  {profiles.map(p => (
                    <div key={`profile-opt-${p.name}`} className="flex items-center justify-between group/profile">
                      <button
                        onClick={() => {
                          setActiveProfile(p.name);
                          localStorage.setItem('aylin_active_profile', p.name);
                          setIsProfileOpen(false);
                        }}
                        className={`flex-1 flex items-center gap-2.5 p-1.5 rounded-xl text-left text-xs font-bold transition-all cursor-pointer ${
                          activeProfile === p.name 
                            ? 'bg-white/5 text-white' 
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-gradient-to-tr ${p.color} flex items-center justify-center text-[8px] text-white uppercase`}>
                          {p.name.substring(0, 2)}
                        </div>
                        <span className="truncate">{p.name}</span>
                      </button>
                      {p.name !== 'Utama' && (
                        <button
                          onClick={() => handleRemoveProfile(p.name)}
                          className="p-1 text-slate-605 hover:text-rose-500 opacity-0 group-hover/profile:opacity-100 transition-all cursor-pointer mr-1"
                          title="Hapus Profil"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Profile Section */}
                <div className="border-t border-slate-900 pt-2 mt-1 flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 bg-slate-900/60 rounded-xl px-2 py-1 border border-slate-800 focus-within:border-violet-500/50">
                    <input
                      type="text"
                      placeholder="Profil baru..."
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      className="bg-transparent text-[10px] text-slate-200 outline-none w-full placeholder-slate-600 font-bold animate-fade-in"
                      maxLength={12}
                    />
                    <button
                      onClick={() => {
                        if (newProfileName.trim()) {
                          const grads = [
                            'from-violet-500 to-indigo-500',
                            'from-rose-500 to-pink-500',
                            'from-emerald-500 to-teal-500',
                            'from-amber-500 to-orange-500',
                            'from-sky-500 to-blue-500'
                          ];
                          const selectedGrad = grads[Math.floor(Math.random() * grads.length)];
                          handleAddProfile(newProfileName, selectedGrad);
                          setNewProfileName('');
                        }
                      }}
                      className="p-1 bg-violet-605 hover:bg-violet-700 rounded-md text-white transition-colors cursor-pointer"
                      title="Tambah"
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>

                {/* Theme Selector */}
                <div className="border-t border-slate-900 pt-2 mt-1 flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider px-2">Pilih Tema</span>
                  <div className="grid grid-cols-3 gap-1 px-1">
                    {[
                      { id: 'theme-neon-purple', label: 'Violet', swatch1: '#8b5cf6', swatch2: '#d946ef' },
                      { id: 'theme-light-mode', label: 'Terang ☀️', swatch1: '#f5f3ff', swatch2: '#c4b5fd' },
                      { id: 'theme-neon-green', label: 'Green', swatch1: '#10b981', swatch2: '#14b8a6' },
                      { id: 'theme-cyberpunk-orange', label: 'Cyberpunk', swatch1: '#f97316', swatch2: '#f59e0b' },
                      { id: 'theme-crimson-red', label: 'Red', swatch1: '#f43f5e', swatch2: '#ef4444' },
                      { id: 'theme-ocean-blue', label: 'Ocean', swatch1: '#0ea5e9', swatch2: '#06b6d4' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id as any, activeProfile)}
                        title={`Tema ${t.label}`}
                        className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all cursor-pointer ${
                          theme === t.id
                            ? 'bg-white/10 ring-1 ring-white/10 scale-105'
                            : 'hover:bg-white/5 opacity-75 hover:opacity-100'
                        }`}
                        type="button"
                      >
                        <div
                          className="w-5 h-5 rounded-full shadow-md border border-white/10"
                          style={{ background: `linear-gradient(135deg, ${t.swatch1}, ${t.swatch2})` }}
                        />
                        <span className="text-[8px] font-bold text-slate-400 leading-tight text-center">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Main Watch Page Body */}
      <div className={`w-full mx-auto px-4 sm:px-8 py-6 flex flex-col gap-6 z-50 ${theatreMode ? '' : 'max-w-7xl'}`}>
        
        {/* Layout Split container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Player + Episode list (col-span-8 or col-span-12) */}
          <div className={`${theatreMode ? 'lg:col-span-12' : 'lg:col-span-8'} flex flex-col gap-4`}>
            
            {/* Player Container */}
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/5 shadow-2xl">
              {episodeLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-slate-400">Menyiapkan episode...</span>
                </div>
              ) : playerLoading ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 border-2 border-fuchsia-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-slate-400">Menghubungkan ke streaming server...</span>
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center gap-3">
                  <AlertTriangle size={36} className="text-amber-500 animate-pulse" />
                  <span className="text-sm font-semibold text-slate-300">{error}</span>
                  <button 
                    onClick={() => activeEpisode && loadEpisode(activeEpisode)}
                    className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-full text-xs hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw size={12} /> Coba Lagi
                  </button>
                </div>
              ) : playerSrc ? (
                <>
                  <iframe
                    src={playerSrc}
                    className="w-full h-full border-0"
                    allowFullScreen
                    scrolling="no"
                    referrerPolicy="no-referrer"
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups allow-top-navigation"
                  />

                  {/* Floating Skip Intro Button */}
                  {elapsedTime < 90 && !episodeLoading && !playerLoading && !error && (
                    <button
                      onClick={() => {
                        setElapsedTime(90);
                        alert("Petunjuk Lewati Intro:\n\nKarena batasan keamanan browser (Cross-Origin), pemutar video eksternal tidak dapat melompati video secara otomatis.\n\nSilakan klik atau geser tombol durasi di bagian bawah pemutar video ke menit 1:30 untuk melewati intro.");
                      }}
                      className="absolute bottom-4 left-4 z-30 bg-violet-600/90 border border-violet-500 hover:bg-violet-500 text-white font-extrabold px-4 py-2 rounded-xl shadow-2xl backdrop-blur-md text-xs transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer animate-pulse"
                      title="Petunjuk cara melewati intro video"
                    >
                      ⏭️ Lewati Intro (90s)
                    </button>
                  )}

                  {/* Floating Auto-Next Overlay */}
                  {isAutoNextEnabled && !episodeLoading && !playerLoading && !error && (
                    <div className="absolute top-4 right-4 z-30 bg-slate-950/90 border border-white/10 px-3.5 py-2.5 rounded-2xl shadow-2xl flex flex-col gap-2 backdrop-blur-md max-w-[200px] text-xs transition-opacity duration-300 hover:opacity-100 opacity-60">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider">Pemutar Pintar</span>
                        <button 
                          onClick={() => setIsTimerPaused(!isTimerPaused)}
                          className="text-violet-400 hover:text-violet-300 font-bold"
                        >
                          {isTimerPaused ? 'Mulai' : 'Jeda'}
                        </button>
                      </div>
                      
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between font-mono font-bold text-slate-200">
                          <span>{Math.floor(elapsedTime / 60)}:{String(elapsedTime % 60).padStart(2, '0')}</span>
                          <span className="text-slate-500">/</span>
                          <span>{Math.floor(episodeDuration / 60)}:{String(episodeDuration % 60).padStart(2, '0')}</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className="bg-gradient-to-r from-violet-500 to-fuchsia-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (elapsedTime / episodeDuration) * 100)}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5">
                        <button
                          onClick={() => {
                            setElapsedTime(prev => Math.min(episodeDuration, prev + 90));
                          }}
                          className="flex-1 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-bold text-slate-300 transition-colors cursor-pointer"
                          title="Lompati 90 detik (Skip Intro)"
                        >
                          ⏭️ Skip 90s
                        </button>
                        <button
                          onClick={() => {
                            const newDurStr = prompt("Masukkan durasi episode (menit):", String(Math.floor(episodeDuration / 60)));
                            if (newDurStr) {
                              const val = parseFloat(newDurStr);
                              if (!isNaN(val) && val > 0) {
                                setEpisodeDuration(Math.round(val * 60));
                                setElapsedTime(0);
                              }
                            }
                          }}
                          className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-bold text-slate-400 transition-colors cursor-pointer"
                          title="Ubah Durasi"
                        >
                          ⚙️
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Auto-Next Transition Overlay */}
                  {showNextTransition && (
                    <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center animate-fade-in">
                      <div className="relative w-20 h-20 flex items-center justify-center mb-4">
                        <div className="absolute inset-0 rounded-full border-4 border-violet-500/20 border-t-violet-500 animate-spin" />
                        <span className="text-2xl font-black text-white z-10">
                          {transitionCountdown}
                        </span>
                      </div>
                      
                      {hasNextEpisode() ? (
                        <>
                          <h3 className="text-lg font-bold text-slate-100 mb-1">Memutar Episode Berikutnya</h3>
                          <p className="text-xs text-slate-400 mb-6 max-w-sm">
                            Anda sedang menonton <span className="font-bold text-violet-400">{data.title}</span>. Episode berikutnya akan dimulai otomatis.
                          </p>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => setShowNextTransition(false)}
                              className="px-5 py-2 bg-slate-900 border border-slate-800 text-xs font-bold text-slate-400 rounded-full hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              Batal
                            </button>
                            <button
                              onClick={() => {
                                setShowNextTransition(false);
                                playNextEpisode();
                              }}
                              className="px-5 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-xs font-bold text-white rounded-full hover:scale-105 transition-all shadow-lg glow-purple cursor-pointer"
                            >
                              Putar Sekarang
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="text-lg font-bold text-slate-100 mb-1">Episode Terakhir Selesai</h3>
                          <p className="text-xs text-slate-400 mb-6 max-w-sm">
                            Selamat! Anda telah selesai menonton seluruh daftar episode <span className="font-bold text-violet-400">{data.title}</span>.
                          </p>
                          <button
                            onClick={() => setShowNextTransition(false)}
                            className="px-6 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-xs font-bold text-white rounded-full hover:scale-105 transition-all shadow-lg glow-purple cursor-pointer"
                          >
                            Selesai
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <Play size={36} className="text-slate-600 animate-pulse" />
                  <span className="text-xs text-slate-500">Pilih episode untuk memutar video</span>
                </div>
              )}
            </div>

            {/* Video Controls / Switches */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 glass-card rounded-2xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 mr-2">SERVER STREAM:</span>
                {mirrors.length === 0 ? (
                  <span className="text-xs text-slate-600">Tidak ada mirror</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {mirrors.map((m, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectMirror(m)}
                        className={`text-xs px-3 py-1 rounded-full font-bold uppercase transition-all ${
                          activeMirror === m 
                            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-md' 
                            : 'bg-white/5 text-slate-400 hover:bg-white/10'
                        }`}
                      >
                        {m.playerText} ({m.quality})
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Switches */}
              <div className="flex items-center gap-3">
                {/* Navigation Buttons */}
                <div className="flex items-center gap-1.5 mr-2 pr-2 border-r border-white/5">
                  <button
                    onClick={playPrevEpisode}
                    disabled={!hasPrevEpisode()}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                      hasPrevEpisode()
                        ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer'
                        : 'bg-white/5 border-transparent text-slate-600 cursor-not-allowed'
                    }`}
                    title="Episode Sebelumnya"
                  >
                    ◀ Prev
                  </button>
                  <button
                    onClick={playNextEpisode}
                    disabled={!hasNextEpisode()}
                    className={`p-2.5 rounded-xl text-xs font-bold border transition-all ${
                      hasNextEpisode()
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 border-transparent text-white shadow-md hover:scale-105 cursor-pointer'
                        : 'bg-white/5 border-transparent text-slate-600 cursor-not-allowed'
                    }`}
                    title="Episode Berikutnya"
                  >
                    Next ▶
                  </button>
                </div>

                <button
                  onClick={() => setIsAutoNextEnabled(!isAutoNextEnabled)}
                  className={`p-2.5 rounded-xl transition-all border text-xs font-bold flex items-center gap-1.5 ${
                    isAutoNextEnabled 
                      ? 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400 shadow-md glow-fuchsia' 
                      : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                  }`}
                  title="Auto-Next & Skip Intro Controller"
                >
                  ⏭️ {isAutoNextEnabled ? 'Auto-Next Aktif' : 'Auto-Next'}
                </button>
                <button
                  onClick={() => setCinemaMode(!cinemaMode)}
                  className={`p-2 rounded-xl transition-all border ${
                    cinemaMode 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-md' 
                      : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                  }`}
                  title="Cinema Mode (Matikan Lampu)"
                >
                  <Lightbulb size={16} />
                </button>
                <button
                  onClick={() => setTheatreMode(!theatreMode)}
                  className={`p-2 rounded-xl transition-all border hidden lg:inline-block ${
                    theatreMode 
                      ? 'bg-violet-500/10 border-violet-500/30 text-violet-400 shadow-md' 
                      : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                  }`}
                  title="Theater Mode"
                >
                  {theatreMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>

            {/* Keyboard Shortcuts Tooltip Legend */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-2.5 bg-slate-900/30 border border-white/5 rounded-2xl text-[10px] text-slate-500 font-medium">
              <span className="font-bold uppercase tracking-wider text-slate-400">Pintasan Keyboard (Hotkeys):</span>
              <span><kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-slate-400">N</kbd> Episode Baru</span>
              <span><kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-slate-400">P</kbd> Episode Lama</span>
              <span><kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-slate-400">T</kbd> Theater Mode</span>
              <span><kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-slate-400">C</kbd> Cinema Mode</span>
              <span><kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded font-mono text-slate-400">B</kbd> Bookmark</span>
            </div>

            {/* Episode List Container */}
            <div className="flex flex-col gap-4 p-5 glass-card rounded-2xl">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <List size={18} className="text-violet-400" />
                <span className="font-bold text-sm text-slate-200">Daftar Episode</span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-[220px] overflow-y-auto pr-2">
                {data.episodes.map((ep, idx) => (
                  <button
                    key={ep.slug}
                    onClick={() => loadEpisode(ep)}
                    className={`p-2.5 rounded-xl border text-xs font-extrabold transition-all truncate text-center flex items-center justify-center gap-1.5 ${
                      activeEpisode?.slug === ep.slug
                        ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 border-transparent text-white shadow-md'
                        : watchedEpisodes.includes(ep.slug)
                          ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/40'
                          : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:border-white/10'
                    }`}
                  >
                    {watchedEpisodes.includes(ep.slug) && activeEpisode?.slug !== ep.slug && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
                    )}
                    {getCleanEpisodeNumber(ep.title, data.episodes.length - idx)}
                  </button>
                ))}
              </div>
            </div>

          </div>

          {/* Sidebar Series Details (col-span-4) */}
          <div className={`${theatreMode ? 'lg:col-span-12 grid grid-cols-1 md:grid-cols-12 gap-6' : 'lg:col-span-4'} flex flex-col gap-6 w-full`}>
            
            {/* Poster Card */}
            <div className={`${theatreMode ? 'md:col-span-4' : ''} glass-card rounded-3xl overflow-hidden p-4 flex flex-col gap-4`}>
              <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-slate-900 shadow-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.img ? `/api/image-proxy?url=${encodeURIComponent(data.img)}` : undefined} alt={data.title} className="object-cover w-full h-full" />
              </div>
              
              <div className="flex flex-col gap-3">
                <button
                  onClick={toggleBookmark}
                  className={`w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full text-xs font-extrabold uppercase transition-all ${
                    isBookmarked
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white shadow-md'
                  }`}
                >
                  <Star size={14} className={isBookmarked ? "fill-white" : ""} />
                  {isBookmarked ? 'Tersimpan di Bookmark' : 'Tambah Ke Bookmark'}
                </button>
              </div>
            </div>

            {/* Info Card */}
            <div className={`${theatreMode ? 'md:col-span-8' : ''} glass-card rounded-3xl p-6 flex flex-col gap-5`}>
              <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
                <div className="flex flex-col gap-2">
                  <span className={`text-[10px] font-bold uppercase w-max px-2.5 py-0.5 rounded-full border ${
                    type === 'donghua' ? 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-800/30' : 'bg-violet-950/80 text-violet-300 border-violet-800/30'
                  }`}>
                    {type}
                  </span>
                  <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight leading-snug">
                    {data.title}
                  </h2>
                </div>
                
                {/* Source Selector Dropdown */}
                {type !== 'drama' && (
                  <div className="flex flex-col gap-1 items-end ml-auto">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sumber Video</span>
                    <select
                      value={activeSource}
                      onChange={(e) => handleSourceChange(e.target.value as 'utama' | 'cadangan' | 'alternatif')}
                      className="bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 rounded-full px-3 py-1.5 focus:border-violet-500 outline-none cursor-pointer hover:border-slate-700 transition-colors"
                    >
                      <option value="utama">{type === 'donghua' ? 'Anichin (Utama)' : 'Otakudesu (Utama)'}</option>
                      <option value="cadangan">{type === 'donghua' ? 'AnimeXin (Cadangan)' : 'Samehadaku (Cadangan)'}</option>
                      {type === 'donghua' && (
                        <option value="alternatif">DonghuaStream (Alternatif)</option>
                      )}
                    </select>
                  </div>
                )}
              </div>

              {/* Synopsis */}
              {data.synopsis && (
                <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                  <span className="text-xs font-bold text-slate-400">SINOPSIS:</span>
                  <p className="text-xs text-slate-300 leading-relaxed max-h-[140px] overflow-y-auto pr-2">
                    {data.synopsis}
                  </p>
                </div>
              )}

              {/* Details table */}
              <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
                <span className="text-xs font-bold text-slate-400">INFORMASI TAMBAHAN:</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {data.details.map((detail, idx) => (
                    <span 
                      key={idx} 
                      className="text-[10px] bg-white/5 border border-white/5 px-3 py-1 rounded-full text-slate-300 font-medium"
                    >
                      {detail}
                    </span>
                  ))}
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* Recommendations Section */}
        {recommendations.length > 0 && (
          <div className="flex flex-col gap-4 border-t border-white/5 pt-8 mt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Play size={14} className="text-violet-400 fill-violet-400" />
                <h3 className="font-extrabold text-sm sm:text-base text-slate-200 tracking-tight">
                  Rekomendasi Tayangan {type === 'donghua' ? 'Donghua' : type === 'drama' ? 'Drama' : 'Anime'} Terpopuler
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                Trending Hari Ini
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
              {recommendations.map((item) => (
                <Link
                  key={`rec-${item.slug}`}
                  href={`/watch/${type}/${item.slug}`}
                  className="flex flex-col gap-2 group cursor-pointer"
                >
                  <div className="relative aspect-[3/4] w-full rounded-2xl overflow-hidden bg-slate-900 shadow border border-white/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.img ? `/api/image-proxy?url=${encodeURIComponent(item.img)}` : undefined}
                      alt={item.title}
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-300"
                    />
                    {item.ep && (
                      <span className="absolute bottom-2 left-2 text-[9px] bg-slate-950/80 backdrop-blur border border-white/10 px-2 py-0.5 rounded-full text-slate-200 font-extrabold">
                        {item.ep}
                      </span>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-slate-300 group-hover:text-white transition-colors line-clamp-2 leading-snug px-1">
                    {item.title}
                  </h4>
                </Link>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
