import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  MapPin,
  Send,
  Coins,
  ShieldCheck,
  TreePine,
  Users,
  CheckCircle2,
  ArrowRight,
  TrendingUp,
  ShoppingBag,
  School,
  ExternalLink,
  ChevronRight,
  Target,
  Zap,
  Flame,
  Camera,
  Trophy,
  Gift,
  Check,
  Radio,
  Share2,
  Edit2,
  Trash2,
  Plus,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { EcoAdBanner } from '../components/EcoAdBanner';
import { computeUserStreakState, DAILY_STREAK_REWARDS } from '../utils/streak';
import { resolveMediaUrl, openAdTargetUrl } from '../utils/api';
import { EcoReport, HomePost, HomePostCategory, ProblemStatus } from '../types/eco';

export const HomePage: React.FC = () => {
  const {
    setActiveTab,
    reports,
    user,
    schools,
    liveMetrics,
    homePosts,
    claimDailyStreakReward,
    triggerHaptic,
    editReport,
    deleteReport,
    createHomePost,
    updateHomePost,
    deleteHomePost,
    uploadMediaFile,
    showNotification,
  } = useEco();
  const [isClaimingStreak, setIsClaimingStreak] = useState(false);

  // Super Admin inline report editor state
  const [editingReport, setEditingReport] = useState<EcoReport | null>(null);
  const [repTitle, setRepTitle] = useState('');
  const [repDesc, setRepDesc] = useState('');
  const [repCoins, setRepCoins] = useState('50');
  const [repStatus, setRepStatus] = useState<ProblemStatus>('pending');
  const [repImageUrl, setRepImageUrl] = useState('');
  const [savingReport, setSavingReport] = useState(false);

  // Super Admin inline post editor state
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<HomePost | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCategory, setPostCategory] = useState<HomePostCategory>('news');
  const [postImageUrl, setPostImageUrl] = useState('');
  const [postCtaText, setPostCtaText] = useState('');
  const [postCtaUrl, setPostCtaUrl] = useState('');
  const [postPinned, setPostPinned] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const isSuperAdmin = user.role === 'super_admin';

  const topSchoolName =
    schools.slice().sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0))[0]?.name ||
    'O‘zbekiston maktablari';

  const streakState = computeUserStreakState({
    lastStreakClaimDate: user.lastStreakClaimDate,
    storedStreakDays: user.streakDays ?? user.activityStats?.streakDays ?? 0,
  });

  const recentReports = reports.slice(0, 3);
  const activeHomePosts = [...homePosts]
    .filter(p => p.status === 'active')
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));

  const postCategoryLabel: Record<string, string> = {
    bot_news: 'Bot yangiligi',
    channel_ad: 'Telegram kanal reklamasi',
    website: 'Foydali sayt',
    school_event: 'Maktab tadbiri',
    news: 'Eko-yangilik',
  };

  const handleUploadInlineImage = async (e: React.ChangeEvent<HTMLInputElement>, target: 'report' | 'post') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      showNotification('Fayl hajmi 80 MB dan oshmasligi kerak', 'warning');
      e.target.value = '';
      return;
    }
    setUploadingMedia(true);
    try {
      const up = await uploadMediaFile(file, file.name);
      if (up.success && up.url) {
        if (target === 'report') setRepImageUrl(up.url);
        else setPostImageUrl(up.url);
        showNotification('Rasm muvaffaqiyatli yuklandi!', 'success');
      } else {
        showNotification(up.error || 'Rasm yuklashda xatolik', 'warning');
      }
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
    }
  };

  const openEditReport = (rep: EcoReport) => {
    setEditingReport(rep);
    setRepTitle(rep.title);
    setRepDesc(rep.description);
    setRepCoins(String(rep.rewardCoins || 50));
    setRepStatus(rep.status);
    setRepImageUrl(rep.imageUrl || '');
  };

  const handleSaveReportEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReport || savingReport) return;
    setSavingReport(true);
    try {
      const res = await editReport(editingReport.id, {
        title: repTitle.trim() || editingReport.title,
        description: repDesc.trim() || editingReport.description,
        rewardCoins: Math.max(0, Number(repCoins) || 0),
        status: repStatus,
        imageUrl: repImageUrl.trim() || editingReport.imageUrl,
      });
      if (res.success) setEditingReport(null);
    } finally {
      setSavingReport(false);
    }
  };

  const openCreatePost = () => {
    setEditingPost(null);
    setPostTitle('');
    setPostContent('');
    setPostCategory('news');
    setPostImageUrl('/assets/schools/eco_courtyard.jpg');
    setPostCtaText("Batafsil ko'rish");
    setPostCtaUrl('https://t.me/Ecoheros_bot');
    setPostPinned(false);
    setPostModalOpen(true);
  };

  const openEditPost = (post: HomePost) => {
    setEditingPost(post);
    setPostTitle(post.title);
    setPostContent(post.content);
    setPostCategory(post.category);
    setPostImageUrl(post.imageUrl || '');
    setPostCtaText(post.ctaText || '');
    setPostCtaUrl(post.ctaUrl || '');
    setPostPinned(Boolean(post.isPinned));
    setPostModalOpen(true);
  };

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim() || savingPost) return;
    setSavingPost(true);
    try {
      if (editingPost) {
        const res = await updateHomePost(editingPost.id, {
          title: postTitle.trim(),
          content: postContent.trim(),
          category: postCategory,
          imageUrl: postImageUrl.trim() || undefined,
          ctaText: postCtaText.trim() || undefined,
          ctaUrl: postCtaUrl.trim() || undefined,
          isPinned: postPinned,
        });
        if (res.success) {
          setPostModalOpen(false);
          setEditingPost(null);
        }
      } else {
        const res = await createHomePost({
          title: postTitle.trim(),
          content: postContent.trim(),
          category: postCategory,
          imageUrl: postImageUrl.trim() || undefined,
          ctaText: postCtaText.trim() || undefined,
          ctaUrl: postCtaUrl.trim() || undefined,
          isPinned: postPinned,
        });
        if (res.success) {
          setPostModalOpen(false);
        }
      }
    } finally {
      setSavingPost(false);
    }
  };

  const handleClaimStreak = async () => {
    if (streakState.claimedToday || isClaimingStreak) return;
    setIsClaimingStreak(true);
    try {
      await claimDailyStreakReward();
    } finally {
      setIsClaimingStreak(false);
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 120 } },
  };

  return (
    <motion.div 
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-full max-w-full overflow-x-clip space-y-10 sm:space-y-16 pb-28 pt-2"
    >
      
      {/* 0. Standout Feature: Live Eco-Radar Uzbekistan Ticker */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border border-emerald-500/30 p-2.5 sm:p-3 shadow-lg flex items-center justify-between gap-2.5 sm:gap-3 text-xs w-full max-w-full">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-500" />
            </span>
            <span className="font-black text-emerald-400 uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center gap-1">
              <Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Jonli Eko-Radar</span>
            </span>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-slate-300 text-[11px] sm:text-xs font-medium">
            <div className="animate-marquee">
              <span>
                Jonli baza: <span className="font-bold text-emerald-400 font-mono">{liveMetrics.treesPlanted.toLocaleString()} tup daraxt</span> · <span className="font-bold text-amber-400 font-mono">{liveMetrics.resolvedReports.toLocaleString()} hal etilgan muammo</span> · <span className="text-white font-bold">{topSchoolName}</span> yetakchi · <span className="text-teal-400 font-bold font-mono">{liveMetrics.totalUsers.toLocaleString()}</span> ro'yxatdan o'tgan foydalanuvchi
              </span>
              <span aria-hidden="true">
                Jonli baza: <span className="font-bold text-emerald-400 font-mono">{liveMetrics.treesPlanted.toLocaleString()} tup daraxt</span> · <span className="font-bold text-amber-400 font-mono">{liveMetrics.resolvedReports.toLocaleString()} hal etilgan muammo</span> · <span className="text-white font-bold">{topSchoolName}</span> yetakchi · <span className="text-teal-400 font-bold font-mono">{liveMetrics.totalUsers.toLocaleString()}</span> ro'yxatdan o'tgan foydalanuvchi
              </span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('impact')}
            className="hidden sm:inline-flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 text-[10px] font-bold transition-colors cursor-pointer"
          >
            <span>Tahlil</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 1. Hero Section: Cinematic Look */}
      <section className="relative px-3 sm:px-6 lg:px-8 overflow-x-clip">
        <div className="absolute inset-0 -top-24 overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent blur-3xl opacity-50" />
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-3xl" />
          <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-emerald-600/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 lg:gap-16 items-center">
            
            {/* Left: Content */}
            <motion.div variants={itemVariants} className="lg:col-span-7 min-w-0 space-y-5 sm:space-y-8">
              <div className="inline-flex max-w-full items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase tracking-wider sm:tracking-widest text-emerald-600 dark:text-emerald-400">
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">O'zbekiston Yoshlari Eko-Ekotizimi 2.0</span>
              </div>

              <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-slate-900 dark:text-white tracking-tighter leading-[0.98] text-balance break-words">
                Tabiatni <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-300">AI</span> bilan <br className="hidden sm:block" /> asraymiz.
              </h1>

              <p className="text-sm sm:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl font-medium">
                Maktabingizni 3 bosqichli ekologik chempionatda g'olib qiling. EcoHero AI yordamida muammolarni aniqlang va <span className="text-slate-900 dark:text-white font-black underline decoration-emerald-500 decoration-4 underline-offset-4">EcoCoin</span> hamda sertifikatlar yig'ing.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    triggerHaptic('medium');
                    setActiveTab('report');
                  }}
                  className="px-5 sm:px-8 py-3.5 sm:py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xl shadow-emerald-600/30 transition-all flex items-center gap-2.5 uppercase tracking-wider cursor-pointer"
                >
                  <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Muammo Yuborish</span>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveTab('map');
                  }}
                  className="px-5 sm:px-8 py-3.5 sm:py-4 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-black text-xs sm:text-sm rounded-2xl border border-slate-200 dark:border-slate-800 transition-all flex items-center gap-2.5 uppercase tracking-wider shadow-md hover:bg-slate-50 dark:hover:bg-slate-800/80 cursor-pointer"
                >
                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                  <span>Eko Xarita</span>
                </motion.button>
              </div>

              <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-5 border-t border-slate-100 dark:border-slate-800/60 text-slate-400">
                <div className="flex items-center gap-2 font-bold text-xs"><ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" /> Ekologiya Vazirligi</div>
                <div className="flex items-center gap-2 font-bold text-xs"><TreePine className="w-4 h-4 text-emerald-500 shrink-0" /> Yashil Makon Dasturi</div>
              </div>
            </motion.div>

            {/* Right: Dashboard Preview & Daily Streak Card */}
            <motion.div variants={itemVariants} className="lg:col-span-5 min-w-0 space-y-4">
              
              {/* Profile Card */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-teal-500 rounded-[36px] blur opacity-25 group-hover:opacity-40 transition duration-1000" />
                <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-6 sm:p-7 shadow-xl overflow-hidden space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-500/30 shadow-md">
                        <img src={user.avatarUrl} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div>
                        <div className="text-lg font-black text-slate-900 dark:text-white tracking-tight">{user.fullName.split(' ')[0]}</div>
                        <div className="text-[11px] font-semibold text-emerald-500 truncate max-w-[170px]">{user.schoolName}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Balans</div>
                      <div className="flex items-center gap-1 text-xl sm:text-2xl font-black text-amber-500 font-mono">
                        <Coins className="w-5 h-5 fill-amber-500/20" /> {user.ecoCoins.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center">
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-bold text-slate-400">Hisobotlar</div>
                      <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">{user.reportsCount || 0}</div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-bold text-slate-400">Daraxtlar</div>
                      <div className="text-sm font-black text-emerald-500 font-mono mt-0.5">{user.treesPlanted || 0}</div>
                    </div>
                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] font-bold text-slate-400">Daraja</div>
                      <div className="text-sm font-black text-indigo-400 font-mono mt-0.5">Lv. {user.level || 12}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveTab('shop');
                      }}
                      className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md transition-all cursor-pointer"
                    >
                      Eko-Bozor
                    </button>
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        setActiveTab('championship');
                      }}
                      className="py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Chempionat
                    </button>
                  </div>
                </div>
              </div>

              {/* Standout Feature: Progressive Daily Streak Claiming Widget */}
              <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-amber-500/30 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                      <Flame className="w-6 h-6 fill-amber-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900 dark:text-white text-sm tabular-nums">
                          {streakState.currentStreakDays > 0
                            ? `${streakState.currentStreakDays} Kunlik Eko-Streak`
                            : 'Kunlik Eko-Streak'}
                        </span>
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          {streakState.claimedToday
                            ? 'Bugun faol'
                            : streakState.wasResetDueToInactivity
                            ? 'Qayta boshlash'
                            : `${streakState.claimDayNumber}-kun tayyor`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                        {streakState.claimedToday
                          ? `Bugun +${streakState.todayReward} EcoCoin olindi · Ertaga +${streakState.nextTomorrowReward} EcoCoin`
                          : streakState.wasResetDueToInactivity
                          ? 'Kecha kirmaganingiz uchun mukofot 1-kundan (+50 EcoCoin) boshlanadi'
                          : `Bugun kiring va +${streakState.todayReward} EcoCoin oling · Ertaga +${streakState.nextTomorrowReward}`}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={streakState.claimedToday || isClaimingStreak}
                    onClick={handleClaimStreak}
                    className={`w-full sm:w-auto px-5 min-h-[44px] rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer ${
                      streakState.claimedToday
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700'
                        : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 shadow-md shadow-amber-500/20'
                    }`}
                  >
                    {streakState.claimedToday ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span>Bugun olindi</span>
                      </>
                    ) : (
                      <>
                        <Gift className="w-4 h-4 shrink-0" />
                        <span className="tabular-nums">
                          {isClaimingStreak ? 'Yuklanmoqda...' : `+${streakState.todayReward} EcoCoin Olish`}
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {/* 7-Day Escalating Motivation Ladder */}
                <div className="grid grid-cols-7 gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {DAILY_STREAK_REWARDS.map((coins, idx) => {
                    const dayNum = idx + 1;
                    const effectiveCycleDay =
                      streakState.currentStreakDays > 7 && streakState.claimedToday
                        ? 7
                        : streakState.currentStreakDays;
                    const isDone =
                      streakState.claimedToday
                        ? dayNum <= effectiveCycleDay
                        : dayNum < streakState.claimDayNumber && streakState.currentStreakDays > 0;
                    const isTodayTarget = !streakState.claimedToday && dayNum === Math.min(7, streakState.claimDayNumber);

                    return (
                      <div
                        key={dayNum}
                        className={`rounded-xl py-1.5 px-1 text-center border text-[10px] tabular-nums ${
                          isDone
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold'
                            : isTodayTarget
                            ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400 font-bold'
                            : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <div className="text-[9px] opacity-80">{dayNum}-k</div>
                        <div className="font-mono font-bold">+{coins}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </motion.div>

          </div>
        </div>
      </section>

      {/* 2. Standout Feature: Quick Action Dock for Mobile / TMA */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {[
            {
              id: 'missions',
              title: 'Missiyalar',
              desc: 'Quiz, Kanal & Topshiriqlar',
              icon: Target,
              gradient: 'from-amber-500 to-orange-500',
              badge: '+Coin',
            },
            {
              id: 'ai',
              title: 'AI Eko-Lab',
              desc: 'Sun\'iy intellekt tahlili',
              icon: Sparkles,
              gradient: 'from-emerald-500 to-teal-500',
              badge: 'EcoHero AI',
            },
            {
              id: 'championship',
              title: '3 Bosqichli Liga',
              desc: 'Tuman, Viloyat, Respublika',
              icon: Trophy,
              gradient: 'from-yellow-500 to-amber-500',
              badge: 'Mavsumiy',
            },
            {
              id: 'shop',
              title: 'Eko-Bozor',
              desc: 'Sovg\'alar va gadjetlar',
              icon: Gift,
              gradient: 'from-indigo-500 to-blue-500',
              badge: 'Sovg\'alar',
            },
            {
              id: 'referral',
              title: 'Do\'stlarni Taklif',
              desc: '+100 EcoCoin har bir do\'stga',
              icon: Share2,
              gradient: 'from-rose-500 to-pink-500',
              badge: 'Bonus',
            },
          ].map(act => {
            const Icon = act.icon;
            return (
              <motion.button
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                key={act.id}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(act.id);
                }}
                className="p-4 rounded-3xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-left transition-all group shadow-sm flex flex-col justify-between cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-2xl bg-gradient-to-tr ${act.gradient} text-white flex items-center justify-center shadow-md`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    {act.badge}
                  </span>
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-white group-hover:text-emerald-400 transition-colors">
                    {act.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                    {act.desc}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* 3. Key Metrics: 100% Real Live Database Totals */}
      <section className="max-w-7xl mx-auto px-4">
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {[
            { label: 'Ro\'yxatdan o\'tgan Maktablar', val: liveMetrics.totalSchools.toLocaleString(), icon: School, color: 'text-indigo-400' },
            { label: 'Ro\'yxatdagi O\'quvchilar', val: liveMetrics.totalUsers.toLocaleString(), icon: Users, color: 'text-emerald-400' },
            { label: 'Hal Qilingan Muammolar', val: liveMetrics.resolvedReports.toLocaleString(), icon: Target, color: 'text-teal-400' },
            { label: 'Ekilgan Daraxtlar', val: liveMetrics.treesPlanted.toLocaleString(), icon: TreePine, color: 'text-amber-400' },
          ].map((m) => (
            <div key={m.label} className="group p-5 sm:p-6 bg-slate-900 border border-slate-800 rounded-3xl shadow-sm hover:border-emerald-500/50 transition-all text-center space-y-1">
               <div className={`w-10 h-10 rounded-2xl bg-slate-800 ${m.color} flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform`}>
                  <m.icon className="w-5 h-5" />
               </div>
               <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight tabular-nums">{m.val}</div>
               <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{m.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* 4. Ad Placement: Premium Banner */}
      <section className="max-w-7xl mx-auto px-4">
        <EcoAdBanner placement="home_top" />
      </section>

      {/* 4.5 Sardorlar va Platforma Postlari (Bot yangiliklari, saytlar, kanallar) */}
      {(activeHomePosts.length > 0 || isSuperAdmin) && (
        <section className="max-w-7xl mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div className="min-w-0 space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                Sardorlar & Platforma Postlari
              </h2>
              <p className="text-xs text-slate-400">
                Bot yangiliklari, hamkor saytlar, Telegram kanallar va maktab tadbirlari
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={openCreatePost}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Qo'shish</span>
                </button>
              )}
              <button
                onClick={() => setActiveTab('admin')}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer shrink-0"
              >
                <span>Kabinetdan boshqarish</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {activeHomePosts.map(post => {
              const catLabel = postCategoryLabel[post.category] || 'Yangilik';
              const formattedDate = post.createdAt
                ? new Date(post.createdAt).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'short' })
                : '';
              return (
                <article
                  key={post.id}
                  className="min-w-0 bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden flex flex-col justify-between shadow-lg hover:border-emerald-500/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="relative h-44 bg-slate-950 overflow-hidden">
                      <img
                        src={resolveMediaUrl(post.imageUrl || '/assets/schools/eco_courtyard.jpg')}
                        onError={e => {
                          e.currentTarget.src = '/assets/schools/eco_courtyard.jpg';
                        }}
                        alt={post.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent" />
                      {isSuperAdmin && (
                        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditPost(post)}
                            className="p-2 rounded-xl bg-slate-950/80 text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                            title="Postni o'zgartirish"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHomePost(post.id)}
                            className="p-2 rounded-xl bg-slate-950/80 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                            title="Postni o'chirish"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between gap-2 text-[11px] font-bold">
                        <span className="text-emerald-400 truncate">
                          {catLabel}
                          {post.isPinned ? ' · Muhim' : ''}
                        </span>
                        {formattedDate && (
                          <span className="text-slate-300 font-mono tabular-nums shrink-0">{formattedDate}</span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 space-y-2.5 min-w-0">
                      <h3 className="text-base font-extrabold text-white tracking-tight break-words">
                        {post.title}
                      </h3>
                      <p className="text-xs text-slate-300 leading-relaxed break-words line-clamp-3">
                        {post.content}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-[11px] text-slate-400 truncate">
                      {post.schoolName ? `${post.schoolName} · ` : ''}
                      <span className="text-slate-300 font-semibold">{post.authorName}</span>
                    </div>

                    {post.ctaUrl && (
                      <button
                        type="button"
                        onClick={() => openAdTargetUrl(post.ctaUrl)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer"
                      >
                        <span>{post.ctaText || 'Ochish'}</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* 5. Spotlight: Latest Impact Reports */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
           <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Jonli Eko-Hisobotlar</h2>
              <p className="text-xs text-slate-400">O'zbekiston bo'ylab o'quvchilar tomonidan yuborilgan so'nggi arizalar</p>
           </div>
           <button onClick={() => setActiveTab('map')} className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer">
              <span>Barchasi xaritada</span>
              <ChevronRight className="w-4 h-4" />
           </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {recentReports.map(report => (
            <motion.div
              whileHover={{ y: -6 }}
              key={report.id}
              className="group bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl"
            >
              <div className="relative h-48 overflow-hidden">
                <img src={resolveMediaUrl(report.imageUrl)} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-[10px] font-bold text-white uppercase tracking-wider">{report.region}</div>
                <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wider ${report.status === 'resolved' || report.status === 'RESOLVED' ? 'bg-emerald-600' : 'bg-amber-600'}`}>
                   {report.status === 'resolved' || report.status === 'RESOLVED' ? 'Hal qilindi' : 'O\'rganilmoqda'}
                </div>
                {isSuperAdmin && (
                  <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditReport(report)}
                      className="p-2 rounded-xl bg-slate-950/85 text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                      title="Hisobotni o'zgartirish"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteReport(report.id)}
                      className="p-2 rounded-xl bg-slate-950/85 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                      title="Hisobotni o'chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="p-5 space-y-3">
                <div className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                   <School className="w-3.5 h-3.5 text-emerald-400" />
                   <span className="truncate">{report.schoolName}</span>
                </div>
                <h3 className="text-base font-extrabold text-white tracking-tight truncate">{report.title}</h3>
                <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{report.description}</p>
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                   <div className="flex items-center gap-1 text-amber-400 font-bold text-xs">
                      <Coins className="w-4 h-4 fill-amber-400/20" /> +{report.rewardCoins} Eco
                   </div>
                   <button
                    onClick={() => setActiveTab('map')}
                    className="p-2 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer"
                   >
                     <ChevronRight className="w-4 h-4" />
                   </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 6. Eco Media: Latest News Section */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
           <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Eko Media & Akademiya</h2>
              <p className="text-xs text-slate-400">Ekologik ta'lim va so'nggi yangiliklar markazi</p>
           </div>
           <button onClick={() => setActiveTab('media')} className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer">
              <span>Barchasini o'qish</span>
              <ChevronRight className="w-4 h-4" />
           </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* Big Article Preview */}
           <motion.div 
             whileHover={{ scale: 1.01 }}
             onClick={() => setActiveTab('media')}
             className="relative aspect-[16/9] rounded-3xl overflow-hidden shadow-2xl cursor-pointer group"
           >
              <img src="https://images.unsplash.com/photo-1473081556163-2a17de81fc97?auto=format&fit=crop&w=1200&q=80" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6 space-y-2">
                 <span className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase tracking-wider">Top Yangilik</span>
                 <h3 className="text-xl font-black text-white tracking-tight">O'zbekistonda 'Yashil Makon' 2026 yangi mavsumi start oldi</h3>
                 <p className="text-slate-300 text-xs line-clamp-2">Loyiha doirasida har bir maktabda ko'kalamzorlashtirish aksiyasi va o'quvchilar o'rtasida Eko-Chempionat o'tkazilmoqda.</p>
              </div>
           </motion.div>

           <div className="space-y-3.5">
              {[
                { title: 'Plastikni saralash va qayta ishlashning 5 oltin qoidasi', cat: 'Akademiya', date: '2 kun avval' },
                { title: 'Eko Chempionat: Maktablar o\'rtasida tuman bosqichi qizg\'in kechmoqda', cat: 'Reyting', date: 'Kecha' },
                { title: 'EcoHero AI bilan daraxt turlarini aniqlash va parvarishlash', cat: 'Texnologiya', date: 'Bugun' },
              ].map((news, i) => (
                <div key={i} onClick={() => setActiveTab('media')} className="p-4 sm:p-5 bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-between group cursor-pointer hover:border-emerald-500/50 transition-all">
                   <div className="space-y-1">
                      <div className="flex items-center gap-2">
                         <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">{news.cat}</span>
                         <span className="text-[10px] text-slate-500">{news.date}</span>
                      </div>
                      <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{news.title}</h4>
                   </div>
                   <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-emerald-600 group-hover:text-white transition-all shrink-0 ml-3">
                      <ArrowRight className="w-4 h-4" />
                   </div>
                </div>
              ))}
           </div>
        </div>
      </section>

      {/* 7. Strategic Partners Strip */}
      <section className="max-w-7xl mx-auto px-4">
        <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Rasmiy Hamkorlar va Tizim Qo'llab-Quvvatlovchilari
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 sm:gap-3">
            {['EKOLOGIYA VAZIRLIGI', 'MAKTABGACHA TA\'LIM', 'YOSHLAR ISHLARI', 'SANFA EKO', 'IT PARK', 'YASHIL MAKON'].map((p, i) => (
              <div
                key={i}
                onClick={() => setActiveTab('partners')}
                className="py-3 px-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 font-extrabold text-[9px] sm:text-[10px] break-words hover:text-emerald-400 hover:border-emerald-500/40 cursor-pointer transition-colors"
              >
                {p}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Super Admin Inline Report Edit Modal */}
      {editingReport && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 text-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase">Hisobotni O'zgartirish</h3>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveReportEdit} className="space-y-3 text-xs">
              <input
                type="text"
                required
                value={repTitle}
                onChange={e => setRepTitle(e.target.value)}
                placeholder="Sarlavha"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none focus:border-emerald-500"
              />
              <textarea
                rows={3}
                value={repDesc}
                onChange={e => setRepDesc(e.target.value)}
                placeholder="Tavsif"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none focus:border-emerald-500 resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={repCoins}
                  onChange={e => setRepCoins(e.target.value)}
                  placeholder="EcoCoin mukofoti"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none"
                />
                <select
                  value={repStatus}
                  onChange={e => setRepStatus(e.target.value as ProblemStatus)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none"
                >
                  <option value="pending">pending (Kutilmoqda)</option>
                  <option value="verified">verified (Tasdiqlangan)</option>
                  <option value="in_progress">in_progress (Jarayonda)</option>
                  <option value="resolved">resolved (Hal qilindi)</option>
                  <option value="rejected">rejected (Rad etilgan)</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex-1 px-3.5 py-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-bold flex items-center justify-center gap-2 cursor-pointer">
                  <ImageIcon className="w-4 h-4" />
                  <span>{uploadingMedia ? 'Rasm yuklanmoqda...' : 'Yangi rasm yuklash'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleUploadInlineImage(e, 'report')}
                    className="hidden"
                  />
                </label>
                {repImageUrl && (
                  <img
                    src={resolveMediaUrl(repImageUrl)}
                    alt="Report preview"
                    className="w-11 h-11 rounded-xl object-cover border border-emerald-500/40 shrink-0"
                  />
                )}
              </div>
              <button
                type="submit"
                disabled={savingReport || uploadingMedia}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {savingReport ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Inline Post Create / Edit Modal */}
      {postModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 text-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase">
                {editingPost ? "Postni O'zgartirish" : "Yangi Post Qo'shish"}
              </h3>
              <button
                type="button"
                onClick={() => setPostModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSavePost} className="space-y-3 text-xs">
              <select
                value={postCategory}
                onChange={e => setPostCategory(e.target.value as HomePostCategory)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none"
              >
                <option value="news">Eko-yangilik</option>
                <option value="bot_news">Bot yangiligi</option>
                <option value="channel_ad">Telegram kanal</option>
                <option value="school_event">Maktab tadbiri</option>
                <option value="website">Foydali sayt</option>
              </select>
              <input
                type="text"
                required
                value={postTitle}
                onChange={e => setPostTitle(e.target.value)}
                placeholder="Post sarlavhasi"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none"
              />
              <textarea
                rows={3}
                required
                value={postContent}
                onChange={e => setPostContent(e.target.value)}
                placeholder="Post matni"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none resize-none"
              />
              <div className="flex items-center gap-3">
                <label className="flex-1 px-3.5 py-2.5 rounded-xl bg-sky-600/20 border border-sky-500/40 text-sky-300 font-bold flex items-center justify-center gap-2 cursor-pointer">
                  <ImageIcon className="w-4 h-4" />
                  <span>{uploadingMedia ? 'Rasm yuklanmoqda...' : 'Post rasmini yuklash'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleUploadInlineImage(e, 'post')}
                    className="hidden"
                  />
                </label>
                {postImageUrl && (
                  <img
                    src={resolveMediaUrl(postImageUrl)}
                    alt="Post preview"
                    className="w-11 h-11 rounded-xl object-cover border border-sky-500/40 shrink-0"
                  />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={postCtaText}
                  onChange={e => setPostCtaText(e.target.value)}
                  placeholder="Tugma matni"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none"
                />
                <input
                  type="text"
                  value={postCtaUrl}
                  onChange={e => setPostCtaUrl(e.target.value)}
                  placeholder="Havola URL"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none"
                />
              </div>
              <label className="flex items-center gap-2 text-slate-300 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={postPinned}
                  onChange={e => setPostPinned(e.target.checked)}
                  className="rounded"
                />
                <span>Yuqoriga mahkamlash (Muhim)</span>
              </label>
              <button
                type="submit"
                disabled={savingPost || uploadingMedia}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {savingPost ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </form>
          </div>
        </div>
      )}

    </motion.div>
  );
};
