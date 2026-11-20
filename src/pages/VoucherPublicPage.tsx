import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Gift,
  Leaf,
  Loader2,
  ShieldCheck,
  Sparkles,
  School as SchoolIcon,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { PublicVoucherInfo } from '../types/eco';
import { apiUrl, parseApiJson } from '../utils/api';

interface VoucherPublicPageProps {
  voucherCode: string;
  onGoHome: () => void;
  onGoShop: () => void;
}

export const VoucherPublicPage: React.FC<VoucherPublicPageProps> = ({ voucherCode, onGoHome, onGoShop }) => {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<PublicVoucherInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(apiUrl(`/api/shop/voucher/public/${encodeURIComponent(voucherCode)}`))
      .then(async res => {
        const data = await parseApiJson<PublicVoucherInfo & { valid?: boolean; error?: string }>(res);
        if (!active) return;
        if (!res.ok || !data.valid) {
          setError(data.error || "Ushbu QR kod bo'yicha vaucher topilmadi.");
          return;
        }
        setInfo(data);
        try {
          confetti({ particleCount: 90, spread: 70, origin: { y: 0.6 } });
        } catch {
          // ignore confetti errors in headless mode
        }
      })
      .catch((err: any) => {
        if (active) setError(err?.message || "Server bilan aloqa o'rnatib bo'lmadi.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [voucherCode]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-center p-6 gap-4">
        <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
        <p className="text-sm font-bold text-slate-300">EcoHero vaucheri tekshirilmoqda...</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-[#020617] text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-[32px] bg-[#0f172a] border border-rose-500/30 p-8 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 text-rose-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black uppercase">Vaucher Topilmadi</h1>
            <p className="text-sm text-slate-400">{error || "Bu QR kod haqiqiy emas yoki o'chirilgan."}</p>
            <p className="text-xs font-mono text-slate-500">{voucherCode}</p>
          </div>
          <button
            type="button"
            onClick={onGoHome}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
          >
            ECO HERO Bosh sahifaga o'tish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#022c22] via-[#020617] to-[#020617] text-white py-10 px-4 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="max-w-xl w-full rounded-[40px] bg-[#0f172a]/95 border border-emerald-500/30 shadow-2xl overflow-hidden"
      >
        {/* Hero Gift Photo */}
        <div className="relative h-64 sm:h-72 bg-slate-900 overflow-hidden">
          <img src={info.itemImageUrl} alt={info.itemTitle} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-[#0f172a]/30 to-black/30" />

          <div className="absolute top-5 left-5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-black uppercase tracking-wider shadow-lg">
            <ShieldCheck className="w-4 h-4" />
            <span>EcoHero Rasmiy Yutuq</span>
          </div>

          <div className="absolute bottom-5 left-6 right-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                {info.sponsorName}
              </p>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight mt-1">
                {info.itemTitle}
              </h1>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Celebratory Team Greeting */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="p-5 rounded-3xl bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-amber-500/10 border border-emerald-500/30 space-y-3">
            <div className="flex items-center gap-2 text-emerald-300 text-xs font-black uppercase tracking-widest">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>ECO HERO Jamoasidan Tabriknoma</span>
            </div>
            <p className="text-sm sm:text-base font-bold text-white leading-relaxed">
              Hurmatli <span className="text-emerald-400">{info.winnerName}</span>, tabiatni asrash yo'lidagi
              fidokorona harakatlaringiz uchun chin qalbdan tabriklaymiz!
            </p>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Siz yig'gan EcoCoinlar va ekologik faolligingiz yurtimizni yanada yashil va toza qilishga xizmat
              qilmoqda. Yanada ko'proq daraxt eking, ekologik vazifalarni bajaring va yangi qimmatbaho
              sovg'alarni qo'lga kiriting — siz haqiqiy <b className="text-emerald-300">EcoHero</b>siz!
            </p>
          </div>

          {/* Winner & Verification Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">G'olib O'quvchi</span>
              <div className="font-bold text-white text-sm flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                <span>{info.winnerName}</span>
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Maktab</span>
              <div className="font-bold text-white text-sm flex items-center gap-1.5">
                <SchoolIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="truncate">{info.schoolName}</span>
              </div>
            </div>
          </div>

          {/* Authentic Promo Code & Status */}
          <div className="p-5 rounded-3xl bg-slate-900 border border-dashed border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                Tasdiqlangan Promokod
              </span>
              <span className="text-2xl font-black font-mono text-emerald-400 tracking-wider">
                {info.voucherCode}
              </span>
            </div>
            <div className="flex flex-col items-center sm:items-end gap-1">
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
                  info.status === 'delivered'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {info.status === 'delivered'
                  ? 'Topshirilgan'
                  : info.verifiedBySchoolAdmin
                  ? 'Maktab admini tasdiqlagan'
                  : 'Topshirish kutilmoqda'}
              </span>
              <span className="text-[10px] text-slate-500">
                {new Date(info.createdAt).toLocaleDateString('uz-UZ')}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onGoShop}
              className="flex-1 py-3.5 px-5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
            >
              <Leaf className="w-4 h-4" />
              <span>Yana Sovg'alar Ko'rish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="py-3.5 px-6 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
            >
              Bosh Sahifa
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
