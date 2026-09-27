'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Play, Pause, 
  RotateCcw, Volume2, VolumeX, Maximize, Smartphone, 
  List, Sparkles, Share2, Info, CheckCircle2 
} from 'lucide-react';
import type { ShortDramaDetail } from '@/lib/shortdrama-scraper';

interface Props {
  detail: ShortDramaDetail;
}

export default function ShortDramaPlayerClient({ detail }: Props) {
  const [currentEpIndex, setCurrentEpIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const episodes = detail.episodes || [];
  const currentEp = episodes[currentEpIndex] || null;
  const [currentStreamSrc, setCurrentStreamSrc] = useState(
    currentEp?.streamUrl || currentEp?.proxyUrl || currentEp?.rawUrl || ''
  );

  // Sync streamUrl when episode changes
  useEffect(() => {
    if (currentEp) {
      setCurrentStreamSrc(currentEp.streamUrl || currentEp.proxyUrl || currentEp.rawUrl || '');
      setVideoError(false);
      setIsBuffering(true);
    }
  }, [currentEpIndex, currentEp]);

  // Robust play handler respecting browser autoplay policies
  useEffect(() => {
    if (videoRef.current && currentStreamSrc) {
      videoRef.current.playbackRate = playbackSpeed;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setIsBuffering(false);
          })
          .catch(() => {
            // Autoplay with audio was blocked: mute and retry
            if (videoRef.current) {
              videoRef.current.muted = true;
              setIsMuted(true);
              videoRef.current.play().then(() => {
                setIsPlaying(true);
                setIsBuffering(false);
              }).catch(() => {
                // Both unmuted and muted blocked (awaiting user tap)
                setIsPlaying(false);
                setIsBuffering(false);
              });
            }
          });
      }
    }
  }, [currentStreamSrc, currentEpIndex, playbackSpeed]);

  // Auto-play next episode on end
  const handleEnded = () => {
    if (currentEpIndex < episodes.length - 1) {
      setCurrentEpIndex(prev => prev + 1);
    }
  };

  // Dual-layer error recovery: direct CDN <-> video-proxy fallback
  const handleVideoError = () => {
    console.warn('[ShortDrama] Video stream failed on:', currentStreamSrc);
    if (currentEp?.proxyUrl && currentStreamSrc !== currentEp.proxyUrl) {
      console.log('[ShortDrama] Switching to proxy stream fallback...');
      setCurrentStreamSrc(currentEp.proxyUrl);
      setVideoError(false);
      setIsBuffering(true);
    } else if (currentEp?.rawUrl && currentStreamSrc !== currentEp.rawUrl) {
      console.log('[ShortDrama] Switching to direct rawUrl stream fallback...');
      setCurrentStreamSrc(currentEp.rawUrl);
      setVideoError(false);
      setIsBuffering(true);
    } else {
      setVideoError(true);
      setIsPlaying(false);
      setIsBuffering(false);
    }
  };

  // Time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const cur = videoRef.current.currentTime;
      const dur = videoRef.current.duration || 0;
      setCurrentTime(cur);
      setDuration(dur);
      if (dur > 0) {
        setProgress((cur / dur) * 100);
      }
    }
  };

  // Toggle play/pause
  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {
          videoRef.current!.muted = true;
          setIsMuted(true);
          videoRef.current!.play().catch(() => {});
        });
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(videoRef.current.muted);
    }
  };

  // Change speed
  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const next = speeds[(speeds.indexOf(playbackSpeed) + 1) % speeds.length];
    setPlaybackSpeed(next);
    if (videoRef.current) {
      videoRef.current.playbackRate = next;
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowUp' && currentEpIndex > 0) {
        e.preventDefault();
        setCurrentEpIndex(prev => prev - 1);
      } else if (e.key === 'ArrowDown' && currentEpIndex < episodes.length - 1) {
        e.preventDefault();
        setCurrentEpIndex(prev => prev + 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentEpIndex, episodes.length]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: detail.title,
        text: `Nonton short drama ${detail.title} (9:16) di Aylin Stream!`,
        url: window.location.href,
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="min-h-screen bg-[#07050d] text-slate-100 flex flex-col selection:bg-rose-500/30">
      {/* Top Floating Navbar */}
      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden mr-2">
          <Link
            href="/shortdrama"
            className="p-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
            title="Kembali ke Katalog Drama Pendek"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="truncate">
            <h1 className="text-xs sm:text-sm font-extrabold text-white truncate">
              {detail.title}
            </h1>
            <p className="text-[11px] text-rose-400 font-bold">
              {currentEp?.name || `Episode ${currentEpIndex + 1}`} / {episodes.length} Ep
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInfo(prev => !prev)}
            className="p-2 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Informasi & Sinopsis"
          >
            <Info size={16} />
          </button>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <Share2 size={14} />
            <span className="hidden sm:inline">{copied ? 'Tersalin!' : 'Bagikan'}</span>
          </button>
        </div>
      </nav>

      {/* Main Center Video Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-2 sm:p-6 relative overflow-hidden">
        {/* Ambient Blur Backdrop */}
        {detail.cover && (
          <div 
            className="absolute inset-0 opacity-15 blur-3xl scale-125 pointer-events-none -z-10"
            style={{
              backgroundImage: `url(${detail.cover})`,
              backgroundPosition: 'center',
              backgroundSize: 'cover'
            }}
          />
        )}

        <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center justify-center gap-6">
          {/* Vertical 9:16 Phone Frame Player */}
          <div 
            ref={containerRef}
            className="relative w-full max-w-[360px] sm:max-w-[400px] aspect-[9/16] bg-black rounded-3xl overflow-hidden shadow-2xl border-4 border-slate-800/80 group flex items-center justify-center"
          >
            {currentStreamSrc && !videoError ? (
              <>
                <video
                  ref={videoRef}
                  key={currentStreamSrc}
                  src={currentStreamSrc}
                  playsInline
                  autoPlay
                  preload="auto"
                  onLoadedMetadata={() => setIsBuffering(false)}
                  onCanPlay={() => setIsBuffering(false)}
                  onCanPlayThrough={() => setIsBuffering(false)}
                  onWaiting={() => setIsBuffering(true)}
                  onPlaying={() => { setIsBuffering(false); setIsPlaying(true); }}
                  onPause={() => setIsPlaying(false)}
                  onEnded={handleEnded}
                  onTimeUpdate={handleTimeUpdate}
                  onError={handleVideoError}
                  onClick={togglePlay}
                  poster={currentEp?.cover || detail.cover}
                  className="w-full h-full object-cover cursor-pointer"
                />

                {/* Buffering Indicator */}
                {isBuffering && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none z-10">
                    <div className="w-12 h-12 border-3 border-rose-500 border-t-transparent rounded-full animate-spin shadow-lg" />
                  </div>
                )}
              </>
            ) : (
              <div className="p-6 text-center text-slate-400 flex flex-col items-center justify-center z-10">
                <Smartphone size={40} className="mx-auto mb-2 text-rose-500/60" />
                <p className="text-xs font-semibold mb-3">
                  {videoError ? 'Gagal memuat video stream episode ini.' : 'Stream video belum tersedia.'}
                </p>
                <button
                  onClick={() => {
                    setVideoError(false);
                    setIsBuffering(true);
                    if (currentStreamSrc === currentEp?.proxyUrl && currentEp?.rawUrl) {
                      setCurrentStreamSrc(currentEp.rawUrl);
                    } else if (currentEp?.proxyUrl) {
                      setCurrentStreamSrc(currentEp.proxyUrl);
                    } else if (currentEp?.streamUrl) {
                      setCurrentStreamSrc(currentEp.streamUrl);
                    }
                  }}
                  className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-lg shadow-rose-600/30"
                >
                  <RotateCcw size={13} /> Coba Putar Ulang
                </button>
              </div>
            )}

            {/* Tap to Play / Pause Big Center Icon - Always visible when paused for user gesture */}
            {!isPlaying && !videoError && (
              <button
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer z-20 group/playbtn"
                aria-label="Putar Drama"
              >
                <div className="w-16 h-16 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-2xl glow-rose scale-100 group-hover/playbtn:scale-110 transition-transform">
                  <Play size={28} fill="white" className="ml-1" />
                </div>
              </button>
            )}

            {/* Top Overlay Badges */}
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-20">
              <span className="text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-rose-300 border border-white/10">
                {currentEp?.name || `EP ${currentEpIndex + 1}`}
              </span>
              <div className="flex items-center gap-1.5 pointer-events-auto">
                {isMuted && isPlaying && (
                  <button
                    onClick={toggleMute}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-rose-600 text-white shadow-lg animate-bounce cursor-pointer"
                  >
                    <VolumeX size={12} /> Buka Suara
                  </button>
                )}
                <button
                  onClick={toggleMute}
                  className="p-2 rounded-full bg-black/60 backdrop-blur-md text-white border border-white/10 hover:bg-black/80 transition-colors cursor-pointer"
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
              </div>
            </div>

            {/* Bottom Overlay Controls */}
            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 flex flex-col gap-2 z-20">
              {/* Progress Slider */}
              <div 
                className="w-full bg-white/20 h-1.5 rounded-full cursor-pointer relative overflow-hidden group/bar"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = (e.clientX - rect.left) / rect.width;
                  if (videoRef.current && duration > 0) {
                    videoRef.current.currentTime = pos * duration;
                  }
                }}
              >
                <div 
                  className="h-full bg-gradient-to-r from-rose-500 to-pink-500 transition-all duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Controls bar */}
              <div className="flex items-center justify-between text-white text-xs pt-1">
                <div className="flex items-center gap-3">
                  <button onClick={togglePlay} className="hover:text-rose-400 cursor-pointer">
                    {isPlaying ? <Pause size={18} /> : <Play size={18} fill="white" />}
                  </button>
                  <span className="text-[11px] text-slate-300 font-mono">
                    {formatSeconds(currentTime)} / {formatSeconds(duration)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={cycleSpeed}
                    className="font-bold text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                    title="Ubah Kecepatan Putar"
                  >
                    {playbackSpeed}x
                  </button>
                  <button 
                    onClick={() => setShowDrawer(prev => !prev)}
                    className="hover:text-rose-400 cursor-pointer flex items-center gap-1 text-[11px] font-bold"
                    title="Daftar Episode"
                  >
                    <List size={16} /> Ep
                  </button>
                  <button onClick={toggleFullscreen} className="hover:text-rose-400 cursor-pointer">
                    <Maximize size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Prev / Next Floating Side Arrows */}
            {currentEpIndex > 0 && (
              <button
                onClick={() => setCurrentEpIndex(prev => prev - 1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/90 transition-all opacity-0 group-hover:opacity-100 cursor-pointer z-20"
                title="Episode Sebelumnya (Arrow Up)"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            {currentEpIndex < episodes.length - 1 && (
              <button
                onClick={() => setCurrentEpIndex(prev => prev + 1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/90 transition-all opacity-0 group-hover:opacity-100 cursor-pointer z-20"
                title="Episode Selanjutnya (Arrow Down)"
              >
                <ChevronRight size={20} />
              </button>
            )}
          </div>

          {/* Desktop Right Side / Drawer: Episode Selector & Details */}
          <div className="w-full lg:w-96 flex flex-col bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 sm:p-5 h-[480px] sm:h-[620px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <List size={16} className="text-rose-400" />
                <h3 className="font-bold text-sm text-white">
                  Daftar Episode ({episodes.length})
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full font-bold">
                Auto-Next Aktif
              </span>
            </div>

            {/* Episode Grid Selector */}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 overflow-y-auto py-3 pr-1 flex-1 scrollbar-none">
              {episodes.map((ep, idx) => (
                <button
                  key={`${ep.episodeNo}-${idx}`}
                  onClick={() => setCurrentEpIndex(idx)}
                  className={`p-2.5 rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer border ${
                    currentEpIndex === idx
                      ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white border-transparent shadow-lg shadow-rose-500/25 scale-105'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span>EP {ep.episodeNo}</span>
                  {currentEpIndex === idx && (
                    <span className="text-[8px] uppercase tracking-wider text-rose-100 font-extrabold mt-0.5">
                      Memutar
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Bottom Synopsis Card */}
            <div className="pt-3 border-t border-slate-800/80 mt-auto">
              <h4 className="text-xs font-bold text-white mb-1 flex items-center gap-1.5">
                <Sparkles size={12} className="text-rose-400" /> Sinopsis
              </h4>
              <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                {detail.synopsis}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Info Modal */}
      {showInfo && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 relative shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">{detail.title}</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              {detail.synopsis}
            </p>
            {detail.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-6">
                {detail.tags.map(tag => (
                  <span key={tag} className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowInfo(false)}
              className="w-full py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
