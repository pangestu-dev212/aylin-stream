'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Film, 
  Search, 
  ChevronRight, 
  Play, 
  Home, 
  Sparkles, 
  ChevronLeft, 
  Loader2 
} from 'lucide-react';

interface AnimeCard {
  title: string;
  slug: string;
  url: string;
  img: string;
  type: 'anime' | 'donghua' | 'drama';
}

const ALPHABET = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'
];

export default function CatalogClient() {
  const [selectedType, setSelectedType] = useState<'anime' | 'donghua'>('anime');
  const [selectedLetter, setSelectedLetter] = useState<string>('A');
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [items, setItems] = useState<AnimeCard[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState<string>('');

  // Fetch catalog list from backend API
  useEffect(() => {
    async function fetchCatalog() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/catalog?type=${selectedType}&letter=${encodeURIComponent(selectedLetter)}&page=${page}`);
        if (!res.ok) {
          throw new Error('Gagal mengambil data katalog.');
        }
        const data = await res.json();
        if (data.success) {
          setItems(data.results || []);
          setTotalPages(data.totalPages || 1);
        } else {
          throw new Error(data.error || 'Terjadi kesalahan sistem.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Terjadi kesalahan eksternal.');
      } finally {
        setLoading(false);
      }
    }
    fetchCatalog();
  }, [selectedType, selectedLetter, page]);

  // Reset page when switching tabs or letters
  const handleTypeChange = (type: 'anime' | 'donghua') => {
    setSelectedType(type);
    setSelectedLetter('A');
    setPage(1);
    setFilterQuery('');
  };

  const handleLetterChange = (letter: string) => {
    setSelectedLetter(letter);
    setPage(1);
    setFilterQuery('');
  };

  // Filter items matching search input
  const filteredItems = items.filter(item => 
    item.title.toLowerCase().includes(filterQuery.toLowerCase())
  );

  // Play random content redirect handler
  const handlePlayRandom = async () => {
    try {
      const res = await fetch('/api/search?q=random');
      // For random, we can fallback to homepage items or just pick from current catalog items list
      if (filteredItems.length > 0) {
        const randomItem = filteredItems[Math.floor(Math.random() * filteredItems.length)];
        window.location.href = `/watch/${randomItem.type}/${randomItem.slug}`;
      } else {
        // Fallback randomizer from server if catalog is empty
        window.location.href = '/';
      }
    } catch {
      window.location.href = '/';
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-violet-500/30 selection:text-violet-200">
      
      {/* 1. Header Navbar */}
      <header className="sticky top-0 z-40 w-full bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-4 sm:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-600 via-fuchsia-600 to-pink-600 flex items-center justify-center text-white font-black text-lg shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform duration-300">
            A
          </div>
          <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-fill-transparent group-hover:text-violet-400 transition-colors">
            Aylin<span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-fill-transparent">Stream</span>
          </span>
        </Link>
        <div className="flex items-center gap-4 text-xs font-semibold">
          <Link href="/" className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors py-1.5 px-3 rounded-full bg-white/5 border border-white/5 hover:border-slate-800">
            <Home size={12} /> Dashboard
          </Link>
          <button 
            onClick={handlePlayRandom}
            className="flex items-center gap-1 px-4 py-1.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-full transition-all hover:scale-105 shadow-md shadow-violet-500/10 cursor-pointer"
          >
            <Sparkles size={12} /> Putar Acak
          </button>
        </div>
      </header>

      {/* 2. Main Page Container */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">
        
        {/* Title and Intro */}
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-2.5">
            <Film size={26} className="text-violet-500" />
            Katalog A-Z
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            Jelajahi ribuan judul Anime Jepang dan Donghua China sub Indo. Klik pada tab untuk beralih tipe tayangan, pilih huruf abjad untuk memfilter indeks, dan ketik judul di pencarian cepat.
          </p>
        </div>

        {/* Tab Selector & Filter Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mt-2">
          
          {/* Tabs */}
          <div className="flex items-center p-1 bg-slate-900/50 border border-slate-900 rounded-full w-fit">
            <button
              onClick={() => handleTypeChange('anime')}
              className={`px-5 py-2 text-xs font-black rounded-full transition-all cursor-pointer ${
                selectedType === 'anime' 
                  ? 'bg-violet-500 text-white shadow-lg glow-purple' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🇯🇵 Anime Jepang
            </button>
            <button
              onClick={() => handleTypeChange('donghua')}
              className={`px-5 py-2 text-xs font-black rounded-full transition-all cursor-pointer ${
                selectedType === 'donghua' 
                  ? 'bg-fuchsia-500 text-white shadow-lg glow-fuchsia' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🇨🇳 Donghua China
            </button>
          </div>

          {/* Quick Filter Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder={`Cari judul dalam kategori ${selectedLetter}...`}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/5 focus:border-slate-800 rounded-full py-2.5 pl-11 pr-4 text-xs font-medium text-slate-100 placeholder-slate-500 outline-none transition-all"
            />
          </div>

        </div>

        {/* 3. Alphabetical A-Z Navigation Bar */}
        <div className="w-full overflow-x-auto pb-2 scrollbar-thin">
          <div className="flex items-center gap-1.5 min-w-max p-1 bg-slate-900/20 border border-slate-900/60 rounded-2xl">
            {ALPHABET.map((letter) => (
              <button
                key={`letter-${letter}`}
                onClick={() => handleLetterChange(letter)}
                className={`w-9 h-9 flex items-center justify-center text-xs font-black rounded-xl transition-all cursor-pointer ${
                  selectedLetter === letter
                    ? selectedType === 'anime'
                      ? 'bg-violet-500 text-white shadow-md'
                      : 'bg-fuchsia-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>

        {/* 4. Results Card Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
            <Loader2 className="animate-spin text-violet-500" size={32} />
            <p className="text-xs font-semibold tracking-wider uppercase text-slate-600 animate-pulse">Memuat Katalog...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500 bg-slate-950/20 border border-slate-900/60 rounded-3xl">
            <p className="text-sm font-semibold text-rose-500 mb-2">Terjadi Kesalahan</p>
            <p className="text-xs text-slate-600">{error}</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 bg-slate-950/20 border border-slate-900/60 rounded-3xl gap-2 text-center px-4">
            <Film size={36} className="text-slate-700 mb-1" />
            <p className="text-sm font-bold text-slate-400">Katalog Kosong</p>
            <p className="text-xs text-slate-500 max-w-md">Tidak ada tayangan yang berawalan huruf &quot;{selectedLetter}&quot; atau sesuai dengan pencarian cepat Anda.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
              {filteredItems.map((item, idx) => {
                const watchPath = `/watch/${item.type}/${item.slug}`;
                
                return (
                  <div 
                    key={`catalog-${item.slug}-${idx}`}
                    className={`group relative flex flex-col glass-card rounded-2xl overflow-hidden hover:scale-105 transition-all duration-300 border border-white/5 hover:border-slate-800 ${
                      selectedType === 'anime' ? 'hover:border-violet-500/20' : 'hover:border-fuchsia-500/20'
                    }`}
                  >
                    <Link href={watchPath} className="relative aspect-[3/4] overflow-hidden bg-slate-950 flex items-center justify-center">
                      
                      {item.img ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/image-proxy?url=${encodeURIComponent(item.img)}`}
                            alt={item.title}
                            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg ${
                              selectedType === 'anime' ? 'bg-violet-500 glow-purple' : 'bg-fuchsia-500 glow-fuchsia'
                            }`}>
                              <Play size={16} fill="white" className="ml-0.5" />
                            </div>
                          </div>
                        </>
                      ) : (
                        // Placeholder premium card for text directory without images (Anime List)
                        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-900 to-slate-950 flex flex-col justify-between p-4 border border-white/5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase font-black text-violet-400 tracking-widest px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/10">
                              Anime
                            </span>
                            <Film size={14} className="text-slate-700" />
                          </div>
                          
                          <div className="flex flex-col items-center justify-center my-auto gap-2 text-center">
                            <div className="w-10 h-10 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400 shadow-md">
                              <Play size={14} fill="currentColor" className="ml-0.5" />
                            </div>
                          </div>
                          
                          <div className="text-[10px] text-slate-500 font-bold text-center border-t border-slate-900 pt-2 tracking-wide uppercase truncate">
                            Buka Pemutar
                          </div>
                        </div>
                      )}
                    </Link>

                    {/* Metadata Card Footer */}
                    <div className="p-3.5 flex flex-col justify-between flex-1 gap-2 bg-slate-950/40">
                      <Link 
                        href={watchPath} 
                        className={`font-bold text-xs sm:text-sm text-slate-200 line-clamp-2 leading-snug transition-colors ${
                          selectedType === 'anime' ? 'group-hover:text-violet-400' : 'group-hover:text-fuchsia-400'
                        }`}
                      >
                        {item.title}
                      </Link>
                    </div>

                  </div>
                );
              })}
            </div>

            {/* 5. Pagination Controls (Only for Donghua/Anichin since Otakudesu loads all at once) */}
            {selectedType === 'donghua' && totalPages > 1 && (
              <div className="flex items-center justify-center gap-4 mt-4 pt-6 border-t border-slate-900">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-950 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-slate-800 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                  title="Halaman Sebelumnya"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-extrabold text-slate-400 tracking-wider">
                  HALAMAN <span className="text-white font-black">{page}</span> DARI <span className="text-slate-400">{totalPages}</span>
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-950 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 border border-slate-800 rounded-xl transition-all cursor-pointer flex items-center justify-center"
                  title="Halaman Berikutnya"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}

          </div>
        )}

      </main>

      {/* 6. Footer */}
      <footer className="mt-24 border-t border-slate-900 py-8 px-4 sm:px-8 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4 w-full max-w-7xl mx-auto">
        <p>© 2026 Aylin Stream. All Rights Reserved.</p>
        <p className="flex items-center gap-1 text-slate-400">
          Nonton Anime &amp; Donghua Lengkap Gratis Tanpa Iklan
        </p>
      </footer>

    </div>
  );
}
