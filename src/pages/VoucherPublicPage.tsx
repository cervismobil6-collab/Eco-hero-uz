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
      <div className="min-h-screen bg-[#040D0A] text-white flex flex-col items-center justify-center p-6 gap-4">
        <Loader2 className="w-10 h-10 text-[#00F5A0] animate-spin" />
        <p className="text-sm font-bold text-emerald-100/80">EcoHero vaucheri tekshirilmoqda...</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-[#040D0A] text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-3xl bg-[#061812] border border-rose-500/30 p-6 text-center space-y-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/15 text-rose-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-black uppercase">Vaucher Topilmadi</h1>
            <p className="text-xs sm:text-sm text-slate-300">{error || "Bu QR kod haqiqiy emas yoki o'chirilgan."}</p>
            <p className="text-xs font-mono text-slate-500">{voucherCode}</p>
          </div>
          <button
            type="button"
            onClick={onGoHome}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black text-xs uppercase tracking-wider border-b-[3px] border-emerald-700 min-h-[44px] cursor-pointer"
          >
            ECO HERO Bosh sahifaga o'tish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#072419] via-[#040D0A] to-[#040D0A] text-white py-8 px-4 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="max-w-lg w-full rounded-3xl bg-[#061812] border border-emerald-500/30 shadow-2xl overflow-hidden"
      >
        {/* Hero Gift Photo */}
        <div className="relative h-56 sm:h-64 bg-[#040D0A] overflow-hidden">
          <img src={info.itemImageUrl} alt={info.itemTitle} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061812] via-[#061812]/35 to-black/30" />

          <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#00F5A0] text-[#04110B] text-[10px] font-black uppercase tracking-wider shadow-md">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>EcoHero Rasmiy Yutuq</span>
          </div>

          <div className="absolute bottom-4 left-5 right-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-[#00F5A0]">
                {info.sponsorName}
              </p>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white leading-tight mt-0.5">
                {info.itemTitle}
              </h1>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
              <Gift className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Celebratory Team Greeting */}
        <div className="p-5 sm:p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-amber-500/10 border border-emerald-500/30 space-y-2">
            <div className="flex items-center gap-1.5 text-[#00F5A0] text-[11px] font-black uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>ECO HERO Jamoasidan Tabriknoma</span>
            </div>
            <p className="text-sm font-bold text-white leading-relaxed">
              Hurmatli <span className="text-[#00F5A0]">{info.winnerName}</span>, tabiatni asrash yo'lidagi
              fidokorona harakatlaringiz uchun chin qalbdan tabriklaymiz!
            </p>
            <p className="text-xs text-emerald-100/80 leading-relaxed">
              Siz yig'gan EcoCoinlar va ekologik faolligingiz yurtimizni yanada yashil va toza qilishga xizmat
              qilmoqda. Yanada ko'proq daraxt eking, ekologik vazifalarni bajaring va yangi qimmatbaho
              sovg'alarni qo'lga kiriting — siz haqiqiy <b className="text-[#00F5A0]">EcoHero</b>siz!
            </p>
          </div>

          {/* Winner & Verification Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">G'olib O'quvchi</span>
              <div className="font-bold text-white text-sm flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{info.winnerName}</span>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Maktab</span>
              <div className="font-bold text-white text-sm flex items-center gap-1.5">
                <SchoolIcon className="w-4 h-4 text-[#00F5A0] shrink-0" />
                <span className="truncate">{info.schoolName}</span>
              </div>
            </div>
          </div>

          {/* Authentic Promo Code & Status */}
          <div className="p-4 rounded-2xl bg-[#040D0A] border border-dashed border-emerald-500/40 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                Tasdiqlangan Promokod
              </span>
              <span className="text-xl font-black font-mono text-[#00F5A0] tracking-wider">
                {info.voucherCode}
              </span>
            </div>
            <div className="flex flex-col items-center sm:items-end gap-1">
              <span
                className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${
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
              <span className="text-[10px] text-slate-400 tabular-nums">
                {new Date(info.createdAt).toLocaleDateString('uz-UZ')}
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={onGoShop}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black text-xs uppercase tracking-wider border-b-[3px] border-emerald-700 flex items-center justify-center gap-2 min-h-[44px] cursor-pointer"
            >
              <Leaf className="w-4 h-4" />
              <span>Yana Sovg'alar Ko'rish</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="py-3 px-5 rounded-xl bg-[#040D0A] hover:bg-emerald-500/15 border border-emerald-500/25 text-white font-black text-xs uppercase tracking-wider min-h-[44px] cursor-pointer"
            >
              Bosh Sahifa
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
