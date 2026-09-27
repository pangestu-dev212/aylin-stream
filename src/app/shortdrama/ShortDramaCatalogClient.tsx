'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, Search, Play, Sparkles, Flame, 
  Smartphone, Filter, Star, Clock, Layers 
} from 'lucide-react';
import type { ShortDramaCard } from '@/lib/shortdrama-scraper';

interface Props {
  initialPopular: ShortDramaCard[];
  initialLatest: ShortDramaCard[];
}

export default function ShortDramaCatalogClient({ initialPopular, initialLatest }: Props) {
  const [activeTab, setActiveTab] = useState<'popular' | 'latest'>('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('ALL');

  const sourceList = activeTab === 'popular' ? initialPopular : initialLatest;

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    sourceList.forEach(item => {
      (item.tags || []).forEach(t => {
        if (t && t.length < 25) set.add(t);
      });
    });
    return ['ALL', ...Array.from(set).slice(0, 10)];
  }, [sourceList]);

  // Filter list
  const filteredList = useMemo(() => {
    let list = [...sourceList];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(item => 
        item.title.toLowerCase().includes(q) || 
        item.synopsis.toLowerCase().includes(q) ||
        (item.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (selectedTag !== 'ALL') {
      list = list.filter(item => (item.tags || []).includes(selectedTag));
    }
    return list;
  }, [sourceList, searchQuery, selectedTag]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-rose-500/30 selection:text-rose-200">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            title="Kembali ke Beranda"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-wide bg-gradient-to-r from-rose-400 via-pink-400 to-amber-400 bg-clip-text text-transparent text-lg">
              SHORT DRAMA 9:16
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
              <Smartphone size={10} /> Format Tegak
            </span>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative w-44 sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari short drama..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
          />
        </div>
      </nav>

      {/* Header Banner */}
      <div className="bg-gradient-to-b from-rose-950/30 via-slate-950 to-slate-950 border-b border-slate-800/60 py-8 px-4 sm:px-8">
        <div className="max-w-6xl mx-auto flex flex-col gap-3">
          <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
            <Flame size={16} /> Drama China Mini-Series
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            Drama Pendek Format Tegak (9:16)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            Koleksi drama pendek ala DramaBox &amp; ReelShort bersulih suara (*dubbing*) dan takarir Bahasa Indonesia. Durasinya pas, plot cepat penuh kejutan (*CEO, Balas Dendam, Reinkarnasi*), dan nyaman ditonton di genggaman layar ponsel!
          </p>

          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center gap-2.5 mt-4 pt-4 border-t border-slate-900/80">
            <button
              onClick={() => { setActiveTab('popular'); setSelectedTag('ALL'); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'popular'
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/25 scale-102'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame size={14} /> Terpopuler (Dub Indo) ({initialPopular.length})
            </button>
            <button
              onClick={() => { setActiveTab('latest'); setSelectedTag('ALL'); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-extrabold transition-all cursor-pointer ${
                activeTab === 'latest'
                  ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/25 scale-102'
                  : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles size={14} /> Rilis Terbaru ({initialLatest.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-8 flex-1">
        {/* Tag Filter Bar */}
        {allTags.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-4 mb-6 scrollbar-none">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mr-1 flex-shrink-0">
              <Filter size={12} /> Topik:
            </span>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`text-xs px-3 py-1 rounded-full font-bold transition-all cursor-pointer flex-shrink-0 whitespace-nowrap ${
                  selectedTag === tag
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {tag === 'ALL' ? 'Semua Topik' : tag}
              </button>
            ))}
          </div>
        )}

        {/* Vertical 9:16 Drama Cards Grid */}
        {filteredList.length === 0 ? (
          <div className="text-center py-16 bg-slate-900/40 border border-slate-800/60 rounded-2xl">
            <Smartphone size={40} className="mx-auto text-slate-600 mb-2" />
            <p className="text-slate-400 text-sm">Tidak ada drama pendek yang sesuai dengan filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
            {filteredList.map((drama, idx) => (
              <Link
                key={`${drama.bookId}-${idx}`}
                href={`/shortdrama/${drama.slug}`}
                className="group relative flex flex-col bg-slate-900/90 rounded-2xl overflow-hidden border border-slate-800/80 hover:border-rose-500/40 transition-all duration-300 hover:scale-[1.02] shadow-xl hover:shadow-rose-500/10 cursor-pointer"
              >
                {/* 9:16 Aspect Ratio Poster */}
                <div className="relative aspect-[9/16] bg-slate-950 overflow-hidden">
                  <img
                    src={drama.cover ? `/api/image-proxy?url=${encodeURIComponent(drama.cover)}` : undefined}
                    alt={drama.title}
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  {/* Subtle top & bottom shadow gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-black/40 opacity-80 group-hover:opacity-90 transition-opacity" />

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 flex items-center justify-center text-white shadow-xl shadow-rose-500/40">
                      <Play size={20} fill="white" className="ml-0.5" />
                    </div>
                  </div>

                  {/* Badges Top Left */}
                  <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 z-10">
                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-rose-600 text-white shadow-md">
                      9:16 Tegak
                    </span>
                    {drama.isDubIndo && (
                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-600/90 text-white shadow-sm w-fit">
                        🎙️ Dub Indo
                      </span>
                    )}
                  </div>

                  {/* Episode Count Bottom Right */}
                  {drama.chapterCount > 0 && (
                    <span className="absolute bottom-2.5 right-2.5 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-slate-900/90 text-amber-300 border border-slate-700/80 z-10 flex items-center gap-1 shadow-md">
                      <Layers size={10} /> {drama.chapterCount} Ep
                    </span>
                  )}
                </div>

                {/* Info Text */}
                <div className="p-3 flex flex-col justify-between flex-1 gap-1.5">
                  <h3 className="font-extrabold text-xs sm:text-sm text-slate-100 line-clamp-2 leading-snug group-hover:text-rose-400 transition-colors">
                    {drama.title}
                  </h3>

                  {drama.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-auto pt-1">
                      {drama.tags.slice(0, 2).map(tag => (
                        <span key={tag} className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
