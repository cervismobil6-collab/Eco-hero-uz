import React, { useState } from 'react';
import { Download, Share2, PlusSquare, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA or inside Telegram WebApp, hide or show minimal
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    if (compact) {
      return (
        <button
          onClick={install}
          title="EcoHero ilovasini o'rnatish"
          className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span className="hidden md:inline">Ilovani o'rnatish</span>
        </button>
      );
    }

    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-900/30 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>EcoHero PWA o'rnatish</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          title="iOS O'rnatish"
          className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2 sm:px-3 sm:py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition cursor-pointer shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">iOS O'rnatish</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/30 p-6 shadow-2xl text-slate-200 space-y-4 relative">
              <button
                onClick={() => setShowIOSGuide(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Download className="w-5 h-5" />
                <span>iPhone / iPad da O'rnatish</span>
              </div>

              <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <div>
                    <b>1. Safari menyusidagi</b> "Ulashish" (Share) tugmasini bosing.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <PlusSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <b>2. Ro'yxatdan</b> "Bosh ekranga qo'shish" (Add to Home Screen) ni tanlang.
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer"
              >
                Tushundim
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
