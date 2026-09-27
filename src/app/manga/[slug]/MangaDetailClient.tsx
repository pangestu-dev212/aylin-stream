'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { 
  ArrowLeft, BookOpen, Sparkles, Star, Search, 
  Calendar, Layers, CheckCircle2, ChevronRight, Share2 
} from 'lucide-react';
import type { MangaDetail } from '@/lib/manga-scraper';

interface Props {
  detail: MangaDetail;
}

export default function MangaDetailClient({ detail }: Props) {
  const [searchChapter, setSearchChapter] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [copied, setCopied] = useState(false);

  // Filter & sort chapters
  const filteredChapters = useMemo(() => {
    let list = [...detail.chapters];
    if (searchChapter.trim()) {
      const q = searchChapter.trim().toLowerCase();
      list = list.filter(ch => ch.title.toLowerCase().includes(q));
    }
    if (sortOrder === 'asc') {
      list.reverse();
    }
    return list;
  }, [detail.chapters, searchChapter, sortOrder]);

  const firstChapter = detail.chapters.length > 0 ? detail.chapters[detail.chapters.length - 1] : null;
  const latestChapter = detail.chapters.length > 0 ? detail.chapters[0] : null;

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: detail.title,
        text: `Baca komik ${detail.title} Sub Indo di Aylin Stream!`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Kembali ke Beranda"
          >
            <ArrowLeft size={18} />
          </Link>
          <span className="font-extrabold tracking-wide bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent text-lg">
            AYLIN MANGA
          </span>
        </div>

        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <Share2 size={14} />
          <span>{copied ? 'Tersalin!' : 'Bagikan'}</span>
        </button>
      </nav>

      {/* Hero / Header Section */}
      <div className="relative overflow-hidden bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border-b border-slate-800/60 pb-10 pt-6 px-4 sm:px-8">
        {/* Ambient Blur Backdrop */}
        {detail.img && (
          <div 
            className="absolute inset-0 opacity-20 blur-3xl scale-125 pointer-events-none -z-10"
            style={{
              backgroundImage: `url(${detail.img})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover'
            }}
          />
        )}

        <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 sm:gap-8 items-start">
          {/* Cover Poster */}
          <div className="w-44 sm:w-56 md:w-64 flex-shrink-0 mx-auto md:mx-0 rounded-2xl overflow-hidden border-2 border-slate-800 shadow-2xl relative group">
            {detail.img ? (
              <img
                src={detail.img}
                alt={detail.title}
                className="w-full h-auto aspect-[3/4] object-cover transition-transform duration-500 group-hover:scale-105"
              />
            ) : (
              <div className="w-full aspect-[3/4] bg-slate-900 flex items-center justify-center">
                <BookOpen size={48} className="text-slate-700" />
              </div>
            )}
            {/* Color Badge */}
            {detail.isColored && (
              <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-500 text-white shadow-lg">
                🎨 Full Color
              </span>
            )}
          </div>

          {/* Details info */}
          <div className="flex-1 flex flex-col justify-between">
            <div>
              {/* Type, Status, Rating badges */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  {detail.type.toUpperCase()}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  detail.status.toLowerCase().includes('tamat') || detail.status.toLowerCase().includes('completed')
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                }`}>
                  {detail.status}
                </span>
                {detail.rating && (
                  <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-yellow-500/10 border border-yellow-500/30 text-yellow-300">
                    <Star size={12} className="fill-yellow-400 text-yellow-400" />
                    {detail.rating}
                  </span>
                )}
                {detail.author && (
                  <span className="text-xs text-slate-400 font-medium">
                    Karya: <span className="text-slate-200">{detail.author}</span>
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
                {detail.title}
              </h1>

              {/* Genres */}
              {detail.genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {detail.genres.map(genre => (
                    <span 
                      key={genre}
                      className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-900 border border-slate-800 text-slate-300"
                    >
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              {/* Synopsis */}
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
                <h3 className="font-bold text-white text-xs uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-amber-400" /> Sinopsis
                </h3>
                <p className="line-clamp-4 hover:line-clamp-none transition-all cursor-pointer">
                  {detail.synopsis}
                </p>
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-3">
              {firstChapter && (
                <Link
                  href={`/manga/read/${firstChapter.slug}`}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-sm shadow-lg shadow-amber-500/20 transition-all hover:scale-102 cursor-pointer"
                >
                  <BookOpen size={16} />
                  <span>Baca Chapter Pertama</span>
                </Link>
              )}
              {latestChapter && latestChapter !== firstChapter && (
                <Link
                  href={`/manga/read/${latestChapter.slug}`}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white font-bold text-sm transition-all hover:scale-102 cursor-pointer"
                >
                  <span>Chapter Terbaru ({latestChapter.title.replace(/^Chapter\s*/i, 'Ch. ')})</span>
                  <ChevronRight size={16} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chapters List Section */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 flex-1">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2.5">
            <Layers size={20} className="text-amber-400" />
            <h2 className="text-xl font-extrabold text-white">
              Daftar Chapter ({detail.chapters.length})
            </h2>
          </div>

          {/* Search Chapter & Sort */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-56">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nomor chapter..."
                value={searchChapter}
                onChange={e => setSearchChapter(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors"
              />
            </div>
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {sortOrder === 'desc' ? 'Terbaru ↓' : 'Awal ↑'}
            </button>
          </div>
        </div>

        {/* Chapter Grid */}
        {filteredChapters.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/40 border border-slate-800/60 rounded-2xl">
            <BookOpen size={36} className="mx-auto text-slate-600 mb-2" />
            <p className="text-slate-400 text-sm">Tidak ada chapter yang cocok dengan pencarian.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {filteredChapters.map((ch, idx) => (
              <Link
                key={ch.slug || idx}
                href={`/manga/read/${ch.slug}`}
                className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800/80 hover:border-amber-500/40 transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs flex-shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                    #
                  </div>
                  <div className="truncate">
                    <span className="font-bold text-sm text-slate-200 group-hover:text-amber-400 transition-colors truncate block">
                      {ch.title}
                    </span>
                    {ch.date && (
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <Calendar size={11} /> {ch.date}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 ml-2" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
