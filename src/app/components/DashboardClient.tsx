'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  Play, Search, Star, Film, Tv, Clock, X, ArrowUpRight,
  Bell, BellOff, User, Plus, Trash2, ChevronDown, Palette
} from 'lucide-react';
import { AnimeCard } from '@/lib/stream-scraper';
import { useTheme, THEMES } from '../context/ThemeContext';

interface DashboardClientProps {
  initialAnime: AnimeCard[];
  initialDonghua: AnimeCard[];
  initialDrama: AnimeCard[];
}

export default function DashboardClient({ initialAnime, initialDonghua, initialDrama }: DashboardClientProps) {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AnimeCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Bookmarks state
  const [bookmarks, setBookmarks] = useState<AnimeCard[]>([]);

  // Filter, Sort & Genre States
  const [animeLetter, setAnimeLetter] = useState('ALL');
  const [animeSort, setAnimeSort] = useState<'latest' | 'az'>('latest');
  const [animeGenre, setAnimeGenre] = useState('ALL');

  const [donghuaLetter, setDonghuaLetter] = useState('ALL');
  const [donghuaSort, setDonghuaSort] = useState<'latest' | 'az'>('latest');
  const [donghuaGenre, setDonghuaGenre] = useState('ALL');
  const [donghuaStatus, setDonghuaStatus] = useState<'ALL' | 'Ongoing' | 'Completed'>('ALL');

  const [dramaLetter, setDramaLetter] = useState('ALL');
  const [dramaSort, setDramaSort] = useState<'latest' | 'az'>('latest');
  const [dramaGenre, setDramaGenre] = useState('ALL');
  const [dramaStatus, setDramaStatus] = useState<'ALL' | 'Ongoing' | 'Completed'>('ALL');

  // Filter & Sort Helper
  const filterAndSortList = (
    list: AnimeCard[], 
    letter: string, 
    sort: 'latest' | 'az', 
    genre: string,
    status: 'ALL' | 'Ongoing' | 'Completed'
  ) => {
    let result = [...list];
    
    // 1. Filter by Genre (client-side keywords mapping)
    if (genre !== 'ALL') {
      const lowerGenre = genre.toLowerCase();
      result = result.filter(item => {
        const titleLower = item.title.toLowerCase();
        if (lowerGenre === 'action') {
          return titleLower.includes('action') || titleLower.includes('fight') || titleLower.includes('wuxia') || titleLower.includes('battle') || titleLower.includes('war') || titleLower.includes('immortal') || titleLower.includes('martial') || titleLower.includes('academy') || titleLower.includes('sword') || titleLower.includes('hero');
        }
        if (lowerGenre === 'romance') {
          return titleLower.includes('romance') || titleLower.includes('love') || titleLower.includes('marry') || titleLower.includes('husband') || titleLower.includes('wife') || titleLower.includes('divorce') || titleLower.includes('blossoms') || titleLower.includes('sweet');
        }
        if (lowerGenre === 'comedy') {
          return titleLower.includes('comedy') || titleLower.includes('funny') || titleLower.includes('ghost') || titleLower.includes('brother') || titleLower.includes('twenty') || titleLower.includes('school');
        }
        if (lowerGenre === 'mystery') {
          return titleLower.includes('mystery') || titleLower.includes('bloody') || titleLower.includes('smart') || titleLower.includes('thriller') || titleLower.includes('detective') || titleLower.includes('death') || titleLower.includes('kill') || titleLower.includes('crime');
        }
        if (lowerGenre === 'kids') {
          return titleLower.includes('kids') || titleLower.includes('family') || titleLower.includes('animation') || titleLower.includes('toy') || titleLower.includes('bato') || titleLower.includes('cartoon') || titleLower.includes('children');
        }
        return true;
      });
    }

    // 1.5. Filter by Status (Heuristic based on title keywords)
    if (status !== 'ALL') {
      result = result.filter(item => {
        const titleLower = item.title.toLowerCase();
        const isCompleted = titleLower.includes('tamat') || titleLower.includes('complete') || titleLower.includes('movie') || titleLower.includes('ending') || titleLower.includes('season 1') || titleLower.includes('season 2');
        return status === 'Completed' ? isCompleted : !isCompleted;
      });
    }

    // 2. Filter by first letter
    if (letter !== 'ALL') {
      result = result.filter(item => {
        const firstChar = item.title.trim().charAt(0).toUpperCase();
        if (letter === '#') {
          return /[^A-Z]/.test(firstChar);
        }
        return firstChar === letter;
      });
    }

    // 3. Sort
    if (sort === 'az') {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  };

  // Render Helper for the Letter & Genre Filter Bar
  const renderFilterBar = (
    currentLetter: string,
    setLetter: (l: string) => void,
    currentSort: 'latest' | 'az',
    setSort: (s: 'latest' | 'az') => void,
    currentGenre: string,
    setGenre: (g: string) => void,
    currentStatus: 'ALL' | 'Ongoing' | 'Completed',
    setStatus: (s: 'ALL' | 'Ongoing' | 'Completed') => void,
    colorClass: string
  ) => {
    const letters = ['ALL', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'];
    const genres = [
      { id: 'ALL', label: 'Semua Kategori' },
      { id: 'action', label: '⚔️ Action & Fight' },
      { id: 'romance', label: '💖 Romance & Drama' },
      { id: 'comedy', label: '😂 Comedy & Fun' },
      { id: 'mystery', label: '🔍 Mystery & Thriller' },
      { id: 'kids', label: '🧸 Kids & Family' }
    ];
 
    return (
      <div className="flex flex-col gap-4 bg-slate-950/40 border border-slate-900/60 rounded-2xl p-4 transition-all">
        {/* Genre Selector Row */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">Pilih Kategori / Genre:</span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {genres.map((g) => (
              <button
                key={g.id}
                onClick={() => setGenre(g.id)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${
                  currentGenre === g.id
                    ? `${colorClass} text-white border-transparent shadow-md scale-105`
                    : 'bg-slate-900 border-slate-800/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
 
        {/* Letter, Status & Sort Selector Row */}
        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-900/40">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">Status:</span>
              <div className="flex items-center gap-1">
                {(['ALL', 'Ongoing', 'Completed'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatus(s)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border transition-all ${
                      currentStatus === s
                        ? `${colorClass} text-white border-transparent shadow-sm`
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {s === 'ALL' ? 'Semua' : s}
                  </button>
                ))}
              </div>
            </div>
          </div>
 
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSort('latest')}
              className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border transition-all ${
                currentSort === 'latest'
                  ? `${colorClass} text-white border-transparent shadow-sm`
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Update Terbaru
            </button>
            <button
              onClick={() => setSort('az')}
              className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border transition-all ${
                currentSort === 'az'
                  ? `${colorClass} text-white border-transparent shadow-sm`
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              Urutkan A-Z
            </button>
          </div>
        </div>
 
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {letters.map((char) => (
            <button
              key={char}
              onClick={() => setLetter(char)}
              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-xs font-extrabold transition-all border ${
                currentLetter === char
                  ? `${colorClass} text-white border-transparent shadow-lg scale-105`
                  : 'bg-slate-900 border-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {char}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Carousel state
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Featured slides for Carousel
  const featuredSlides = [
    {
      title: "Renegade Immortal (Xian Ni)",
      desc: "Perjalanan kultivasi Wang Lin yang kejam, penuh perjuangan dendam, dan takdir menjadi dewa abadi di dunia persilatan.",
      img: "https://anichin.moe/wp-content/uploads/2023/05/Shrouding.webp",
      slug: "renegade-immortal",
      type: "donghua",
      trailer: "https://www.youtube.com/embed/gS_p4T_PZfA"
    },
    {
      title: "Sora wa Akai Kawa no Hotori",
      desc: "Yuuri Suzuki terlempar ke Kekaisaran Hittite kuno akibat ritual sihir Ratu Nakia. Ikuti perjuangan cintanya di dunia pasir.",
      img: "https://otakudesu.blog/wp-content/uploads/2026/07/Sora-wa-Akai-Kawa-no-Hotori-Sub.jpg",
      slug: "sora-akai-kawa-hotori-sub-indo",
      type: "anime",
      trailer: "https://www.youtube.com/embed/9BqM2Wv9eXQ"
    },
    {
      title: "Swallowed Star (Tunshi Xingkong)",
      desc: "Ketika bencana mutasi virus menyelimuti bumi, Luo Feng bangkit melindungi umat manusia menggunakan ilmu bela diri luar angkasa.",
      img: "https://anichin.moe/wp-content/uploads/2025/05/Renegade-Immortal-Movie.webp",
      slug: "swallowed-star-season-4",
      type: "donghua",
      trailer: "https://www.youtube.com/embed/mKk39vU0PGo"
    }
  ];

  // Auto carousel rotation
  useEffect(() => {
    const timer = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % featuredSlides.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [featuredSlides.length]);

  interface HistoryItem {
    title: string;
    slug: string;
    img: string;
    type: 'anime' | 'donghua' | 'drama';
    lastEpTitle: string;
    lastEpSlug: string;
    timestamp: number;
  }

  interface ScheduleItem {
    title: string;
    slug: string;
    img: string;
    type: 'anime' | 'donghua' | 'drama';
    time: string;
  }

  const weeklySchedule: Record<string, ScheduleItem[]> = {
    "Senin": [
      {
        title: "Renegade Immortal (Xian Ni)",
        slug: "renegade-immortal",
        img: "https://anichin.moe/wp-content/uploads/2023/09/RENEGADE-IMMORTAL-SUBTITLE-INDONESIA-3.webp?resize=247,350",
        type: "donghua",
        time: "10:00 WIB"
      },
      {
        title: "Swallowed Star Season 4",
        slug: "swallowed-star-season-4",
        img: "https://anichin.moe/wp-content/uploads/2023/08/Swallowed-Star-S3.webp",
        type: "donghua",
        time: "09:30 WIB"
      }
    ],
    "Selasa": [
      {
        title: "Martial Universe Season 4",
        slug: "martial-universe-season-4",
        img: "https://anichin.moe/wp-content/uploads/2023/09/Martial-Universe-S4.webp",
        type: "donghua",
        time: "10:00 WIB"
      },
      {
        title: "No Game No Life",
        slug: "no-game-no-life-sub-indo",
        img: "https://otakudesu.blog/wp-content/uploads/2019/02/NGNL-Sub-Indo.jpg",
        type: "anime",
        time: "18:00 WIB"
      }
    ],
    "Rabu": [
      {
        title: "Throne of Seal (Shen Yin Wang Zuo)",
        slug: "throne-of-seal",
        img: "https://anichin.moe/wp-content/uploads/2023/05/Throne-of-Seal.webp",
        type: "donghua",
        time: "10:00 WIB"
      },
      {
        title: "Against the Gods",
        slug: "against-the-gods",
        img: "https://anichin.moe/wp-content/uploads/2023/09/Against-the-Gods.webp",
        type: "donghua",
        time: "11:00 WIB"
      }
    ],
    "Kamis": [
      {
        title: "The Great Ruler",
        slug: "the-great-ruler",
        img: "https://anichin.moe/wp-content/uploads/2023/07/The-Great-Ruler.webp",
        type: "donghua",
        time: "10:00 WIB"
      },
      {
        title: "Perfect World (Wanmei Shijie)",
        slug: "perfect-world",
        img: "https://anichin.moe/wp-content/uploads/2023/05/Perfect-World.webp",
        type: "donghua",
        time: "11:00 WIB"
      }
    ],
    "Jumat": [
      {
        title: "Shrouding the Heavens (Zhe Tian)",
        slug: "shrouding-the-heavens",
        img: "https://anichin.moe/wp-content/uploads/2023/05/Shrouding.webp",
        type: "donghua",
        time: "10:00 WIB"
      },
      {
        title: "Jujutsu Kaisen Season 2",
        slug: "jujutsu-kaisen-s2-sub-indo",
        img: "https://otakudesu.blog/wp-content/uploads/2023/07/JJK-S2-Sub-Indo.jpg",
        type: "anime",
        time: "23:00 WIB"
      }
    ],
    "Sabtu": [
      {
        title: "Soul Land 2: The Unrivaled Tang Sect",
        slug: "soul-land-2-the-unrivaled-tang-sect",
        img: "https://anichin.moe/wp-content/uploads/2023/06/Soul-Land-2-The-Unrivaled-Tang-Sect-1.webp",
        type: "donghua",
        time: "10:00 WIB"
      },
      {
        title: "A Will Eternal Season 3",
        slug: "a-will-eternal-season-3",
        img: "https://anichin.moe/wp-content/uploads/2024/07/A-Will-Eternal-S3.webp",
        type: "donghua",
        time: "09:30 WIB"
      }
    ],
    "Minggu": [
      {
        title: "A Record of a Mortal's Journey to Immortality",
        slug: "a-record-of-a-mortals-journey-to-immortality",
        img: "https://anichin.moe/wp-content/uploads/2023/08/A-Record-of-a-Mortals-Journey-to-Immortality.webp",
        type: "donghua",
        time: "10:00 WIB"
      },
      {
        title: "One Piece",
        slug: "one-piece-sub-indo",
        img: "https://otakudesu.blog/wp-content/uploads/2019/01/One-Piece-Sub-Indo.jpg",
        type: "anime",
        time: "09:00 WIB"
      }
    ]
  };

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedScheduleDay, setSelectedScheduleDay] = useState<string>('');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [countdowns, setCountdowns] = useState<string[]>([]);
  const [animeStatus, setAnimeStatus] = useState<'ALL' | 'Ongoing' | 'Completed'>('ALL');

  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);

  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [totalWatchTime, setTotalWatchTime] = useState({ hours: 0, mins: 0 });
  const [topGenre, setTopGenre] = useState('Belum ada data');

  interface Profile {
    name: string;
    color: string;
  }
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeProfile, setActiveProfile] = useState<string>('Utama');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileColor, setNewProfileColor] = useState('from-violet-500 to-indigo-500');

  // Theme context
  const { theme, setTheme } = useTheme();

  const [mounted, setMounted] = useState(false);

  const [alarms, setAlarms] = useState<string[]>([]);
  const [bookmarkTab, setBookmarkTab] = useState<'ALL' | 'UNWATCHED' | 'WATCHED'>('ALL');

  const getScopedKey = (key: string, profile: string) => {
    if (profile === 'Utama') return key;
    return `${key}_profile_${profile.replace(/\s+/g, '_')}`;
  };

  const filterBookmarks = (items: AnimeCard[]) => {
    const watchedKey = getScopedKey('aylin_watched_episodes', activeProfile);
    const watchedJson = localStorage.getItem(watchedKey);
    let watchedMap: Record<string, string[]> = {};
    if (watchedJson) {
      try {
        watchedMap = JSON.parse(watchedJson);
      } catch {}
    }

    return items.filter(item => {
      const watchedList = watchedMap[item.slug] || [];
      const epCount = watchedList.length;

      if (bookmarkTab === 'ALL') return true;
      if (bookmarkTab === 'UNWATCHED') return epCount === 0;
      if (bookmarkTab === 'WATCHED') return epCount > 0;
      return true;
    });
  };

  // Helper to calculate remaining time until next occurrence of target day/hour/minute
  function calculateTimeLeft(targetDay: number, targetHour: number, targetMinute: number): string {
    const now = new Date();
    const currentDay = now.getDay(); // 0: Sunday, 1: Monday...
    
    let daysUntil = targetDay - currentDay;
    if (daysUntil < 0 || (daysUntil === 0 && (now.getHours() > targetHour || (now.getHours() === targetHour && now.getMinutes() >= targetMinute)))) {
      daysUntil += 7; // target is next week
    }
    
    const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntil, targetHour, targetMinute, 0);
    const diffMs = targetDate.getTime() - now.getTime();
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    }
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  // Load bookmarks, watch history, schedule, handle PWA install hook, and start countdown timers
  useEffect(() => {
    setMounted(true);
    // Load Profiles & Alarms
    const timer = setTimeout(() => {
      const savedProfiles = localStorage.getItem('aylin_profiles');
      let loadedProfiles: Profile[] = [];
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

      const activeProf = localStorage.getItem('aylin_active_profile') || 'Utama';
      setActiveProfile(activeProf);

      const savedAlarms = localStorage.getItem('aylin_release_alarms');
      if (savedAlarms) {
        try {
          setAlarms(JSON.parse(savedAlarms));
        } catch {}
      }

      const days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
      const currentDayIndex = new Date().getDay();
      setSelectedScheduleDay(days[currentDayIndex]);
    }, 0);

    // PWA Install Event Listeners
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    // Countdown Timers Interval & Notification Check
    const updateCountdowns = () => {
      const RI_timeLeft = calculateTimeLeft(1, 10, 0); // Renegade Immortal (Monday 10:00)
      const SR_timeLeft = calculateTimeLeft(6, 18, 0); // Sora wa Akai Kawa (Saturday 18:00)
      const SS_timeLeft = calculateTimeLeft(1, 9, 30);  // Swallowed Star (Monday 09:30)

      setCountdowns([RI_timeLeft, SR_timeLeft, SS_timeLeft]);

      // Check notifications
      const activeAlarmsJson = localStorage.getItem('aylin_release_alarms');
      if (activeAlarmsJson) {
        try {
          const activeAlarms = JSON.parse(activeAlarmsJson) as string[];
          const notifiedJson = localStorage.getItem('aylin_notified_releases') || '[]';
          const notified = JSON.parse(notifiedJson) as string[];
          
          const checks = [
            { slug: 'renegade-immortal', title: 'Renegade Immortal', timeLeft: RI_timeLeft },
            { slug: 'sora-wa-akai-kawa', title: 'Sora wa Akai Kawa', timeLeft: SR_timeLeft },
            { slug: 'swallowed-star', title: 'Swallowed Star', timeLeft: SS_timeLeft }
          ];

          let notifiedUpdated = false;
          checks.forEach(check => {
            if (activeAlarms.includes(check.slug)) {
              const isReleased = check.timeLeft.includes('0h 0m 0s') || check.timeLeft.includes('0h 0m 1s') || check.timeLeft.includes('0h 0m 2s') || check.timeLeft.includes('0h 0m 3s');
              const todayStr = new Date().toISOString().split('T')[0];
              const notificationId = `${check.slug}-${todayStr}`;

              if (isReleased && !notified.includes(notificationId)) {
                notified.push(notificationId);
                notifiedUpdated = true;

                if (Notification.permission === 'granted') {
                  new Notification(`Aylin Stream: ${check.title} Rilis!`, {
                    body: `Episode terbaru dari ${check.title} sudah tersedia untuk diputar sekarang.`,
                    icon: '/icon-192x192.png'
                  });
                }
              }
            }
          });

          if (notifiedUpdated) {
            localStorage.setItem('aylin_notified_releases', JSON.stringify(notified));
          }
        } catch (e) {}
      }
    };
    updateCountdowns();
    const intervalId = setInterval(updateCountdowns, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(intervalId);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Scoped profiles and data loading
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const bookKey = getScopedKey('aylin_bookmarks', activeProfile);
    const savedBookmarks = localStorage.getItem(bookKey);
    if (savedBookmarks) {
      try {
        setBookmarks(JSON.parse(savedBookmarks));
      } catch {
        setBookmarks([]);
      }
    } else {
      setBookmarks([]);
    }

    const histKey = getScopedKey('aylin_history', activeProfile);
    const savedHistory = localStorage.getItem(histKey);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch {
        setHistory([]);
      }
    } else {
      setHistory([]);
    }
  }, [activeProfile]);

  const handleAddProfile = () => {
    const trimmed = newProfileName.trim();
    if (!trimmed) return;
    if (profiles.some(p => p.name.toLowerCase() === trimmed.toLowerCase())) {
      alert("Nama profil sudah digunakan.");
      return;
    }
    const updated = [...profiles, { name: trimmed, color: newProfileColor }];
    setProfiles(updated);
    localStorage.setItem('aylin_profiles', JSON.stringify(updated));
    setNewProfileName('');
    
    // Switch to new profile
    setActiveProfile(trimmed);
    localStorage.setItem('aylin_active_profile', trimmed);
    setIsProfileOpen(false);
  };

  const handleRemoveProfile = (profileName: string) => {
    if (profileName === 'Utama') return;
    if (confirm(`Apakah Anda yakin ingin menghapus profil "${profileName}"? Semua riwayat dan bookmark di profil ini akan terhapus secara permanen.`)) {
      const updated = profiles.filter(p => p.name !== profileName);
      setProfiles(updated);
      localStorage.setItem('aylin_profiles', JSON.stringify(updated));
      
      localStorage.removeItem(getScopedKey('aylin_bookmarks', profileName));
      localStorage.removeItem(getScopedKey('aylin_history', profileName));
      localStorage.removeItem(getScopedKey('aylin_watched_episodes', profileName));
      
      if (activeProfile === profileName) {
        setActiveProfile('Utama');
        localStorage.setItem('aylin_active_profile', 'Utama');
      }
    }
  };

  const toggleAlarm = (slug: string) => {
    if (typeof window === 'undefined') return;
    
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          console.log("Notification permission granted!");
        }
      });
    }

    let updated: string[];
    if (alarms.includes(slug)) {
      updated = alarms.filter(s => s !== slug);
    } else {
      updated = [...alarms, slug];
    }
    setAlarms(updated);
    localStorage.setItem('aylin_release_alarms', JSON.stringify(updated));
  };

  // Watch Analytics calculation
  useEffect(() => {
    const watchedKey = getScopedKey('aylin_watched_episodes', activeProfile);
    const watchedJson = localStorage.getItem(watchedKey);
    let epsCount = 0;
    if (watchedJson) {
      try {
        const watchedMap = JSON.parse(watchedJson);
        Object.values(watchedMap).forEach((arr: any) => {
          if (Array.isArray(arr)) {
            epsCount += arr.length;
          }
        });
      } catch (e) {}
    }
    setTotalEpisodes(epsCount);

    const totalMinutes = epsCount * 22;
    setTotalWatchTime({
      hours: Math.floor(totalMinutes / 60),
      mins: totalMinutes % 60
    });

    if (history.length > 0) {
      const genreCounts: Record<string, number> = {};
      history.forEach(item => {
        const titleLower = item.title.toLowerCase();
        let detectedGenre = 'Fantasy';
        if (titleLower.includes('action') || titleLower.includes('fight') || titleLower.includes('wuxia') || titleLower.includes('battle') || titleLower.includes('immortal') || titleLower.includes('martial')) {
          detectedGenre = 'Action';
        } else if (titleLower.includes('romance') || titleLower.includes('love') || titleLower.includes('marry') || titleLower.includes('blossoms') || titleLower.includes('sweet')) {
          detectedGenre = 'Romance';
        } else if (titleLower.includes('comedy') || titleLower.includes('funny') || titleLower.includes('ghost')) {
          detectedGenre = 'Comedy';
        } else if (titleLower.includes('mystery') || titleLower.includes('detective') || titleLower.includes('crime') || titleLower.includes('thriller')) {
          detectedGenre = 'Mystery';
        } else if (titleLower.includes('kids') || titleLower.includes('family') || titleLower.includes('cartoon')) {
          detectedGenre = 'Kids';
        }
        genreCounts[detectedGenre] = (genreCounts[detectedGenre] || 0) + 1;
      });

      let maxGenre = 'Belum ada data';
      let maxCount = 0;
      Object.entries(genreCounts).forEach(([g, count]) => {
        if (count > maxCount) {
          maxCount = count;
          maxGenre = g;
        }
      });
      setTopGenre(maxGenre);
    } else {
      setTopGenre('Belum ada data');
    }
  }, [history, activeProfile]);

  // Handle Search input change with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (!query.trim()) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }

    setSearchLoading(true);
    setSearchOpen(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const json = await res.json();
        if (json.success) {
          setSearchResults(json.results);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setSearchLoading(false);
      }
    }, 600);
  };

  // Close search overlay
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchOpen(false);
  };

  // Export all local watch history and settings as JSON
  const handleExportData = () => {
    const backupData = {
      bookmarks: localStorage.getItem('aylin_bookmarks'),
      history: localStorage.getItem('aylin_history'),
      watched: localStorage.getItem('aylin_watched_episodes'),
      prefs: localStorage.getItem('aylin_player_prefs')
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aylin_stream_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Import local watch history and settings from a JSON file
  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.bookmarks) localStorage.setItem('aylin_bookmarks', data.bookmarks);
        if (data.history) localStorage.setItem('aylin_history', data.history);
        if (data.watched) localStorage.setItem('aylin_watched_episodes', data.watched);
        if (data.prefs) localStorage.setItem('aylin_player_prefs', data.prefs);
        
        alert("Cadangan data berhasil diimpor! Halaman akan dimuat ulang...");
        window.location.reload();
      } catch (err) {
        alert("Gagal mengimpor berkas. Pastikan berkas cadangan JSON valid.");
      }
    };
    reader.readAsText(file);
  };

  // Trigger custom PWA installation prompt
  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User choice PWA outcome: ${outcome}`);
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  // Select a random ongoing show and navigate to watch page
  const handleSurpriseMe = () => {
    const allOngoing = [
      ...initialAnime.map(a => ({ ...a, type: 'anime' as const })),
      ...initialDonghua.map(d => ({ ...d, type: 'donghua' as const })),
      ...initialDrama.map(dr => ({ ...dr, type: 'drama' as const }))
    ];
    if (allOngoing.length === 0) {
      alert("Tidak ada konten ongoing yang tersedia untuk diputar acak.");
      return;
    }
    const randomItem = allOngoing[Math.floor(Math.random() * allOngoing.length)];
    window.location.href = `/watch/${randomItem.type}/${randomItem.slug}`;
  };

  return (
    <div className="flex flex-col min-h-screen pb-16">
      {/* 1. Header Navbar */}
      <nav className="sticky top-0 z-50 w-full glass-nav px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl font-extrabold tracking-wider bg-gradient-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-fill-transparent drop-shadow-[0_0_15px_rgba(139,92,246,0.3)]">
              AYLIN STREAM
            </span>
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-300">
            <Link href="/" className="hover:text-violet-400 transition-colors">Dashboard</Link>
            <Link href="/catalog" className="hover:text-violet-400 transition-colors">Katalog A-Z</Link>
            <a href="#schedule" className="hover:text-violet-400 transition-colors">Jadwal</a>
            <a href="#anime" className="hover:text-violet-400 transition-colors">Anime</a>
            <a href="#donghua" className="hover:text-violet-400 transition-colors">Donghua</a>
            <a href="#drama" className="hover:text-violet-400 transition-colors">Drama &amp; Film</a>
            {bookmarks.length > 0 && (
              <a href="#bookmarks" className="hover:text-violet-400 transition-colors flex items-center gap-1">
                <Star size={14} className="fill-violet-400 text-violet-400" /> Bookmarks
              </a>
            )}
          </div>
        </div>
        {/* Right side controls: PWA, Surprise Me, Search */}
        <div className="flex items-center gap-3">
          {isInstallable && (
            <button
              onClick={handleInstallApp}
              className="hidden lg:flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 px-4 py-2 rounded-full text-xs font-bold text-white shadow-md transition-all hover:scale-105 cursor-pointer"
            >
              📲 Instal Aplikasi
            </button>
          )}

          <button
            onClick={handleSurpriseMe}
            className="px-3.5 py-2 bg-gradient-to-r from-indigo-500/20 to-violet-500/20 hover:from-indigo-500/30 hover:to-violet-500/30 text-xs font-bold text-indigo-300 rounded-full border border-indigo-500/30 transition-all cursor-pointer flex items-center gap-1.5"
            title="Pilih tayangan ongoing secara acak"
          >
            🎲 Putar Acak
          </button>

          {/* Search Bar Wrapper */}
          <div className="relative w-48 sm:w-64">
            <div className="flex items-center bg-slate-900/80 border border-slate-800 rounded-full px-3 py-1.5 focus-within:border-violet-500/50 transition-colors">
              <Search size={16} className="text-slate-400 mr-2" />
              <input
                type="text"
                placeholder="Cari Anime, Donghua..."
                value={searchQuery}
                onChange={handleSearchChange}
                className="bg-transparent text-sm text-slate-100 outline-none w-full placeholder-slate-500"
              />
              {searchQuery && (
                <button onClick={clearSearch} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Search Result Overlay */}
            {searchOpen && (
              <div className="absolute right-0 mt-3 w-[340px] sm:w-[420px] max-h-[480px] overflow-y-auto glass-card rounded-2xl p-4 shadow-2xl z-50">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 mb-2">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hasil Pencarian</span>
                  <span className="text-xs text-slate-500">{searchResults.length} ditemukan</span>
                </div>

                {searchLoading ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs text-slate-400">Sedang mencari...</span>
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="text-center py-8 text-sm text-slate-500">
                    Tidak ada hasil ditemukan
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {searchResults.map((item) => (
                      <Link
                        key={`${item.type}-${item.slug}`}
                        href={`/watch/${item.type}/${item.slug}`}
                        className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors group"
                      >
                        <div className="relative w-12 h-16 rounded-md overflow-hidden bg-slate-800 flex-shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={item.img ? `/api/image-proxy?url=${encodeURIComponent(item.img)}` : undefined} 
                            alt={item.title} 
                            className="object-cover w-full h-full group-hover:scale-105 transition-transform" 
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-violet-400 transition-colors">
                            {item.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                              item.type === 'donghua' 
                                ? 'bg-fuchsia-950 text-fuchsia-400 border border-fuchsia-800/30' 
                                : item.type === 'drama'
                                  ? 'bg-rose-950 text-rose-400 border border-rose-800/30'
                                  : 'bg-violet-950 text-violet-400 border border-violet-800/30'
                            }`}>
                              {item.type}
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight size={16} className="text-slate-500 group-hover:text-violet-400 transition-colors" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Profile Switcher Dropdown */}
          {mounted && (
            <div className="relative">
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-1.5 p-1 bg-slate-900/60 border border-slate-800 rounded-full hover:border-slate-700 transition-all cursor-pointer"
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
                  <div className="flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-thin">
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
                            className="p-1 text-slate-600 hover:text-rose-500 opacity-0 group-hover/profile:opacity-100 transition-all cursor-pointer mr-1"
                            title="Hapus Profil"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-900 my-1"></div>

                  {/* Theme Customizer Section */}
                  <div className="flex flex-col gap-1.5 px-1.5 pt-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Palette size={10} className="text-slate-500" />
                      <span className="text-[9px] text-slate-500 font-bold uppercase">Tema Tampilan</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {THEMES.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setTheme(t.id, activeProfile)}
                          title={t.label}
                          className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all cursor-pointer ${
                            theme === t.id
                              ? 'bg-white/10 ring-1 ring-white/20 scale-105'
                              : 'hover:bg-white/5 opacity-70 hover:opacity-100'
                          }`}
                        >
                          <div
                            className="w-6 h-6 rounded-full shadow-md"
                            style={{ background: `linear-gradient(135deg, ${t.swatch1}, ${t.swatch2})` }}
                          />
                          <span className="text-[8px] font-bold text-slate-400 leading-tight text-center">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-slate-900 my-1"></div>

                  {/* Add new profile form */}
                  <div className="flex flex-col gap-1.5 px-1.5 pt-1">
                    <span className="text-[9px] text-slate-500 font-bold uppercase">Buat Profil</span>
                    <input
                      type="text"
                      maxLength={10}
                      placeholder="Nama profil..."
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      className="w-full bg-white/5 border border-white/5 rounded-lg py-1 px-2 text-[10px] font-medium text-slate-200 placeholder-slate-600 outline-none focus:border-violet-500/30"
                    />
                    <div className="flex gap-1 justify-between py-1">
                      {[
                        'from-violet-500 to-indigo-500',
                        'from-emerald-500 to-teal-500',
                        'from-amber-500 to-orange-500',
                        'from-rose-500 to-pink-500',
                        'from-fuchsia-500 to-pink-500'
                      ].map(col => (
                        <button
                          key={col}
                          onClick={() => setNewProfileColor(col)}
                          className={`w-3.5 h-3.5 rounded-full bg-gradient-to-tr ${col} transition-all cursor-pointer ${
                            newProfileColor === col ? 'ring-2 ring-violet-500 scale-110' : 'opacity-60 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={handleAddProfile}
                      className="w-full py-1 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 rounded-lg text-[10px] font-bold text-white shadow-md cursor-pointer flex items-center justify-center gap-1 mt-1"
                    >
                      <Plus size={10} /> Tambah
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* 2. Hero Slideshow Carousel */}
      <header className="relative w-full h-[380px] sm:h-[480px] px-4 sm:px-8 mt-4 overflow-hidden">
        <div className="relative w-full h-full rounded-3xl overflow-hidden glass-card shadow-2xl">
          {featuredSlides.map((slide, index) => (
            <div
              key={slide.slug}
              className={`absolute inset-0 w-full h-full transition-opacity duration-1000 ${
                index === carouselIndex ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
            >
              {/* Overlay gradients for text readability */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#06040d] via-[#06040d]/40 to-transparent z-10"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-[#06040d]/90 via-transparent to-transparent z-10"></div>
              
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={slide.img ? `/api/image-proxy?url=${encodeURIComponent(slide.img)}` : undefined}
                alt={slide.title}
                className="absolute inset-0 object-cover w-full h-full"
              />

              {/* Text Content */}
              <div className="absolute bottom-0 left-0 p-6 sm:p-12 z-20 max-w-xl flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] sm:text-xs font-bold bg-violet-600/30 text-violet-300 border border-violet-500/30 px-3 py-1 rounded-full w-max uppercase tracking-wider">
                    Trending {slide.type}
                  </span>
                  {countdowns[index] && (
                    <span className="text-[10px] sm:text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full w-max uppercase tracking-wider animate-pulse flex items-center gap-1.5">
                      ⏳ Next Ep: {countdowns[index]}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-fill-transparent drop-shadow-md">
                  {slide.title}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 line-clamp-3 leading-relaxed">
                  {slide.desc}
                </p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  <Link
                    href={`/watch/${slide.type}/${slide.slug}`}
                    className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 px-5 sm:px-6 py-2.5 rounded-full text-sm font-bold text-white shadow-lg transition-all hover:scale-105 glow-purple cursor-pointer"
                  >
                    <Play size={16} fill="white" /> Nonton Sekarang
                  </Link>
                  {slide.trailer && (
                    <button
                      onClick={() => setTrailerUrl(slide.trailer)}
                      className="px-5 sm:px-6 py-2.5 bg-slate-900/80 hover:bg-slate-800 text-sm font-bold text-slate-300 rounded-full border border-slate-800 transition-all hover:scale-105 cursor-pointer flex items-center gap-1.5"
                    >
                      🎬 Tonton Trailer
                    </button>
                  )}
                  {slide.type !== 'drama' && (
                    <button
                      onClick={() => toggleAlarm(slide.slug)}
                      className={`px-5 sm:px-6 py-2.5 rounded-full text-sm font-bold transition-all hover:scale-105 cursor-pointer flex items-center gap-1.5 ${
                        alarms.includes(slide.slug)
                          ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 glow-amber'
                          : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
                      }`}
                      title={alarms.includes(slide.slug) ? 'Matikan alarm rilis' : 'Nyalakan alarm rilis'}
                    >
                      {alarms.includes(slide.slug) ? (
                        <>
                          <BellOff size={16} /> Alarm Aktif
                        </>
                      ) : (
                        <>
                          <Bell size={16} /> Ingatkan Rilis
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Dots controller */}
          <div className="absolute bottom-6 right-6 z-30 flex items-center gap-2">
            {featuredSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => setCarouselIndex(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                  i === carouselIndex ? 'bg-violet-400 w-6' : 'bg-slate-600 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Lanjutkan Menonton (Continue Watching) Section */}
      {history.length > 0 && (
        <section id="history" className="mt-12 px-4 sm:px-8 flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-slate-900 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-fuchsia-600/10 border border-fuchsia-500/20 rounded-xl text-fuchsia-400">
                <Clock size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-100">Lanjutkan Menonton</h2>
                <p className="text-xs text-slate-500">Lanjutkan episode terakhir yang Anda tonton</p>
              </div>
            </div>
            <button 
              onClick={() => {
                localStorage.removeItem('aylin_history');
                setHistory([]);
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors bg-slate-900/60 border border-slate-800 px-3 py-1 rounded-full cursor-pointer"
            >
              Hapus Riwayat
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {history.map((item) => (
              <div 
                key={`${item.type}-${item.slug}`}
                className="group relative flex flex-col glass-card rounded-2xl overflow-hidden hover:scale-105 transition-all duration-300 hover:border-violet-500/30"
              >
                <Link href={`/watch/${item.type}/${item.slug}`} className="relative aspect-[3/4] bg-slate-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.img ? `/api/image-proxy?url=${encodeURIComponent(item.img)}` : undefined}
                    alt={item.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-fuchsia-500 flex items-center justify-center text-white shadow-lg glow-fuchsia">
                      <Play size={16} fill="white" className="ml-0.5" />
                    </div>
                  </div>
                  <span className={`absolute top-3 left-3 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                    item.type === 'donghua' 
                      ? 'bg-fuchsia-950/90 text-fuchsia-300 border-fuchsia-700/30' 
                      : item.type === 'drama'
                        ? 'bg-rose-950/90 text-rose-300 border-rose-700/30'
                        : 'bg-violet-950/90 text-violet-300 border-violet-700/30'
                  }`}>
                    {item.type}
                  </span>
                </Link>
                <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                  <Link href={`/watch/${item.type}/${item.slug}`} className="font-bold text-sm text-slate-200 line-clamp-1 group-hover:text-fuchsia-400 transition-colors">
                    {item.title}
                  </Link>
                  <span className="text-[10px] font-semibold text-fuchsia-400 flex items-center gap-1.5 bg-fuchsia-950/40 border border-fuchsia-900/30 w-max px-2 py-0.5 rounded-full">
                    Lanjut: {item.lastEpTitle.replace(/Subtitle Indonesia/i, '').replace(/Sub Indo/i, '').trim()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Jadwal Rilis Mingguan (Weekly Release Schedule) */}
      <section id="schedule" className="mt-12 px-4 sm:px-8 flex flex-col gap-5 scroll-mt-24">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-100">Jadwal Rilis Mingguan</h2>
              <p className="text-xs text-slate-500">Jadwal tayang anime &amp; donghua terpopuler</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-indigo-400 bg-indigo-950/20 border border-indigo-900/30 px-3 py-1 rounded-full">
            Hari Ini: {selectedScheduleDay}
          </span>
        </div>

        {/* Days Tab Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {Object.keys(weeklySchedule).map((day) => (
            <button
              key={day}
              onClick={() => setSelectedScheduleDay(day)}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                selectedScheduleDay === day
                  ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white border-transparent shadow-md scale-105'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {day}
            </button>
          ))}
        </div>

        {/* Schedule Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {selectedScheduleDay && weeklySchedule[selectedScheduleDay]?.map((item) => (
            <Link
              key={item.slug}
              href={`/watch/${item.type}/${item.slug}`}
              className="flex items-center gap-3.5 p-3 glass-card rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:scale-[1.02] group"
            >
              <div className="relative w-14 h-18 rounded-xl overflow-hidden bg-slate-900 flex-shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.img ? `/api/image-proxy?url=${encodeURIComponent(item.img)}` : undefined}
                  alt={item.title}
                  className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span className={`text-[8px] font-bold uppercase w-max px-2 py-0.5 rounded-full border ${
                  item.type === 'donghua' 
                    ? 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-800/30' 
                    : 'bg-violet-950/80 text-violet-300 border-violet-800/30'
                }`}>
                  {item.type}
                </span>
                <h3 className="font-bold text-xs text-slate-200 truncate group-hover:text-indigo-400 transition-colors">
                  {item.title}
                </h3>
                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                  ⏰ {item.time}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. Bookmarks Section */}
      {bookmarks.length > 0 && (
        <section id="bookmarks" className="mt-12 px-4 sm:px-8 flex flex-col gap-5 scroll-mt-24">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-600/10 border border-violet-500/20 rounded-xl text-violet-400">
                <Star size={20} className="fill-violet-400" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-100">Koleksi Bookmark</h2>
                <p className="text-xs text-slate-500">Daftar tontonan favorit yang Anda simpan</p>
              </div>
            </div>
            {/* Filter Tabs */}
            <div className="flex items-center p-1 bg-slate-900/50 border border-slate-800 rounded-full w-fit text-[10px] font-bold">
              <button
                onClick={() => setBookmarkTab('ALL')}
                className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                  bookmarkTab === 'ALL'
                    ? 'bg-violet-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Semua
              </button>
              <button
                onClick={() => setBookmarkTab('UNWATCHED')}
                className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                  bookmarkTab === 'UNWATCHED'
                    ? 'bg-violet-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Belum Ditonton
              </button>
              <button
                onClick={() => setBookmarkTab('WATCHED')}
                className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${
                  bookmarkTab === 'WATCHED'
                    ? 'bg-violet-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sudah Ditonton
              </button>
            </div>
          </div>

          {filterBookmarks(bookmarks).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-950/20 border border-slate-900/60 rounded-2xl">
              <Star size={40} className="mb-2 text-slate-600" />
              <p className="text-sm">Tidak ada tontonan di kategori bookmark ini.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
              {filterBookmarks(bookmarks).map((anime) => (
                <div 
                  key={`${anime.type}-${anime.slug}`}
                  className="group relative flex flex-col glass-card rounded-2xl overflow-hidden hover:scale-105 transition-all duration-300 hover:border-violet-500/30"
                >
                  <Link href={`/watch/${anime.type}/${anime.slug}`} className="relative aspect-[3/4] bg-slate-900 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={anime.img ? `/api/image-proxy?url=${encodeURIComponent(anime.img)}` : undefined}
                      alt={anime.title}
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white shadow-lg glow-purple">
                        <Play size={16} fill="white" className="ml-0.5" />
                      </div>
                    </div>
                    <span className={`absolute top-3 left-3 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                      anime.type === 'donghua' 
                        ? 'bg-fuchsia-950/90 text-fuchsia-300 border-fuchsia-700/30' 
                        : anime.type === 'drama'
                          ? 'bg-rose-950/90 text-rose-300 border-rose-700/30'
                          : 'bg-violet-950/90 text-violet-300 border-violet-700/30'
                    }`}>
                      {anime.type}
                    </span>
                  </Link>
                  <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                    <Link href={`/watch/${anime.type}/${anime.slug}`} className="font-bold text-sm text-slate-200 line-clamp-1 group-hover:text-violet-400 transition-colors">
                      {anime.title}
                    </Link>
                    {anime.ep && (
                      <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                        <Clock size={10} /> {anime.ep}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 4. Ongoing Anime Grid (Otakudesu) */}
      <section id="anime" className="mt-12 px-4 sm:px-8 flex flex-col gap-5 scroll-mt-24">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-600/10 border border-violet-500/20 rounded-xl text-violet-400">
              <Tv size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-100">Anime Jepang Terupdate</h2>
              <p className="text-xs text-slate-500">Rilis episode terbaru mingguan sub Indo</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-400 bg-slate-900/60 border border-slate-800 px-3 py-1 rounded-full">
            {initialAnime.length} Seri Aktif
          </span>
        </div>

        {renderFilterBar(animeLetter, setAnimeLetter, animeSort, setAnimeSort, animeGenre, setAnimeGenre, animeStatus, setAnimeStatus, 'bg-violet-500')}

        {filterAndSortList(initialAnime, animeLetter, animeSort, animeGenre, animeStatus).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-950/20 border border-slate-900/60 rounded-2xl">
            <Film size={40} className="mb-2 text-slate-600" />
            <p className="text-sm">Tidak ada tontonan dengan filter kategori &amp; abjad ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {filterAndSortList(initialAnime, animeLetter, animeSort, animeGenre, animeStatus).map((anime, idx) => (
              <div 
                key={`anime-${anime.slug}-${idx}`}
                className="group relative flex flex-col glass-card rounded-2xl overflow-hidden hover:scale-105 transition-all duration-300 hover:border-violet-500/30"
              >
                <Link href={`/watch/anime/${anime.slug}`} className="relative aspect-[3/4] bg-slate-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={anime.img ? `/api/image-proxy?url=${encodeURIComponent(anime.img)}` : undefined}
                    alt={anime.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white shadow-lg glow-purple">
                      <Play size={16} fill="white" className="ml-0.5" />
                    </div>
                  </div>
                  {anime.day && (
                    <span className="absolute top-3 left-3 text-[9px] font-extrabold uppercase bg-emerald-950/90 text-emerald-400 border border-emerald-700/30 px-2 py-0.5 rounded-full">
                      Hari {anime.day}
                    </span>
                  )}
                </Link>
                <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                  <Link href={`/watch/anime/${anime.slug}`} className="font-bold text-sm text-slate-200 line-clamp-2 leading-snug group-hover:text-violet-400 transition-colors">
                    {anime.title}
                  </Link>
                  {anime.ep && (
                    <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                      <Clock size={10} /> {anime.ep}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 5. Ongoing Donghua Grid (Anichin) */}
      <section id="donghua" className="mt-16 px-4 sm:px-8 flex flex-col gap-5 scroll-mt-24">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-fuchsia-600/10 border border-fuchsia-500/20 rounded-xl text-fuchsia-400">
              <Film size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-100">Donghua China Terupdate</h2>
              <p className="text-xs text-slate-500">Donghua 3D & 2D terpopuler sub Indo</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-400 bg-slate-900/60 border border-slate-800 px-3 py-1 rounded-full">
            {initialDonghua.length} Seri Aktif
          </span>
        </div>

        {renderFilterBar(donghuaLetter, setDonghuaLetter, donghuaSort, setDonghuaSort, donghuaGenre, setDonghuaGenre, donghuaStatus, setDonghuaStatus, 'bg-fuchsia-500')}

        {filterAndSortList(initialDonghua, donghuaLetter, donghuaSort, donghuaGenre, donghuaStatus).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-950/20 border border-slate-900/60 rounded-2xl">
            <Film size={40} className="mb-2 text-slate-600" />
            <p className="text-sm">Tidak ada tontonan dengan filter kategori &amp; abjad ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {filterAndSortList(initialDonghua, donghuaLetter, donghuaSort, donghuaGenre, donghuaStatus).map((donghua, idx) => (
              <div 
                key={`donghua-${donghua.slug}-${idx}`}
                className="group relative flex flex-col glass-card rounded-2xl overflow-hidden hover:scale-105 transition-all duration-300 hover:border-fuchsia-500/30"
              >
                <Link href={`/watch/donghua/${donghua.slug}`} className="relative aspect-[3/4] bg-slate-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={donghua.img ? `/api/image-proxy?url=${encodeURIComponent(donghua.img)}` : undefined}
                    alt={donghua.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-fuchsia-500 flex items-center justify-center text-white shadow-lg glow-fuchsia">
                      <Play size={16} fill="white" className="ml-0.5" />
                    </div>
                  </div>
                </Link>
                <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                  <Link href={`/watch/donghua/${donghua.slug}`} className="font-bold text-sm text-slate-200 line-clamp-2 leading-snug group-hover:text-fuchsia-400 transition-colors">
                    {donghua.title}
                  </Link>
                  {donghua.ep && (
                    <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                      <Clock size={10} /> {donghua.ep}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 6. Ongoing Drama & Film Grid (Juraganfilm) */}
      <section id="drama" className="mt-16 px-4 sm:px-8 flex flex-col gap-5 scroll-mt-24">
        <div className="flex items-center justify-between border-b border-slate-900 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-600/10 border border-rose-500/20 rounded-xl text-rose-400">
              <Film size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-100">Drama &amp; Film Asia Terupdate</h2>
              <p className="text-xs text-slate-500">Drama Korea, China, dan film terpopuler sub Indo</p>
            </div>
          </div>
          <span className="text-xs font-semibold text-slate-400 bg-slate-900/60 border border-slate-800 px-3 py-1 rounded-full">
            {initialDrama.length} Seri Aktif
          </span>
        </div>

        {renderFilterBar(dramaLetter, setDramaLetter, dramaSort, setDramaSort, dramaGenre, setDramaGenre, dramaStatus, setDramaStatus, 'bg-rose-500')}

        {filterAndSortList(initialDrama, dramaLetter, dramaSort, dramaGenre, dramaStatus).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500 bg-slate-950/20 border border-slate-900/60 rounded-2xl">
            <Film size={40} className="mb-2 text-slate-600" />
            <p className="text-sm">Tidak ada drama/film dengan filter kategori &amp; abjad ini.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {filterAndSortList(initialDrama, dramaLetter, dramaSort, dramaGenre, dramaStatus).map((drama, idx) => (
              <div 
                key={`drama-${drama.slug}-${idx}`}
                className="group relative flex flex-col glass-card rounded-2xl overflow-hidden hover:scale-105 transition-all duration-300 hover:border-rose-500/30"
              >
                <Link href={`/watch/drama/${drama.slug}`} className="relative aspect-[3/4] bg-slate-900 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={drama.img ? `/api/image-proxy?url=${encodeURIComponent(drama.img)}` : undefined}
                    alt={drama.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center text-white shadow-lg glow-rose">
                      <Play size={16} fill="white" className="ml-0.5" />
                    </div>
                  </div>
                </Link>
                <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                  <Link href={`/watch/drama/${drama.slug}`} className="font-bold text-sm text-slate-200 line-clamp-2 leading-snug group-hover:text-rose-400 transition-colors">
                    {drama.title}
                  </Link>
                  {drama.ep && (
                    <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                      <Clock size={10} /> {drama.ep}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Settings / Backup Panel */}
      <section id="settings" className="mt-16 px-4 sm:px-8 flex flex-col gap-6">
        <div className="border-t border-slate-900 pt-8 flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-slate-100">Statistik Nonton &amp; Pengaturan</h2>
              <p className="text-xs text-slate-500">Analisis kebiasaan menonton Anda dan kelola berkas cadangan data tontonan.</p>
            </div>
          </div>

          {/* Watch Statistics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1 shadow-md hover:border-violet-500/15 transition-all">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Judul</span>
              <span className="text-lg font-black bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-fill-transparent mt-1">
                {history.length} Seri
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1 shadow-md hover:border-emerald-500/15 transition-all">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Episode Ditonton</span>
              <span className="text-lg font-black bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-fill-transparent mt-1">
                {totalEpisodes} Ep
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1 shadow-md hover:border-amber-500/15 transition-all">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Waktu Menonton</span>
              <span className="text-lg font-black bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-fill-transparent mt-1">
                {totalWatchTime.hours}j {totalWatchTime.mins}m
              </span>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col gap-1 shadow-md hover:border-indigo-500/15 transition-all truncate">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Genre Terfavorit</span>
              <span className="text-lg font-black bg-gradient-to-r from-indigo-400 to-pink-400 bg-clip-text text-fill-transparent mt-1 truncate block" title={topGenre}>
                {topGenre}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-2 pt-4 border-t border-slate-900/60">
            <div className="flex flex-col gap-0.5 text-center sm:text-left">
              <h4 className="font-bold text-xs text-slate-300">Ekspor &amp; Impor Cadangan</h4>
              <p className="text-[10px] text-slate-500">Pindahkan riwayat dan bookmark Anda ke perangkat atau browser lain.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportData}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-300 rounded-full border border-slate-800 transition-all cursor-pointer"
              >
                📥 Ekspor Cadangan (JSON)
              </button>
              <label className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-xs font-bold text-white rounded-full transition-all cursor-pointer shadow-md text-center">
                📤 Impor Cadangan (JSON)
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* 7. Footer */}
      <footer className="mt-24 border-t border-slate-900 pt-8 px-4 sm:px-8 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>© 2026 Aylin Stream. All Rights Reserved.</p>
        <p className="flex items-center gap-1 text-slate-400">
          Nonton Anime, Donghua &amp; Film Gratis dengan Kualitas Terbaik
        </p>
      </footer>

      {/* YouTube Trailer Modal */}
      {trailerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 transition-all duration-300">
          <div className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-black animate-fade-in">
            <button 
              onClick={() => setTrailerUrl(null)} 
              className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-black/60 text-white hover:bg-black/80 border border-white/5 transition-all cursor-pointer hover:scale-105"
              title="Tutup Trailer"
            >
              <X size={20} />
            </button>
            <iframe
              src={trailerUrl}
              title="Trailer Player"
              className="w-full h-full border-none"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            ></iframe>
          </div>
        </div>
      )}
    </div>
  );
}
