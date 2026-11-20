import React, { useState } from 'react';
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
  Info,
  ChevronRight,
  Target,
  Clock,
} from 'lucide-react';
import { motion, Variants, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';

export const EcoReferralPage: React.FC = () => {
  const { user, referrals, claimReferral, triggerHaptic, showNotification } = useEco();
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<{ text: string; success: boolean } | null>(null);
  const [filter, setFilter] = useState<'all' | 'rewarded' | 'pending'>('all');
  const [showQrModal, setShowQrModal] = useState(false);

  const botUsername = 'Ecoheros_bot';
  const telegramBotLink = `https://t.me/${botUsername}?start=ref_${user.uid}`;
  const webAppShareLink = typeof window !== 'undefined' ? `${window.location.origin}/?ref=${user.uid}` : telegramBotLink;
  const userReferralCode = user.referralCode || `ECO${user.uid.slice(-4).toUpperCase()}`;

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
      className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12"
    >
      
      {/* 1. Cinematic Hero Section */}
      <motion.section variants={itemVariants} className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 via-teal-500 to-indigo-600 rounded-[48px] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
        <div className="relative p-10 sm:p-16 rounded-[48px] bg-slate-900 border border-white/5 overflow-hidden text-white shadow-2xl">
          <div className="absolute -right-20 -top-20 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-7 space-y-8">
              <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>Smart Referral Ecosystem</span>
              </div>

              <h1 className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.9] text-balance">
                Do'stlarni chorlang, <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">+100 EcoCoin</span> ishlang!
              </h1>

              <p className="text-lg sm:text-xl text-slate-400 leading-relaxed font-medium max-w-xl">
                Har bir taklif qilingan faol o'quvchi uchun sizga +100, do'stingizga esa +50 EcoCoin bonus beriladi.
              </p>
            </div>

            {/* Tier Card */}
            <div className="lg:col-span-5 relative group/card">
               <div className="absolute -inset-1 bg-gradient-to-b from-white/10 to-transparent rounded-[40px] blur opacity-5" />
               <div className="relative p-8 rounded-[40px] bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl space-y-8">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Taklifchi Darajasi</span>
                    <div className={`p-3 rounded-2xl ${currentTier.bg} ${currentTier.color}`}>
                       <Award className="w-6 h-6" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className={`text-3xl font-black uppercase tracking-tighter ${currentTier.color}`}>
                      {currentTier.name}
                    </div>
                    <p className="text-xs text-slate-400 font-medium italic">
                      Keyingi bosqich: {currentTier.target} ta do'st (+{currentTier.bonus} EC)
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="w-full h-3 rounded-full bg-white/5 overflow-hidden ring-1 ring-white/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progressPercent}%` }}
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest font-mono">
                      <span>{totalInvited} Invited</span>
                      <span>Target: {currentTier.target}</span>
                    </div>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* 2. Sharing & Referral Actions */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Link Sharing Card */}
        <motion.div variants={itemVariants} className="lg:col-span-8 p-10 rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-sky-500/10 flex items-center justify-center text-sky-500">
                <Send className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                  Shaxsiy Taklif Havolangiz
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest">
                  Copy and share with your classmates
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowQrModal(true)}
              className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 text-slate-400 hover:text-emerald-500 transition-all border border-transparent hover:border-emerald-500/20"
            >
              <QrCode className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-col xl:flex-row items-stretch gap-4 p-3 rounded-3xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5">
            <div className="flex-1 px-6 py-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-600 dark:text-slate-300 truncate">
              {telegramBotLink}
            </div>
            <div className="flex items-center gap-3">
               <button
                 onClick={() => copyToClipboard(telegramBotLink, false)}
                 className="flex-1 xl:flex-none px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] rounded-2xl uppercase tracking-widest shadow-xl shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
               >
                 {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                 <span>Copy Link</span>
               </button>
               <button
                 onClick={handleShareTelegram}
                 className="flex-1 xl:flex-none px-8 py-4 bg-sky-600 hover:bg-sky-500 text-white font-black text-[10px] rounded-2xl uppercase tracking-widest shadow-xl shadow-sky-600/20 transition-all flex items-center justify-center gap-2"
               >
                 <Share2 className="w-4 h-4" />
                 <span>Telegram</span>
               </button>
            </div>
          </div>
        </motion.div>

        {/* Promo Code Card */}
        <motion.div variants={itemVariants} className="lg:col-span-4 p-10 rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-10">
           <div className="space-y-4">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sizning Promokodingiz</span>
              <div className="p-6 rounded-3xl bg-emerald-500/5 border-2 border-dashed border-emerald-500/20 flex items-center justify-between group">
                 <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400 font-mono tracking-[0.2em]">
                    {userReferralCode}
                 </span>
                 <button
                   onClick={() => copyToClipboard(userReferralCode, true)}
                   className="p-3 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 rounded-xl transition-all"
                 >
                   {copiedCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                 </button>
              </div>
           </div>

           <form onSubmit={handleClaimManual} className="space-y-4 pt-6 border-t border-slate-100 dark:border-white/5">
              <div className="space-y-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Do'stingiz kodi bormi?</label>
                 <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="ENTER CODE"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                      className="flex-1 px-6 py-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-sm font-black tracking-widest uppercase focus:outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                    />
                    <button
                      type="submit"
                      disabled={claiming || !manualCode.trim()}
                      className="px-6 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[10px] rounded-2xl uppercase tracking-widest disabled:opacity-50 transition-all"
                    >
                      {claiming ? '...' : <ArrowRight className="w-5 h-5" />}
                    </button>
                 </div>
              </div>
              <AnimatePresence>
                {claimMessage && (
                  <motion.p 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className={`text-[10px] font-black uppercase tracking-widest text-center ${claimMessage.success ? 'text-emerald-500' : 'text-rose-500'}`}
                  >
                    {claimMessage.text}
                  </motion.p>
                )}
              </AnimatePresence>
           </form>
        </motion.div>

      </section>

      {/* 3. Stats Dashboard */}
      <motion.section variants={itemVariants} className="grid grid-cols-2 lg:grid-cols-4 gap-8">
        {[
          { label: 'Jami Takliflar', val: totalInvited, icon: Users, color: 'text-indigo-500', sub: 'Total invitations' },
          { label: 'Tasdiqlanganlar', val: verifiedCount, icon: ShieldCheck, color: 'text-emerald-500', sub: 'Real students' },
          { label: 'Ishlangan Tanga', val: `+${totalEarnedCoins}`, icon: Coins, color: 'text-amber-500', sub: 'Referral balance' },
          { label: 'Konversiya', val: `${totalInvited > 0 ? Math.round((verifiedCount / totalInvited) * 100) : 100}%`, icon: TrendingUp, color: 'text-teal-500', sub: 'Activity rate' },
        ].map((stat) => (
          <div key={stat.label} className="p-8 rounded-[32px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4 text-center group hover:border-emerald-500/50 transition-all">
             <div className={`w-12 h-12 rounded-2xl bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-6 h-6" />
             </div>
             <div className="space-y-1">
                <div className="text-4xl font-black text-slate-900 dark:text-white font-mono tracking-tighter">{stat.val}</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</div>
             </div>
             <p className="text-[9px] text-slate-500 font-medium uppercase tracking-tight">{stat.sub}</p>
          </div>
        ))}
      </motion.section>

      {/* 4. Referral Rules / How it works */}
      <motion.section variants={itemVariants} className="p-12 sm:p-20 rounded-[48px] bg-slate-900 text-white overflow-hidden relative group">
         <div className="absolute top-0 right-0 p-24 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
            <Zap className="w-96 h-96 text-emerald-500" />
         </div>
         
         <div className="relative z-10 space-y-16">
            <div className="text-center space-y-4">
               <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">Referal Tizimi Qanday Ishlaydi?</h2>
               <p className="text-slate-400 font-medium max-w-2xl mx-auto">Adolatli va shaffof ekologik hamkorlik orqali ko'proq foyda oling.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
               {[
                 { step: '01', title: 'Havolani Yuboring', desc: 'Telegram havolangizni sinfdoshlar yoki maktab guruhlariga ulashing.', icon: Send },
                 { step: '02', title: 'Do\'st Keladi', desc: 'Do\'stingiz maktabini tanlab kirganda darhol +50 EcoCoin oladi.', icon: UserPlus },
                 { step: '03', title: 'Mukofot Oling', desc: 'Profil tasdiqlanganda sizga +100 EcoCoin o\'tkaziladi.', icon: Award },
               ].map((s) => (
                 <div key={s.step} className="space-y-6">
                    <div className="text-5xl font-black text-white/5 font-mono">{s.step}</div>
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
                       <s.icon className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-black uppercase tracking-tight">{s.title}</h3>
                    <p className="text-slate-400 text-sm font-medium leading-relaxed">{s.desc}</p>
                 </div>
               ))}
            </div>

            <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row items-center gap-6 text-xs text-slate-500 font-medium italic">
               <ShieldCheck className="w-8 h-8 text-emerald-500 shrink-0" />
               <p><b>Anti-Fraud:</b> Sun'iy botlar yoki duplicate qurilmalar avtomatik aniqlanadi va bloklanadi. Faqat haqiqiy o'quvchi profillari uchun mukofot beriladi.</p>
            </div>
         </div>
      </motion.section>

      {/* 5. History Table */}
      <motion.section variants={itemVariants} className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 px-4">
           <div className="space-y-2">
              <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Referral History</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Your invited environmental heroes</p>
           </div>

           <div className="flex items-center p-2 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
             {[
               { id: 'all', label: `Barchasi (${userReferrals.length})` },
               { id: 'rewarded', label: `Rewarded (${verifiedCount})` },
               { id: 'pending', label: 'Pending' },
             ].map((t) => (
               <button
                 key={t.id}
                 onClick={() => setFilter(t.id as any)}
                 className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                   filter === t.id
                     ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-xl shadow-black/5'
                     : 'text-slate-500 hover:text-slate-900'
                 }`}
               >
                 {t.label}
               </button>
             ))}
           </div>
        </div>

        <div className="rounded-[40px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl">
          {filteredReferrals.length === 0 ? (
            <div className="p-24 text-center space-y-6">
              <div className="w-24 h-24 rounded-[32px] bg-slate-50 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-300">
                <Target className="w-12 h-12" />
              </div>
              <div className="space-y-2">
                 <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Hali hech kim yo'q</h4>
                 <p className="text-sm text-slate-500 max-w-xs mx-auto">Birinchi do'stingizni taklif qiling va ekotizimni kengaytiring.</p>
              </div>
              <button onClick={handleShareTelegram} className="px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl">Invite Now</button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 dark:bg-white/5 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-white/5">
                    <th className="px-10 py-6">Student F.I.Sh</th>
                    <th className="px-10 py-6">School / District</th>
                    <th className="px-10 py-6">Joined Date</th>
                    <th className="px-10 py-6">Status</th>
                    <th className="px-10 py-6 text-right">Reward</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredReferrals.map((item) => (
                    <tr key={item.id} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-10 py-8">
                        <div className="flex items-center gap-5">
                          <div className="w-12 h-12 rounded-[18px] bg-emerald-500/10 text-emerald-600 font-black flex items-center justify-center text-sm border border-emerald-500/20 shadow-lg">
                            {item.referredName.charAt(0)}
                          </div>
                          <div className="text-base font-black text-slate-900 dark:text-white tracking-tight">{item.referredName}</div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="space-y-1">
                          <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{item.referredSchool}</div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Verification Pending</div>
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        <div className="text-[10px] font-black text-slate-400 uppercase font-mono tracking-widest">
                          {new Date(item.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-10 py-8">
                        {item.status === 'rewarded' ? (
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                            <Check className="w-3 h-3" /> Berildi
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest">
                            <Clock className="w-3 h-3" /> Waiting
                          </div>
                        )}
                      </td>
                      <td className="px-10 py-8 text-right">
                        <div className="text-sm font-black text-amber-500 font-mono tracking-tighter">
                          +{item.rewardCoins} EC
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.section>

      {/* QR Modal (Upgraded) */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[48px] p-10 border border-white/10 shadow-2xl space-y-10 text-center"
            >
               <div className="space-y-2">
                 <h3 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Shaxsiy Eko-QR</h3>
                 <p className="text-sm text-slate-500 font-medium">Sinfdoshlaringiz skaner qilib darhol qo'shilishlari mumkin.</p>
               </div>

               <div className="p-8 bg-white rounded-[40px] inline-block shadow-2xl ring-8 ring-slate-100 dark:ring-white/5">
                 <svg className="w-56 h-56 mx-auto" viewBox="0 0 100 100">
                    <rect width="100" height="100" fill="#ffffff" />
                    <rect x="10" y="10" width="25" height="25" fill="#0f172a" />
                    <rect x="15" y="15" width="15" height="15" fill="#ffffff" />
                    <rect x="18" y="18" width="9" height="9" fill="#10b981" />
                    <rect x="65" y="10" width="25" height="25" fill="#0f172a" />
                    <rect x="70" y="15" width="15" height="15" fill="#ffffff" />
                    <rect x="73" y="18" width="9" height="9" fill="#10b981" />
                    <rect x="10" y="65" width="25" height="25" fill="#0f172a" />
                    <rect x="15" y="70" width="15" height="15" fill="#ffffff" />
                    <rect x="18" y="73" width="9" height="9" fill="#10b981" />
                    <rect x="35" y="40" width="28" height="28" rx="8" fill="#10b981" />
                    <circle cx="49" cy="54" r="7" fill="#ffffff" />
                    <circle cx="49" cy="54" r="4" fill="#065f46" />
                    <rect x="40" y="12" width="6" height="6" fill="#0f172a" />
                    <rect x="50" y="12" width="6" height="6" fill="#0f172a" />
                    <rect x="42" y="24" width="6" height="6" fill="#0f172a" />
                    <rect x="52" y="24" width="6" height="6" fill="#0f172a" />
                 </svg>
               </div>

               <div className="space-y-4">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Referral Code</div>
                  <div className="text-4xl font-black text-emerald-600 font-mono tracking-[0.3em]">{userReferralCode}</div>
               </div>

               <button
                 onClick={() => setShowQrModal(false)}
                 className="w-full py-6 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-black text-[10px] rounded-3xl uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
               >
                 Close Modal
               </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};
