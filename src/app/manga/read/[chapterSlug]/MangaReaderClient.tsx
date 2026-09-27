'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, BookOpen, 
  Maximize2, Minimize2, ZoomIn, ZoomOut, ArrowUp, RefreshCw 
} from 'lucide-react';
import type { ChapterData } from '@/lib/manga-scraper';

interface Props {
  chapter: ChapterData;
}

export default function MangaReaderClient({ chapter }: Props) {
  const router = useRouter();
  const [maxWidth, setMaxWidth] = useState<'normal' | 'wide' | 'full'>('normal');
  const [progress, setProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<number, boolean>>({});
  const [proxiedImages, setProxiedImages] = useState<Record<number, boolean>>({});

  // Scroll listener for reading progress and scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (totalHeight > 0) {
        const currentProgress = Math.min(100, Math.max(0, Math.round((window.scrollY / totalHeight) * 100)));
        setProgress(currentProgress);
      }
      setShowScrollTop(window.scrollY > 600);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && chapter.prevChapterSlug) {
        router.push(`/manga/read/${chapter.prevChapterSlug}`);
      } else if (e.key === 'ArrowRight' && chapter.nextChapterSlug) {
        router.push(`/manga/read/${chapter.nextChapterSlug}`);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chapter.prevChapterSlug, chapter.nextChapterSlug, router]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImageError = (idx: number) => {
    if (!proxiedImages[idx]) {
      // Automatically retry via our server-side image proxy
      setProxiedImages(prev => ({ ...prev, [idx]: true }));
    } else {
      setFailedImages(prev => ({ ...prev, [idx]: true }));
    }
  };

  const retryImage = (idx: number) => {
    setFailedImages(prev => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
    setProxiedImages(prev => ({ ...prev, [idx]: true }));
  };

  const containerWidthClass = {
    normal: 'max-w-3xl',
    wide: 'max-w-4xl',
    full: 'max-w-full',
  }[maxWidth];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none selection:bg-amber-500/30">
      {/* Top Floating / Sticky Reader Navigation Bar */}
      <header className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-6 py-2.5 flex items-center justify-between shadow-lg">
        {/* Left: Back & Manga Title */}
        <div className="flex items-center gap-3 overflow-hidden mr-2">
          <Link
            href={chapter.mangaSlug ? `/manga/${chapter.mangaSlug}` : '/'}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
            title="Kembali ke Info Komik"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="truncate">
            <h1 className="text-xs sm:text-sm font-bold text-white truncate">
              {chapter.title}
            </h1>
            <p className="text-[11px] text-amber-400 truncate">
              {chapter.mangaTitle}
            </p>
          </div>
        </div>

        {/* Right Controls: Prev / Next Chapter & Zoom */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Width / Zoom Toggle */}
          <div className="hidden sm:flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 mr-2">
            <button
              onClick={() => setMaxWidth('normal')}
              className={`px-2 py-1 text-[11px] font-bold rounded ${maxWidth === 'normal' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              title="Lebar Standar"
            >
              Standar
            </button>
            <button
              onClick={() => setMaxWidth('wide')}
              className={`px-2 py-1 text-[11px] font-bold rounded ${maxWidth === 'wide' ? 'bg-amber-500 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              title="Lebar Luas"
            >
              Lebar
            </button>
          </div>

          {/* Prev Chapter Button */}
          {chapter.prevChapterSlug ? (
            <Link
              href={`/manga/read/${chapter.prevChapterSlug}`}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 hover:bg-slate-800 hover:text-amber-400 transition-all cursor-pointer"
              title="Chapter Sebelumnya (Arrow Left)"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Prev</span>
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-900 text-xs font-bold text-slate-600 cursor-not-allowed">
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Prev</span>
            </span>
          )}

          {/* Next Chapter Button */}
          {chapter.nextChapterSlug ? (
            <Link
              href={`/manga/read/${chapter.nextChapterSlug}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-xs font-bold text-white shadow-md transition-all cursor-pointer"
              title="Chapter Selanjutnya (Arrow Right)"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={16} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-bold text-slate-600 cursor-not-allowed">
              <span className="hidden sm:inline">Next</span>
              <ChevronRight size={16} />
            </span>
          )}
        </div>
      </header>

      {/* Reading Progress Line */}
      <div className="sticky top-[49px] z-40 w-full bg-slate-900 h-1">
        <div 
          className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-400 transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Main Images Canvas (Vertical Endless Webtoon Scroll) */}
      <main className={`w-full ${containerWidthClass} mx-auto px-0 sm:px-2 py-4 flex flex-col items-center flex-1`}>
        {chapter.images.length === 0 ? (
          <div className="text-center py-24 px-4 bg-slate-900/40 border border-slate-800/60 rounded-2xl max-w-md my-auto">
            <BookOpen size={48} className="mx-auto text-amber-500/60 mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">Halaman Sedang Diproses</h3>
            <p className="text-xs text-slate-400 mb-4">
              Gambar untuk chapter ini belum selesai di-render oleh server penyedia. Silakan coba muat ulang beberapa saat lagi.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw size={14} /> Muat Ulang Halaman
            </button>
          </div>
        ) : (
          chapter.images.map((imgUrl, idx) => (
            <div 
              key={`${idx}-${imgUrl}`} 
              className="w-full relative flex flex-col items-center justify-center my-0 bg-slate-950 min-h-[250px]"
            >
              {failedImages[idx] ? (
                <div className="w-full py-16 px-4 bg-slate-900/80 border border-slate-800 text-center flex flex-col items-center justify-center">
                  <p className="text-xs text-rose-400 font-semibold mb-2">Gagal memuat gambar #{idx + 1}</p>
                  <button
                    onClick={() => retryImage(idx)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <RefreshCw size={12} /> Coba Muat Ulang
                  </button>
                </div>
              ) : (
                <img
                  src={proxiedImages[idx] ? `/api/image-proxy?url=${encodeURIComponent(imgUrl)}` : imgUrl}
                  alt={`Halaman ${idx + 1}`}
                  loading={idx < 3 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={() => handleImageError(idx)}
                  className="w-full h-auto object-contain block mx-auto transition-opacity duration-300"
                />
              )}
            </div>
          ))
        )}

        {/* End of Chapter Navigation Card */}
        {chapter.images.length > 0 && (
          <div className="w-full max-w-xl mx-auto my-12 p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 text-center shadow-2xl">
            <h3 className="text-base font-extrabold text-white mb-1">
              Kamu telah menyelesaikan {chapter.title}!
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Lanjutkan membaca ke chapter berikutnya atau kembali ke daftar chapter.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {chapter.prevChapterSlug && (
                <Link
                  href={`/manga/read/${chapter.prevChapterSlug}`}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ChevronLeft size={16} /> Chapter Sebelumnya
                </Link>
              )}

              {chapter.mangaSlug && (
                <Link
                  href={`/manga/${chapter.mangaSlug}`}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <BookOpen size={16} /> Daftar Chapter
                </Link>
              )}

              {chapter.nextChapterSlug && (
                <Link
                  href={`/manga/read/${chapter.nextChapterSlug}`}
                  className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-xs shadow-lg shadow-amber-500/20 flex items-center justify-center gap-1.5 transition-all hover:scale-102 cursor-pointer"
                >
                  Chapter Selanjutnya <ChevronRight size={16} />
                </Link>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 p-3 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-xl shadow-amber-500/30 transition-all hover:scale-110 z-50 cursor-pointer"
          title="Kembali ke Atas"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </div>
  );
}
