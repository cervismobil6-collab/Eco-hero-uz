import React, { useEffect, useState } from 'react';
import {
  Users,
  Copy,
  Check,
  Share2,
  Sparkles,
  Award,
  Coins,
  ShieldCheck,
  QrCode,
  ArrowRight,
  TrendingUp,
  UserPlus,
  Send,
  Zap,
  Target,
  Clock,
} from 'lucide-react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { useEco } from '../context/EcoContext';
import homeInviteGiftImg from '../assets/images/home_invite_gift_1795602416207.jpg';

export const EcoReferralPage: React.FC = () => {
  const { user, referrals, claimReferral, triggerHaptic, showNotification } = useEco();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [filter, setFilter] = useState<'all' | 'rewarded' | 'pending'>('all');
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const botUsername = 'Ecoheros_bot';
  const telegramBotLink = `https://t.me/${botUsername}?start=ref_${user.uid}`;
  const userReferralCode = user.referralCode || `ECO${user.uid.slice(-4).toUpperCase()}`;

  useEffect(() => {
    if (!showQrModal) return;
    QRCode.toDataURL(telegramBotLink, { width: 240, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [showQrModal, telegramBotLink]);

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 100 } },
  };

  const copyToClipboard = (text: string, isCode: boolean = false) => {
    navigator.clipboard.writeText(text);
    triggerHaptic('light');
    if (isCode) {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } else {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const handleShareTelegram = () => {
    triggerHaptic('medium');
    const shareText = `🌿 Salom! Men ECO HERO platformasida atrof-muhitni tozalab, EcoCoin tangalari yig'moqdaman! Sen ham qo'shil va +50 EcoCoin bonus ol: ${telegramBotLink}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(telegramBotLink)}&text=${encodeURIComponent(
      "🌿 Salom! Men ECO HERO platformasida atrof-muhitni tozalab, EcoCoin tangalari yig'moqdaman! Sen ham qo'shil va +50 EcoCoin bonus ol:"
    )}`;

    const tg = (window as any)?.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
      return;
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareText).catch(() => {});
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    showNotification("Taklif matni va havola nusxalandi! Telegramda do'stlaringizga yuboring.", 'success');
  };

  const handleClaimManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    setClaiming(true);
    setClaimMessage(null);
    const result = await claimReferral(manualCode.trim());
    setClaiming(false);
    setClaimMessage({
      text: result.message,
      success: result.success,
    });
    if (result.success) {
      setManualCode('');
    }
  };

  const userReferrals = referrals.filter(r => r.referrerUid === user.uid);
  const filteredReferrals = userReferrals.filter(r => {
    if (filter === 'rewarded') return r.status === 'rewarded';
    if (filter === 'pending') return r.status === 'pending';
    return true;
  });

  const totalInvited = userReferrals.length;
  const verifiedCount = userReferrals.filter(r => r.status === 'rewarded' || r.status === 'verified').length;
  const totalEarnedCoins = userReferrals
    .filter(r => r.status === 'rewarded')
    .reduce((sum, r) => sum + r.rewardCoins, 0);

  const getTier = (count: number) => {
    if (count >= 15) return { name: "Oliy Eko-Elchi", target: 25, bonus: 500, color: "text-amber-400", bg: "bg-amber-400/10" };
    if (count >= 5) return { name: "Eko-Lider", target: 15, bonus: 250, color: "text-sky-400", bg: "bg-sky-400/10" };
    return { name: "Eko-Targ'ibotchi", target: 5, bonus: 100, color: "text-emerald-400", bg: "bg-emerald-400/10" };
  };
  const currentTier = getTier(totalInvited);
  const progressPercent = Math.min((totalInvited / currentTier.target) * 100, 100);

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5"
    >
      {/* 1. Compact Duolingo Referral Hero */}
      <motion.section
        variants={itemVariants}
        className="relative overflow-hidden rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 text-white shadow-xl"
      >
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-7 flex items-start gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden border border-emerald-400/40 bg-[#040D0A] shrink-0 shadow-lg">
              <img src={homeInviteGiftImg} alt="Taklif tizimi" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#00F5A0]">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Aqlli Referal Tizimi</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black tracking-tight leading-tight text-white">
                Do‘stlarni chorlang, <span className="text-[#00F5A0]">+100 EcoCoin</span> ishlang!
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-snug max-w-xl">
                Har bir birinchi marta qo‘shilgan faol o‘quvchi uchun sizga +100, do‘stingizga esa +50 EcoCoin bonus beriladi.
              </p>
            </div>
          </div>

          {/* Tier Card */}
          <div className="lg:col-span-5">
            <div className="p-4 sm:p-5 rounded-2xl bg-[#040D0A]/80 border border-emerald-500/25 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Taklifchi Darajasi</span>
                <div className={`p-2 rounded-xl ${currentTier.bg} ${currentTier.color}`}>
                  <Award className="w-4 h-4" />
                </div>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div className={`text-lg sm:text-xl font-black ${currentTier.color}`}>{currentTier.name}</div>
                <div className="text-[11px] text-slate-400 font-semibold">
                  Keyingi: {currentTier.target} (+{currentTier.bonus} ECO)
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progressPercent}%` }}
                    className="h-full bg-gradient-to-r from-[#00F5A0] to-[#10B981] rounded-full"
                  />
                </div>
                <div className="flex justify-between text-[10px] font-black text-slate-400 font-mono tabular-nums">
                  <span>{totalInvited} ta taklif</span>
                  <span>Maqsad: {currentTier.target}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. Sharing & Referral Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Link Sharing Card */}
        <motion.div variants={itemVariants} className="lg:col-span-8 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-500">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  Shaxsiy Taklif Havolangiz
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Havolani nusxalang va sinfdoshlaringizga yuboring
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowQrModal(true)}
              title="QR kodni ko‘rish"
              className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 text-slate-700 dark:text-[#00F5A0] flex items-center justify-center hover:border-emerald-500 transition-all cursor-pointer shrink-0"
            >
              <QrCode className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col xl:flex-row items-stretch gap-2.5 p-2.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15">
            <div className="flex-1 px-3.5 py-2.5 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs sm:text-sm font-mono text-slate-700 dark:text-slate-200 truncate flex items-center">
              {telegramBotLink}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => copyToClipboard(telegramBotLink, false)}
                className="flex-1 xl:flex-none min-h-[44px] px-4 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] font-black text-xs rounded-xl border-b-[3px] border-emerald-700 active:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Nusxalandi' : 'Havolani nusxalash'}</span>
              </button>
              <button
                onClick={handleShareTelegram}
                className="flex-1 xl:flex-none min-h-[44px] px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-black text-xs rounded-xl border-b-[3px] border-sky-700 active:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Telegram</span>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Promo Code Card */}
        <motion.div variants={itemVariants} className="lg:col-span-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sizning Promokodingiz</span>
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-dashed border-emerald-500/35 flex items-center justify-between">
              <span className="text-xl font-black text-emerald-600 dark:text-[#00F5A0] font-mono tracking-widest">
                {userReferralCode}
              </span>
              <button
                onClick={() => copyToClipboard(userReferralCode, true)}
                className="p-2 text-emerald-600 dark:text-[#00F5A0] hover:bg-emerald-500/15 rounded-lg transition-all cursor-pointer"
              >
                {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <form onSubmit={handleClaimManual} className="space-y-2 pt-3 border-t border-slate-100 dark:border-emerald-500/15">
            <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Do‘stingiz kodi bormi?</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="KODNI KIRITING"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                className="flex-1 min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-black tracking-wider uppercase text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={claiming || !manualCode.trim()}
                className="min-h-[44px] px-4 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black text-xs rounded-xl border-b-[3px] border-emerald-700 disabled:opacity-50 transition-all cursor-pointer"
              >
                {claiming ? '...' : <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
            <AnimatePresence>
              {claimMessage && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={`text-xs font-bold text-center ${claimMessage.success ? 'text-emerald-500' : 'text-rose-500'}`}
                >
                  {claimMessage.text}
                </motion.p>
              )}
            </AnimatePresence>
          </form>
        </motion.div>
      </section>

      {/* 3. Stats Dashboard */}
      <motion.section variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          { label: 'Jami Takliflar', val: totalInvited, icon: Users, color: 'text-sky-500', sub: 'Yuborilgan takliflar' },
          { label: 'Tasdiqlanganlar', val: verifiedCount, icon: ShieldCheck, color: 'text-[#00F5A0]', sub: 'Faol o‘quvchilar' },
          { label: 'Ishlangan Tanga', val: `+${totalEarnedCoins}`, icon: Coins, color: 'text-amber-500', sub: 'Referal daromadi' },
          { label: 'Konversiya', val: `${totalInvited > 0 ? Math.round((verifiedCount / totalInvited) * 100) : 100}%`, icon: TrendingUp, color: 'text-emerald-400', sub: 'Faollik darajasi' },
        ].map((stat) => (
          <div key={stat.label} className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 shadow-sm space-y-2 text-center">
            <div className={`w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 flex items-center justify-center mx-auto ${stat.color}`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono tabular-nums">{stat.val}</div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{stat.label}</div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{stat.sub}</p>
          </div>
        ))}
      </motion.section>

      {/* 4. Referral Rules / How it works */}
      <motion.section variants={itemVariants} className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-[#072419] via-[#061812] to-[#040D0A] border border-emerald-500/25 text-white space-y-5 shadow-lg">
        <div>
          <h2 className="text-lg sm:text-2xl font-black tracking-tight">Referal Tizimi Qanday Ishlaydi?</h2>
          <p className="text-xs sm:text-sm text-slate-300">Adolatli va shaffof ekologik hamkorlik orqali mukofot oling.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { step: '01', title: 'Havolani Yuboring', desc: 'Telegram havolangizni sinfdoshlar yoki maktab guruhlariga ulashing.', icon: Send },
            { step: '02', title: "Do'st Qo'shiladi", desc: "Do'stingiz birinchi marta botga kirib maktabini tanlaganda +50 EcoCoin oladi.", icon: UserPlus },
            { step: '03', title: 'Mukofot Oling', desc: "Yangi a'zo to'liq ro'yxatdan o'tganda sizga +100 EcoCoin o'tkaziladi.", icon: Award },
          ].map((s) => (
            <div key={s.step} className="p-4 rounded-2xl bg-[#040D0A]/80 border border-emerald-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-[#00F5A0] flex items-center justify-center border border-emerald-500/25">
                  <s.icon className="w-5 h-5" />
                </div>
                <span className="text-lg font-black text-emerald-500/40 font-mono">{s.step}</span>
              </div>
              <h3 className="text-sm sm:text-base font-black text-white">{s.title}</h3>
              <p className="text-xs text-slate-300 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-emerald-500/20 flex items-center gap-2.5 text-xs text-slate-300">
          <ShieldCheck className="w-5 h-5 text-[#00F5A0] shrink-0" />
          <p>
            <b>Himoya tizimi:</b> Do‘stingiz botga faqat birinchi marta qo‘shilgandagina bonus beriladi. Takroriy yoki soxta hisoblar bloklanadi.
          </p>
        </div>
      </motion.section>

      {/* 5. History Table */}
      <motion.section variants={itemVariants} className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">Takliflar Tarixi</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Siz taklif qilgan eko-qahramonlar ro‘yxati</p>
          </div>

          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 w-fit">
            {[
              { id: 'all', label: `Barchasi (${userReferrals.length})` },
              { id: 'rewarded', label: `Tasdiqlangan (${verifiedCount})` },
              { id: 'pending', label: 'Kutilmoqda' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id as any)}
                className={`px-3.5 py-2 min-h-[38px] rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filter === t.id
                    ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black'
                    : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden shadow-sm">
          {filteredReferrals.length === 0 ? (
            <div className="p-10 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-[#00F5A0]">
                <Target className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-black text-slate-900 dark:text-white">Hali hech kim taklif qilinmagan</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">Birinchi do‘stingizni taklif qiling va bonus tangalarni oling.</p>
              </div>
              <button
                onClick={handleShareTelegram}
                className="min-h-[44px] px-6 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] rounded-xl font-black text-xs border-b-[3px] border-emerald-700 cursor-pointer"
              >
                Hoziroq taklif qilish
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#040D0A] text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-emerald-500/15">
                    <th className="px-4 sm:px-5 py-3">O‘quvchi F.I.Sh</th>
                    <th className="px-4 sm:px-5 py-3">Maktab / Tuman</th>
                    <th className="px-4 sm:px-5 py-3">Sana</th>
                    <th className="px-4 sm:px-5 py-3">Holat</th>
                    <th className="px-4 sm:px-5 py-3 text-right">Mukofot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/10">
                  {filteredReferrals.map((item) => (
                    <tr key={item.id} className="hover:bg-emerald-500/[0.04] transition-colors">
                      <td className="px-4 sm:px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-[#00F5A0] font-black flex items-center justify-center text-xs border border-emerald-500/25 shrink-0">
                            {item.referredName.charAt(0)}
                          </div>
                          <div className="font-bold text-slate-900 dark:text-white">{item.referredName}</div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-3.5 text-slate-600 dark:text-slate-300 font-medium">
                        {item.referredSchool}
                      </td>
                      <td className="px-4 sm:px-5 py-3.5 text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                        {new Date(item.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 sm:px-5 py-3.5">
                        {item.status === 'rewarded' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-[#00F5A0] text-[10px] font-black">
                            <Check className="w-3 h-3" /> Berildi
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-500 text-[10px] font-black">
                            <Clock className="w-3 h-3" /> Kutilmoqda
                          </span>
                        )}
                      </td>
                      <td className="px-4 sm:px-5 py-3.5 text-right font-mono font-black text-amber-500 tabular-nums">
                        +{item.rewardCoins} ECO
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.section>

      {/* QR Modal */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="w-full max-w-sm bg-white dark:bg-[#061812] rounded-3xl p-6 border border-slate-200 dark:border-emerald-500/30 shadow-2xl space-y-5 text-center"
            >
              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Shaxsiy Eko-QR</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Sinfdoshlaringiz skaner qilib darhol qo‘shilishlari mumkin.</p>
              </div>

              <div className="p-4 bg-white rounded-2xl inline-block border border-emerald-500/20 shadow-lg">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="EcoHero Taklif QR Kodi" className="w-48 h-48 mx-auto rounded-lg" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-500">QR yuklanmoqda...</div>
                )}
              </div>

              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Promokod</div>
                <div className="text-2xl font-black text-emerald-600 dark:text-[#00F5A0] font-mono tracking-widest">{userReferralCode}</div>
              </div>

              <button
                onClick={() => setShowQrModal(false)}
                className="w-full min-h-[44px] py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black text-xs rounded-xl border-b-[3px] border-emerald-700 cursor-pointer"
              >
                Yopish
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
