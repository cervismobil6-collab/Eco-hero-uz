import React from 'react';
import { Leaf, Globe, Heart, ShieldCheck } from 'lucide-react';
import { useEco } from '../../context/EcoContext';

export const Footer: React.FC = () => {
  const { setActiveTab } = useEco();

  return (
    <footer className="w-full bg-[#06130E] dark:bg-[#030A07] text-slate-400 border-t border-emerald-500/15 pt-12 pb-24 xl:pb-12 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">

          {/* Brand Info */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-[#040D0A] font-bold">
                <Leaf className="w-4 h-4 stroke-[2.4]" />
              </div>
              <span className="font-display text-white font-bold text-lg tracking-tight">ECO HERO</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              O'zbekiston maktab o'quvchilari uchun sun'iy intellektga asoslangan ekologik platforma. Muammolarni toping, hal eting va mukofotlarga ega bo'ling.
            </p>
            <div className="flex items-center gap-2 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>"Yashil Makon" umummilliy harakati hamkori</span>
            </div>
          </div>

          {/* Sahifalar */}
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Bo'limlar</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => setActiveTab('map')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  Ekologik muammolar xaritasi
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('report')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  Muammo haqida xabar berish
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('ai')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  EcoHero AI Eko-tahlil
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('shop')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  Eko Bozor va Sovg'alar
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('rating')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  Maktablar va O'quvchilar Reytingi
                </button>
              </li>
            </ul>
          </div>

          {/* Dasturlar */}
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Eko-Dasturlar</h4>
            <ul className="space-y-2">
              <li>
                <button onClick={() => setActiveTab('school')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  ECO Ambassador (Eko-Elchi) tizimi
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('media')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  Eko-media va yutuqlar
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('partners')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  Vazirliklar va Homiylar
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('coins')} className="hover:text-emerald-400 transition-colors cursor-pointer">
                  EcoCoin qanday ishlanadi?
                </button>
              </li>
            </ul>
          </div>

          {/* Telegram va aloqa */}
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Telegram Mini App</h4>
            <p className="text-slate-400 mb-3 leading-relaxed">
              Bot orqali botdan chiqmasdan rasmlarni yuborishingiz va tangalaringizni tekshirishingiz mumkin:
            </p>
            <div className="p-3 bg-[#091E16] rounded-xl border border-emerald-500/20 space-y-1">
              <div className="text-emerald-400 font-mono font-medium">@Ecoheros_bot</div>
              <div className="text-[11px] text-slate-400">Telegram orqali lahzalik xabarnoma</div>
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500">
              <Globe className="w-3.5 h-3.5" />
              <span>O'zbekiston Respublikasi bo'ylab</span>
            </div>
          </div>
        </div>

        <div className="border-t border-emerald-500/15 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-500 text-[11px]">
          <div>
            © 2026 ECO HERO O'zbekiston. Barcha huquqlar himoyalangan.
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span>Tabiatni asrash bilan yaratilgan</span>
            <Heart className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
            <span>O'zbekiston yoshlari uchun</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
