import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  MapPin,
  Coins,
  ShieldCheck,
  TreePine,
  ArrowRight,
  School,
  ExternalLink,
  ChevronRight,
  Target,
  Camera,
  Trophy,
  Gift,
  Radio,
  Share2,
  Edit2,
  Trash2,
  Plus,
  Image as ImageIcon,
  X,
  Compass,
  TrendingUp,
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { EcoAdBanner } from '../components/EcoAdBanner';
import { computeUserStreakState } from '../utils/streak';
import { resolveMediaUrl, openAdTargetUrl } from '../utils/api';
import { EcoReport, HomePost, HomePostCategory, ProblemStatus } from '../types/eco';
import heroEcoForestImg from '../assets/images/hero_eco_forest_1795179384249.jpg';

export const HomePage: React.FC = () => {
  const {
    setActiveTab,
    reports,
    user,
    schools,
    liveMetrics,
    homePosts,
    ecoMissions,
    missionCompletions,
    serverDateKey,
    openDailyStreakModal,
    triggerHaptic,
    editReport,
    deleteReport,
    createHomePost,
    updateHomePost,
    deleteHomePost,
    uploadMediaFile,
    showNotification,
  } = useEco();

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

  const streakState = computeUserStreakState(
    {
      lastStreakClaimDate: user.lastStreakClaimDate,
      storedStreakDays: user.streakDays ?? user.activityStats?.streakDays ?? 0,
    },
    serverDateKey
  );

  // Deterministic XP & Next Level Progress from real EcoContext data
  const userXP = user.ecoXP || (user.totalCoinsEarned || user.ecoCoins || 0) * 4;
  const computedLevel = user.level || Math.max(1, Math.floor(userXP / 500) + 1);
  const xpIntoLevel = userXP % 500;
  const xpToNextLevel = 500 - xpIntoLevel;
  const xpProgressPct = Math.min(100, Math.max(4, Math.round((xpIntoLevel / 500) * 100)));

  // Featured Daily Mission from real ecoMissions
  const activeMissions = useMemo(
    () => ecoMissions.filter(m => m.status === 'active'),
    [ecoMissions]
  );
  const featuredMission = useMemo(
    () =>
      activeMissions.find(m => !missionCompletions.includes(m.id)) ||
      activeMissions[0] ||
      null,
    [activeMissions, missionCompletions]
  );

  // Interactive Uzbekistan Map Preview pins from real schools & reports
  const mapPreviewData = useMemo(() => {
    const projectPoint = (lat?: number, lng?: number) => {
      if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
      }
      // Uzbekistan bounds: lng ~ 55.9..73.2, lat ~ 37.1..45.6
      const x = Math.min(94, Math.max(6, ((lng - 55.9) / (73.2 - 55.9)) * 100));
      const y = Math.min(90, Math.max(10, (1 - (lat - 37.1) / (45.6 - 37.1)) * 100));
      return { x, y };
    };

    const schoolPins = schools
      .slice(0, 24)
      .map(s => {
        const pt = projectPoint(s.lat, s.lng);
        return pt ? { id: s.id, name: s.name, x: pt.x, y: pt.y } : null;
      })
      .filter((p): p is { id: string; name: string; x: number; y: number } => Boolean(p));

    const reportPins = reports
      .slice(0, 24)
      .map(r => {
        const pt = projectPoint(r.lat, r.lng);
        return pt
          ? {
              id: r.id,
              title: r.title,
              resolved: String(r.status).toLowerCase() === 'resolved',
              x: pt.x,
              y: pt.y,
            }
          : null;
      })
      .filter((p): p is { id: string; title: string; resolved: boolean; x: number; y: number } => Boolean(p));

    const resolvedCount = reports.filter(r => String(r.status).toLowerCase() === 'resolved').length;
    const pendingCount = Math.max(0, reports.length - resolvedCount);

    return { schoolPins, reportPins, resolvedCount, pendingCount };
  }, [schools, reports]);

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

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.06,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 14 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 130, damping: 18 } },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="w-full max-w-full overflow-x-clip space-y-6 sm:space-y-9 pb-28 pt-2"
    >
      {/* 0. Live Eco-Radar Uzbekistan Ticker */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-[#071812] border border-emerald-500/25 p-2.5 sm:p-3 shadow-lg shadow-emerald-950/20 flex items-center justify-between gap-2.5 sm:gap-3 text-xs w-full max-w-full">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="relative flex h-2.5 w-2.5 sm:h-3 sm:w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 sm:h-3 sm:w-3 bg-emerald-400" />
            </span>
            <span className="font-black text-emerald-400 uppercase tracking-wider text-[10px] sm:text-[11px] flex items-center gap-1">
              <Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Jonli Eko-Radar</span>
            </span>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-slate-300 text-[11px] sm:text-xs font-medium">
            <div className="animate-marquee">
              <span>
                Jonli baza: <span className="font-bold text-emerald-400 font-mono tabular-nums">{liveMetrics.treesPlanted.toLocaleString()} tup daraxt</span> · <span className="font-bold text-amber-400 font-mono tabular-nums">{liveMetrics.resolvedReports.toLocaleString()} hal etilgan muammo</span> · <span className="text-white font-bold">{topSchoolName}</span> yetakchi · <span className="text-teal-300 font-bold font-mono tabular-nums">{liveMetrics.totalUsers.toLocaleString()}</span> o&apos;quvchi · <span className="text-sky-300 font-bold font-mono tabular-nums">{liveMetrics.botUsersCount.toLocaleString()}</span> bot foydalanuvchisi
              </span>
              <span aria-hidden="true">
                Jonli baza: <span className="font-bold text-emerald-400 font-mono tabular-nums">{liveMetrics.treesPlanted.toLocaleString()} tup daraxt</span> · <span className="font-bold text-amber-400 font-mono tabular-nums">{liveMetrics.resolvedReports.toLocaleString()} hal etilgan muammo</span> · <span className="text-white font-bold">{topSchoolName}</span> yetakchi · <span className="text-teal-300 font-bold font-mono tabular-nums">{liveMetrics.totalUsers.toLocaleString()}</span> o&apos;quvchi · <span className="text-sky-300 font-bold font-mono tabular-nums">{liveMetrics.botUsersCount.toLocaleString()}</span> bot foydalanuvchisi
              </span>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('impact')}
            className="hidden sm:inline-flex items-center gap-1 shrink-0 px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25 text-[10px] font-bold transition-colors cursor-pointer"
          >
            <span>Tahlil</span>
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 1. Hero Welcome Section & EcoHero Rank Card */}
      <section className="relative px-3 sm:px-6 lg:px-8 overflow-x-clip">
        <div className="absolute inset-0 -top-24 overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[640px] bg-gradient-to-b from-emerald-500/12 via-teal-500/5 to-transparent blur-3xl opacity-60" />
          <div className="absolute -top-[10%] -left-[8%] w-[38%] h-[38%] bg-emerald-500/10 rounded-full blur-3xl" />
          <div className="absolute top-[15%] -right-[8%] w-[32%] h-[32%] bg-teal-400/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 lg:gap-12 items-center">
          {/* Left: Futuristic Botanical Welcome */}
          <motion.div variants={itemVariants} className="lg:col-span-7 min-w-0 space-y-5 sm:space-y-7">
            <div className="inline-flex max-w-full items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="truncate">Xush kelibsiz, {user.fullName.split(' ')[0]} · Ekotizim 2.0</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-[1.03] text-balance break-words">
              Tabiatni <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300">EcoHero</span> bilan yashil kelajakka aylantiring.
            </h1>

            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl font-medium">
              Maktabingizni 3 bosqichli ekologik chempionatda yetakchiga aylantiring. EcoHero AI yordamida muammolarni aniqlang, missiyalarni bajaring va <span className="text-slate-900 dark:text-emerald-300 font-extrabold underline decoration-emerald-500/70 decoration-2 underline-offset-4">EcoCoin</span> hamda sertifikatlar yig&apos;ing.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  triggerHaptic('medium');
                  setActiveTab('report');
                }}
                className="min-h-[48px] px-6 sm:px-8 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 text-[#040D0A] font-black text-xs sm:text-sm rounded-2xl shadow-xl shadow-emerald-500/25 transition-all flex items-center gap-2.5 uppercase tracking-wider cursor-pointer"
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
                className="min-h-[48px] px-6 sm:px-7 py-3.5 eco-surface text-slate-900 dark:text-white font-black text-xs sm:text-sm rounded-2xl transition-all flex items-center gap-2.5 uppercase tracking-wider shadow-md hover:border-emerald-500/40 cursor-pointer"
              >
                <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500" />
                <span>Eko Xarita</span>
              </motion.button>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-4 border-t border-slate-200/70 dark:border-emerald-500/15 text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-2 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Ekologiya Vazirligi hamkori</span>
              </div>
              <div className="flex items-center gap-2 font-bold text-xs">
                <TreePine className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Yashil Makon Dasturi</span>
              </div>
            </div>
          </motion.div>

          {/* Right: EcoHero Rank, Avatar, Level, XP & Stats Card */}
          <motion.div variants={itemVariants} className="lg:col-span-5 min-w-0">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/40 via-teal-400/30 to-emerald-600/40 rounded-[32px] blur-md opacity-45 group-hover:opacity-70 transition duration-500" />
              <div className="relative eco-surface rounded-[28px] p-5 sm:p-6 shadow-2xl overflow-hidden space-y-5">
                {/* Ambient glow corner */}
                <div className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full bg-emerald-500/15 blur-2xl" />

                {/* Identity & Rank Header */}
                <div className="flex items-center justify-between gap-3 relative z-10">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-400/60 shadow-lg bg-[#040D0A]">
                        <img
                          src={
                            user.avatarUrl ||
                            user.profileImage ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName || 'EcoHero')}`
                          }
                          className="w-full h-full object-cover"
                          alt={user.fullName}
                        />
                      </div>
                      <span className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-lg bg-gradient-to-r from-emerald-400 to-teal-300 text-[#040D0A] text-[10px] font-black font-mono tabular-nums shadow">
                        Lv.{computedLevel}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 truncate">
                        {user.badge || 'Eko-Lochin'} · EcoHero Rank
                      </div>
                      <div className="font-display text-lg font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                        {user.fullName}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                        {user.schoolName}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                      EcoCoins
                    </div>
                    <div className="flex items-center justify-end gap-1 text-xl sm:text-2xl font-black text-amber-500 dark:text-amber-400 font-mono tabular-nums">
                      <Coins className="w-5 h-5 fill-amber-500/20" />
                      <span>{user.ecoCoins.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* XP Progress to Next Level */}
                <div className="p-3.5 rounded-2xl bg-slate-100/80 dark:bg-[#040D0A]/75 border border-slate-200/80 dark:border-emerald-500/15 space-y-2 relative z-10">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-mono tabular-nums">{userXP.toLocaleString()} XP</span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      Lv.{computedLevel + 1} gacha {xpToNextLevel} XP
                    </span>
                  </div>
                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-emerald-950/90 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${xpProgressPct}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-300 shadow-[0_0_12px_rgba(52,211,153,0.5)]"
                    />
                  </div>
                </div>

                {/* Real Activity Stats Row */}
                <div className="grid grid-cols-3 gap-2.5 text-center relative z-10">
                  <div className="p-3 rounded-2xl bg-white/80 dark:bg-[#05130E] border border-slate-200/70 dark:border-emerald-500/15">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Hisobotlar</div>
                    <div className="text-base font-black text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
                      {user.reportsCount || 0}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white/80 dark:bg-[#05130E] border border-slate-200/70 dark:border-emerald-500/15">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Daraxtlar</div>
                    <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums mt-0.5">
                      {user.treesPlanted || 0}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={openDailyStreakModal}
                    className="p-3 rounded-2xl bg-white/80 dark:bg-[#05130E] border border-slate-200/70 dark:border-emerald-500/15 hover:border-amber-400/50 transition-colors cursor-pointer"
                  >
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">Streak</div>
                    <div className="text-base font-black text-amber-500 dark:text-amber-400 font-mono tabular-nums mt-0.5">
                      {streakState.currentStreakDays} kun
                    </div>
                  </button>
                </div>

                {/* Quick Navigation Buttons */}
                <div className="grid grid-cols-2 gap-2.5 relative z-10">
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveTab('shop');
                    }}
                    className="min-h-[42px] py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-105 text-[#040D0A] rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                  >
                    Eko-Bozor
                  </button>
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveTab('championship');
                    }}
                    className="min-h-[42px] py-2.5 bg-slate-900 dark:bg-[#0D261D] hover:bg-slate-800 dark:hover:bg-[#133528] text-white border border-emerald-500/20 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    Chempionat
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 2. Interactive Environmental Map Preview + Featured Daily Mission */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Interactive Map Preview */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-7 eco-surface rounded-[28px] p-5 sm:p-6 shadow-xl space-y-4 flex flex-col justify-between"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Compass className="w-4 h-4" />
                  <span>Ekologik Monitoring Xaritasi</span>
                </div>
                <h2 className="font-display text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">
                  O&apos;zbekiston Jonli Eko-Nuqtalari
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab('map');
                }}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 text-xs font-black inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>Xaritani Ochish</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive SVG Radar Map rendered strictly from real schools + reports coords */}
            <div
              onClick={() => setActiveTab('map')}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') setActiveTab('map');
              }}
              className="relative h-52 sm:h-56 rounded-2xl bg-[#04110C] border border-emerald-500/25 overflow-hidden cursor-pointer group"
            >
              {/* Crisp Geospatial Grid */}
              <svg
                viewBox="0 0 100 60"
                className="w-full h-full"
                preserveAspectRatio="none"
                aria-label="O'zbekiston ekologik xarita ko'rinishi"
              >
                <defs>
                  <radialGradient id="mapRadarGlow" cx="50%" cy="50%" r="55%">
                    <stop offset="0%" stopColor="rgba(16, 185, 129, 0.22)" />
                    <stop offset="100%" stopColor="rgba(4, 17, 12, 0)" />
                  </radialGradient>
                </defs>
                <rect width="100" height="60" fill="url(#mapRadarGlow)" />
                {[12, 24, 36, 48].map(y => (
                  <line key={`h-${y}`} x1="0" y1={y} x2="100" y2={y} stroke="rgba(52,211,153,0.08)" strokeWidth="0.25" />
                ))}
                {[20, 40, 60, 80].map(x => (
                  <line key={`v-${x}`} x1={x} y1="0" x2={x} y2="60" stroke="rgba(52,211,153,0.08)" strokeWidth="0.25" />
                ))}
                {/* Stylized Uzbekistan silhouette contour */}
                <path
                  d="M8,16 L24,12 L38,24 L54,22 L66,18 L82,25 L92,31 L84,42 L72,49 L58,47 L42,37 L24,33 L12,26 Z"
                  fill="rgba(16, 185, 129, 0.1)"
                  stroke="rgba(52, 211, 153, 0.35)"
                  strokeWidth="0.45"
                />
              </svg>

              {/* Live School Pins */}
              {mapPreviewData.schoolPins.map(pin => (
                <div
                  key={pin.id}
                  title={pin.name}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-indigo-400 ring-2 ring-indigo-400/30"
                />
              ))}

              {/* Live Report Pins */}
              {mapPreviewData.reportPins.map(pin => (
                <div
                  key={pin.id}
                  title={pin.title}
                  style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full ring-4 ${
                    pin.resolved
                      ? 'bg-emerald-400 ring-emerald-400/25'
                      : 'bg-amber-400 ring-amber-400/25'
                  }`}
                />
              ))}

              {/* Legend & Summary Footer inside Map */}
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#040D0A]/85 backdrop-blur-md border border-emerald-500/25 text-[11px] text-slate-200">
                <div className="flex items-center gap-3 font-semibold tabular-nums">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    {schools.length} maktab
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    {mapPreviewData.pendingCount} faol
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    {mapPreviewData.resolvedCount} hal etilgan
                  </span>
                </div>
                <span className="text-emerald-400 font-bold group-hover:underline">
                  2D / 3D Globus →
                </span>
              </div>
            </div>
          </motion.div>

          {/* Featured Daily Mission Spotlight Card */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-5 relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0A261B] via-[#071912] to-[#040D0A] border border-emerald-500/30 p-5 sm:p-6 text-white shadow-xl flex flex-col justify-between gap-4"
          >
            <div className="pointer-events-none absolute -right-12 -top-12 w-40 h-40 rounded-full bg-emerald-400/15 blur-2xl" />
            <div className="space-y-2.5 relative z-10">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 text-emerald-400 font-black uppercase tracking-wider text-[11px]">
                  <Target className="w-4 h-4" />
                  <span>Kunlik Tanlangan Missiya</span>
                </span>
                <span className="font-mono tabular-nums text-[11px] font-bold text-slate-300">
                  {missionCompletions.length} / {activeMissions.length} bajarildi
                </span>
              </div>

              {featuredMission ? (
                <>
                  <h3 className="font-display text-lg sm:text-xl font-extrabold text-white leading-snug">
                    {featuredMission.title}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-3">
                    {featuredMission.description}
                  </p>
                </>
              ) : (
                <>
                  <h3 className="font-display text-lg sm:text-xl font-extrabold text-white leading-snug">
                    Yangi ekologik missiyalar bilan ball to&apos;plang
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Eko-viktorinalar, Telegram kanallar va amaliy topshiriqlarni bajarib EcoCoin yuting.
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-emerald-500/20 relative z-10">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Mukofot</div>
                <div className="text-lg font-black font-mono tabular-nums text-amber-400 flex items-center gap-1">
                  <Coins className="w-4 h-4" />
                  <span>+{featuredMission?.rewardCoins || 100} EC</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setActiveTab('missions');
                }}
                className="min-h-[42px] px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 hover:brightness-105 text-[#040D0A] font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 shadow-lg shadow-emerald-500/25 cursor-pointer"
              >
                <span>Bajarish</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* 4. Quick Action Dock for Mobile / TMA */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
          {[
            {
              id: 'missions',
              title: 'Missiyalar',
              desc: 'Quiz, Kanal · +Coin',
              icon: Target,
              gradient: 'from-emerald-500 to-teal-400',
            },
            {
              id: 'ai',
              title: 'AI Eko-Lab',
              desc: 'EcoHero AI tahlili',
              icon: Sparkles,
              gradient: 'from-emerald-400 to-cyan-500',
            },
            {
              id: 'championship',
              title: '3 Bosqichli Liga',
              desc: 'Tuman · Viloyat · Respublika',
              icon: Trophy,
              gradient: 'from-amber-400 to-orange-500',
            },
            {
              id: 'shop',
              title: 'Eko-Bozor',
              desc: "Sovg'alar va vaucherlar",
              icon: Gift,
              gradient: 'from-teal-500 to-emerald-500',
            },
            {
              id: 'referral',
              title: "Do'stlarni Taklif",
              desc: "+100 EcoCoin bonus",
              icon: Share2,
              gradient: 'from-rose-500 to-amber-500',
            },
          ].map(act => {
            const Icon = act.icon;
            return (
              <motion.button
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.98 }}
                key={act.id}
                onClick={() => {
                  triggerHaptic('light');
                  setActiveTab(act.id);
                }}
                className="min-h-[84px] p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400/60 text-left transition-all group shadow-sm flex flex-col justify-between cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${act.gradient} text-slate-950 flex items-center justify-center shadow-sm`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div>
                  <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white group-hover:text-emerald-400 transition-colors truncate">
                    {act.title}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                    {act.desc}
                  </p>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* 6. Ad Placement: Premium Banner */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <EcoAdBanner placement="home_top" />
      </section>

      {/* 7. Sardorlar va Platforma Postlari */}
      {(activeHomePosts.length > 0 || isSuperAdmin) && (
        <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div className="min-w-0 space-y-1">
              <h2 className="font-display text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Sardorlar & Platforma Postlari
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bot yangiliklari, hamkor saytlar, Telegram kanallar va maktab tadbirlari
              </p>
            </div>
            {isSuperAdmin && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openCreatePost}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Qo&apos;shish</span>
                </button>
                <button
                  onClick={() => setActiveTab('admin')}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline transition-colors cursor-pointer shrink-0"
                >
                  <span>Kabinetdan boshqarish</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
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
                  className="min-w-0 eco-surface rounded-3xl overflow-hidden flex flex-col justify-between shadow-lg hover:border-emerald-500/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="relative h-44 bg-[#040D0A] overflow-hidden">
                      <img
                        src={resolveMediaUrl(post.imageUrl || '/assets/schools/eco_courtyard.jpg')}
                        onError={e => {
                          e.currentTarget.src = heroEcoForestImg;
                        }}
                        alt={post.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#040D0A]/90 via-[#040D0A]/25 to-transparent" />
                      {isSuperAdmin && (
                        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditPost(post)}
                            className="p-2 rounded-xl bg-[#040D0A]/80 text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                            title="Postni o'zgartirish"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteHomePost(post.id)}
                            className="p-2 rounded-xl bg-[#040D0A]/80 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
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
                          <span className="text-slate-200 font-mono tabular-nums shrink-0">{formattedDate}</span>
                        )}
                      </div>
                    </div>

                    <div className="p-5 space-y-2.5 min-w-0">
                      <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight break-words">
                        {post.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed break-words line-clamp-3">
                        {post.content}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 pb-5 pt-3 border-t border-slate-200/70 dark:border-emerald-500/15 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {post.schoolName ? `${post.schoolName} · ` : ''}
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">{post.authorName}</span>
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

      {/* 8. Community Activity Feed: Latest Impact Reports */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Jonli Eko-Hisobotlar
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              O&apos;zbekiston bo&apos;ylab o&apos;quvchilar tomonidan yuborilgan so&apos;nggi arizalar
            </p>
          </div>
          <button
            onClick={() => setActiveTab('map')}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline transition-colors cursor-pointer shrink-0"
          >
            <span>Barchasi xaritada</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {recentReports.map(report => (
            <motion.div
              whileHover={{ y: -4 }}
              key={report.id}
              className="group eco-surface rounded-3xl overflow-hidden shadow-xl hover:border-emerald-500/40 transition-colors"
            >
              <div className="relative h-48 overflow-hidden bg-[#040D0A]">
                <img
                  src={resolveMediaUrl(report.imageUrl)}
                  referrerPolicy="no-referrer"
                  onError={e => {
                    e.currentTarget.src = heroEcoForestImg;
                  }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  alt={report.title}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#040D0A]/75 via-transparent to-black/25" />
                <div className="absolute top-3 left-3 px-2.5 py-1 bg-[#040D0A]/75 backdrop-blur-md border border-white/10 rounded-full text-[10px] font-bold text-white uppercase tracking-wider">
                  {report.region}
                </div>
                <div
                  className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-bold text-white uppercase tracking-wider ${
                    report.status === 'resolved' || report.status === 'RESOLVED' ? 'bg-emerald-600' : 'bg-amber-600'
                  }`}
                >
                  {report.status === 'resolved' || report.status === 'RESOLVED' ? 'Hal qilindi' : "O'rganilmoqda"}
                </div>
                {isSuperAdmin && (
                  <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditReport(report)}
                      className="p-2 rounded-xl bg-[#040D0A]/85 text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                      title="Hisobotni o'zgartirish"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteReport(report.id)}
                      className="p-2 rounded-xl bg-[#040D0A]/85 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                      title="Hisobotni o'chirish"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <div className="p-5 space-y-3">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <School className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="truncate">{report.schoolName}</span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                  {report.title}
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                  {report.description}
                </p>
                <div className="pt-3 border-t border-slate-200/70 dark:border-emerald-500/15 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-bold font-mono tabular-nums text-xs">
                    <Coins className="w-4 h-4 fill-amber-400/20" /> +{report.rewardCoins} Eco
                  </div>
                  <button
                    onClick={() => setActiveTab('map')}
                    className="p-2 bg-slate-100 dark:bg-[#0D261D] hover:bg-emerald-600 text-slate-600 dark:text-emerald-300 hover:text-white rounded-xl transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* 9. Eco Media & Akademiya */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-6">
          <div className="space-y-1">
            <h2 className="font-display text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              Eko Media & Akademiya
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ekologik ta&apos;lim va so&apos;nggi yangiliklar markazi
            </p>
          </div>
          <button
            onClick={() => setActiveTab('media')}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline transition-colors cursor-pointer shrink-0"
          >
            <span>Barchasini o&apos;qish</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div
            whileHover={{ scale: 1.01 }}
            onClick={() => setActiveTab('media')}
            className="relative aspect-[16/9] rounded-3xl overflow-hidden shadow-2xl cursor-pointer group border border-emerald-500/25"
          >
            <img
              src={heroEcoForestImg}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              alt="Yashil Makon 2026"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#040D0A] via-[#040D0A]/45 to-transparent" />
            <div className="absolute bottom-6 left-6 right-6 space-y-2">
              <span className="px-2.5 py-1 bg-emerald-500 text-[#040D0A] rounded-lg text-[10px] font-black uppercase tracking-wider">
                Top Yangilik
              </span>
              <h3 className="font-display text-xl font-black text-white tracking-tight">
                O&apos;zbekistonda &apos;Yashil Makon&apos; 2026 yangi mavsumi start oldi
              </h3>
              <p className="text-slate-200 text-xs line-clamp-2">
                Loyiha doirasida har bir maktabda ko&apos;kalamzorlashtirish aksiyasi va o&apos;quvchilar o&apos;rtasida Eko-Chempionat o&apos;tkazilmoqda.
              </p>
            </div>
          </motion.div>

          <div className="space-y-3.5">
            {[
              { title: 'Plastikni saralash va qayta ishlashning 5 oltin qoidasi', cat: 'Akademiya', date: '2 kun avval' },
              { title: "Eko Chempionat: Maktablar o'rtasida tuman bosqichi qizg'in kechmoqda", cat: 'Reyting', date: 'Kecha' },
              { title: 'EcoHero AI bilan daraxt turlarini aniqlash va parvarishlash', cat: 'Texnologiya', date: 'Bugun' },
            ].map((news, i) => (
              <div
                key={i}
                onClick={() => setActiveTab('media')}
                className="p-4 sm:p-5 eco-surface rounded-2xl flex items-center justify-between group cursor-pointer hover:border-emerald-500/45 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{news.cat}</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-500">{news.date}</span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {news.title}
                  </h4>
                </div>
                <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#0D261D] flex items-center justify-center text-slate-500 dark:text-emerald-300 group-hover:bg-emerald-500 group-hover:text-[#040D0A] transition-all shrink-0 ml-3">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 10. Strategic Partners Strip */}
      <section className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="p-6 rounded-3xl eco-surface text-center space-y-4">
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Rasmiy Hamkorlar va Tizim Qo&apos;llab-Quvvatlovchilari
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 sm:gap-3">
            {['EKOLOGIYA VAZIRLIGI', "MAKTABGACHA TA'LIM", 'YOSHLAR ISHLARI', 'SANFA EKO', 'IT PARK', 'YASHIL MAKON'].map((p, i) => (
              <div
                key={i}
                onClick={() => setActiveTab('partners')}
                className="py-3 px-2 rounded-xl bg-white dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 text-slate-600 dark:text-slate-300 font-extrabold text-[10px] break-words hover:text-emerald-600 dark:hover:text-emerald-400 hover:border-emerald-500/45 cursor-pointer transition-colors"
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
          <div className="w-full max-w-md rounded-3xl bg-[#071812] border border-emerald-500/25 text-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase">Hisobotni O&apos;zgartirish</h3>
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none focus:border-emerald-500"
              />
              <textarea
                rows={3}
                value={repDesc}
                onChange={e => setRepDesc(e.target.value)}
                placeholder="Tavsif"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none focus:border-emerald-500 resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  value={repCoins}
                  onChange={e => setRepCoins(e.target.value)}
                  placeholder="EcoCoin mukofoti"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none"
                />
                <select
                  value={repStatus}
                  onChange={e => setRepStatus(e.target.value as ProblemStatus)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none"
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
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#040D0A] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
              >
                {savingReport ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Inline Post Create / Edit Modal */}
      {isSuperAdmin && postModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-[#071812] border border-emerald-500/25 text-white p-6 space-y-4 shadow-2xl">
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none"
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
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none"
              />
              <textarea
                rows={3}
                required
                value={postContent}
                onChange={e => setPostContent(e.target.value)}
                placeholder="Post matni"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none resize-none"
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none"
                />
                <input
                  type="text"
                  value={postCtaUrl}
                  onChange={e => setPostCtaUrl(e.target.value)}
                  placeholder="Havola URL"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none"
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
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#040D0A] font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
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
