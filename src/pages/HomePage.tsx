import React, { useMemo, useState } from 'react';
import {
  MapPin,
  Coins,
  ArrowRight,
  ExternalLink,
  ChevronRight,
  Camera,
  BarChart3,
  Flame,
  ShoppingCart,
  Crown,
  Handshake,
  Edit2,
  Trash2,
  Plus,
  Image as ImageIcon,
  X,
  TrendingUp,
  School,
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { EcoAdBanner } from '../components/EcoAdBanner';
import {
  EcoChampionshipTrophyArt,
  EcoGiftLeavesArt,
  EcoMiniGiftArt,
  EcoTargetArt,
} from '../components/home/HomeHubArtworks';
import { computeUserStreakState } from '../utils/streak';
import { calculateLevelProgress } from '../utils/level';
import { resolveMediaUrl, openAdTargetUrl } from '../utils/api';
import { HomePost, HomePostCategory } from '../types/eco';
import heroEcoForestImg from '../assets/images/hero_eco_forest_1795179384249.jpg';
import realisticAvatarImg from '../assets/images/profile_avatar_realistic_1795605008121.jpg';

export const HomePage: React.FC = () => {
  const {
    setActiveTab,
    openRatingTier,
    user,
    homePosts,
    ecoMissions,
    missionCompletions,
    serverDateKey,
    openDailyStreakModal,
    triggerHaptic,
    createHomePost,
    updateHomePost,
    deleteHomePost,
    uploadMediaFile,
    showNotification,
  } = useEco();

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

  const roleHeaderLabel =
    user.role === 'super_admin'
      ? 'BOSH ADMINISTRATOR'
      : user.role === 'school_admin' || user.role === 'district_coordinator' || user.role === 'regional_coordinator'
      ? 'MAKTAB KOORDINATORI'
      : (user.badge || 'EKO-LOCHIN').toUpperCase();

  const streakState = computeUserStreakState(
    {
      lastStreakClaimDate: user.lastStreakClaimDate,
      storedStreakDays: user.streakDays ?? user.activityStats?.streakDays ?? 0,
    },
    serverDateKey
  );

  // Progressive XP & Next Level Progress from real EcoContext data
  const userXP = user.ecoXP || (user.totalCoinsEarned || user.ecoCoins || 0) * 4;
  const levelProgress = calculateLevelProgress(userXP);
  const computedLevel = levelProgress.level;
  const xpToNextLevel = levelProgress.xpRemainingForNextLevel;
  const xpProgressPct = levelProgress.progressPct;

  // Featured Daily Mission reward hint for Missiyalar banner
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

  const handleUploadInlineImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        setPostImageUrl(up.url);
        showNotification('Rasm muvaffaqiyatli yuklandi!', 'success');
      } else {
        showNotification(up.error || 'Rasm yuklashda xatolik', 'warning');
      }
    } finally {
      setUploadingMedia(false);
      e.target.value = '';
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
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring' as const, stiffness: 140, damping: 18 },
    },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative w-full max-w-full overflow-x-clip space-y-5 sm:space-y-7 pb-28 pt-1"
    >
      {/* Ambient emerald botanical background aura */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[120%] h-80 bg-gradient-to-b from-emerald-500/12 via-teal-500/5 to-transparent blur-3xl" />
        <div className="hidden dark:block absolute bottom-12 left-1/2 -translate-x-1/2 w-[90%] max-w-4xl h-44 rounded-full bg-emerald-400/12 blur-3xl" />
      </div>

      {/* 1. Unified Consolidated Hub (Top CTA + Profile Card + 4 Visual Banners) */}
      <section className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 space-y-3.5 sm:space-y-4">
        {/* Top concise tagline + 2 Primary CTA buttons */}
        <motion.div variants={itemVariants} className="space-y-3">
          <p className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 leading-snug max-w-2xl">
            Muammolarni aniqlang, missiyalarni bajaring va{' '}
            <span className="font-bold text-emerald-600 dark:text-emerald-400">EcoCoin</span> hamda sertifikatlar yig&apos;ing.
          </p>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 max-w-2xl">
            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                setActiveTab('report');
              }}
              className="min-h-[48px] px-3 sm:px-6 py-3 rounded-2xl bg-gradient-to-r from-[#00F5A0] via-[#10E88A] to-[#00D9A3] text-[#04110B] font-black text-[11px] sm:text-sm uppercase tracking-wider shadow-[0_0_24px_rgba(16,232,138,0.32)] hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span className="truncate">MUAMMO YUBORISH</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('map');
              }}
              className="min-h-[48px] px-3 sm:px-6 py-3 rounded-2xl bg-white/95 dark:bg-[#061812]/95 border border-emerald-500/35 hover:border-emerald-400/70 text-slate-900 dark:text-white font-black text-[11px] sm:text-sm uppercase tracking-wider shadow-lg shadow-emerald-950/20 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span className="truncate">EKO XARITA</span>
            </motion.button>
          </div>
        </motion.div>

        {/* Main Consolidated Grid: Left Profile/XP/Stats Card | Right 4 Stacked Feature Banners */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 items-start">
          {/* Unified Profile, XP & 3-Column Stats Card */}
          <motion.div variants={itemVariants} className="lg:col-span-5 min-w-0">
            <div className="relative rounded-[26px] p-[1px] bg-gradient-to-br from-emerald-400/50 via-teal-500/20 to-emerald-500/40 shadow-2xl shadow-emerald-950/35">
              <div className="relative rounded-[25px] bg-white/95 dark:bg-gradient-to-b dark:from-[#081F16] dark:via-[#061711] dark:to-[#04110C] backdrop-blur-xl p-4 sm:p-5 space-y-3.5 overflow-hidden">
                <div className="pointer-events-none absolute -top-12 -right-12 w-36 h-36 rounded-full bg-emerald-400/15 blur-2xl" />

                {/* Identity Header */}
                <div className="flex items-center justify-between gap-2.5 relative z-10">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border-2 border-emerald-400/60 shadow-lg bg-[#040D0A]">
                        <img
                          src={
                            (user.avatarUrl && !user.avatarUrl.includes('dicebear.com') ? user.avatarUrl : '') ||
                            (user.profileImage && !user.profileImage.includes('dicebear.com') ? user.profileImage : '') ||
                            realisticAvatarImg
                          }
                          className="w-full h-full object-cover"
                          alt={user.fullName}
                        />
                      </div>
                      <span className="absolute -bottom-1.5 -right-1.5 px-1.5 py-0.5 rounded-lg bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-[10px] font-black font-mono tabular-nums shadow">
                        Lv. {computedLevel}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 truncate">
                        {roleHeaderLabel}
                      </div>
                      <div className="font-display text-lg font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
                        {user.fullName}
                      </div>
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-300/85 truncate">
                        {user.schoolName || 'Maktab biriktirilmagan'}
                      </div>
                    </div>
                  </div>

                  {/* EcoCOINS Counter */}
                  <div className="text-right shrink-0">
                    <div className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">
                      EcoCOINS
                    </div>
                    <div className="flex items-center justify-end gap-1.5 text-xl sm:text-2xl font-black text-amber-500 dark:text-amber-400 font-mono tabular-nums mt-0.5">
                      <Coins className="w-5 h-5 fill-amber-400/25 shrink-0" />
                      <span>{user.ecoCoins.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* XP Progress Box */}
                <div className="p-3 rounded-2xl bg-slate-100/90 dark:bg-[#04100B]/85 border border-slate-200 dark:border-emerald-400/20 space-y-2 relative z-10">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-700 dark:text-emerald-300 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      <span className="font-mono tabular-nums">{userXP.toLocaleString()} XP</span>
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                      Lv. {computedLevel + 1} gacha {xpToNextLevel.toLocaleString()} XP
                    </span>
                  </div>
                  <div className="relative w-full h-2.5 rounded-full bg-slate-200 dark:bg-emerald-950/90 overflow-visible">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${xpProgressPct}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      className="relative h-full rounded-full bg-gradient-to-r from-emerald-500 via-[#10E88A] to-[#00F5A0] shadow-[0_0_12px_rgba(16,232,138,0.65)]"
                    >
                      <span className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 rounded-full bg-[#4ADE80] ring-2 ring-[#00F5A0]/50 shadow-[0_0_10px_#00F5A0]" />
                    </motion.div>
                  </div>
                </div>

                {/* Bottom 3-Column Interactive Stat Tiles */}
                <div className="grid grid-cols-3 gap-2 relative z-10">
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      if (user.role === 'ambassador') {
                        openRatingTier('ambassador', { filterToMyDistrict: true });
                      } else {
                        openRatingTier('student');
                      }
                    }}
                    className="p-2.5 rounded-2xl bg-white dark:bg-[#05140E]/90 border border-slate-200 dark:border-emerald-400/20 hover:border-emerald-400/55 transition-all flex flex-col items-center justify-center gap-1 text-center cursor-pointer"
                  >
                    <School className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-[10.5px] leading-tight font-bold text-slate-700 dark:text-slate-200">
                      Maktabdagi reytingim
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setActiveTab('profile');
                    }}
                    className="p-2.5 rounded-2xl bg-white dark:bg-[#05140E]/90 border border-slate-200 dark:border-emerald-400/20 hover:border-emerald-400/55 transition-all flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer"
                  >
                    <BarChart3 className="w-4 h-4 text-emerald-500 dark:text-[#00F5A0]" />
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Daraxtlar
                    </span>
                    <span className="text-sm font-black text-emerald-600 dark:text-[#00F5A0] font-mono tabular-nums leading-tight">
                      {user.treesPlanted || 0}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      openDailyStreakModal();
                    }}
                    className="p-2.5 rounded-2xl bg-white dark:bg-[#05140E]/90 border border-slate-200 dark:border-emerald-400/20 hover:border-amber-400/55 transition-all flex flex-col items-center justify-center gap-0.5 text-center cursor-pointer"
                  >
                    <Flame className="w-4 h-4 text-amber-400 fill-amber-400/25" />
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      Streak
                    </span>
                    <span className="text-sm font-black text-amber-500 dark:text-amber-400 font-mono tabular-nums leading-tight">
                      {streakState.currentStreakDays} kun
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right: 4 Consolidated Graphic Feature Banners */}
          <motion.div variants={itemVariants} className="lg:col-span-7 min-w-0 space-y-3">
            {/* 1. Eko-Bozor Banner */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('shop');
              }}
              className="w-full relative overflow-hidden rounded-2xl bg-white/95 dark:bg-gradient-to-r dark:from-[#082117] dark:via-[#061A12] dark:to-[#0A2C1D] border border-emerald-500/35 hover:border-emerald-400/75 px-4 py-3 flex items-center justify-between gap-3 text-left shadow-lg shadow-emerald-950/20 group cursor-pointer"
            >
              <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 w-28 h-20 rounded-full bg-emerald-400/15 blur-xl" />
              <div className="flex items-center gap-3.5 min-w-0 relative z-10">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-6 h-6 text-emerald-500 dark:text-[#00F5A0]" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    Eko-Bozor
                  </div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-300 truncate">
                    Sovg&apos;alar va vaucherlar
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 relative z-10">
                <EcoGiftLeavesArt className="w-14 h-14 sm:w-16 sm:h-16" />
                <ArrowRight className="w-5 h-5 text-emerald-500 dark:text-[#00F5A0] group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.button>

            {/* 2. Chempionat Spotlight Banner */}
            <motion.div
              whileHover={{ scale: 1.008 }}
              onClick={() => {
                triggerHaptic('medium');
                setActiveTab('championship');
              }}
              role="button"
              tabIndex={0}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') setActiveTab('championship');
              }}
              className="w-full relative overflow-hidden rounded-[22px] bg-[#061D15] bg-gradient-to-r from-[#072117] via-[#072B22] to-[#051812] border border-emerald-400/45 hover:border-emerald-400/80 px-3.5 sm:px-5 py-3.5 flex items-center justify-between gap-3 shadow-xl shadow-emerald-950/35 cursor-pointer group"
            >
              {/* Subtle stadium radial aura behind trophy */}
              <div className="pointer-events-none absolute -left-4 top-1/2 -translate-y-1/2 w-40 h-32 rounded-full bg-amber-400/15 blur-2xl" />
              <div className="pointer-events-none absolute right-0 top-0 w-44 h-full bg-gradient-to-l from-teal-400/10 to-transparent" />

              <div className="shrink-0 relative z-10">
                <EcoChampionshipTrophyArt className="w-24 h-24 sm:w-28 sm:h-28" />
              </div>

              <div className="flex-1 min-w-0 space-y-1.5 relative z-10">
                <div className="flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-400 fill-amber-400/40 shrink-0" />
                  <h3 className="font-display text-lg sm:text-xl font-black text-white tracking-tight truncate">
                    Chempionat
                  </h3>
                </div>
                <p className="text-xs sm:text-[13px] text-slate-200/90 font-medium leading-snug line-clamp-2">
                  Eng faol bo&apos;ling va g&apos;olib bo&apos;ling!
                </p>
                <div className="pt-1">
                  <span className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-gradient-to-r from-[#00F5A0] via-[#10E88A] to-[#00D9A3] text-[#04110B] font-black text-xs sm:text-sm shadow-[0_0_20px_rgba(16,232,138,0.45)] group-hover:brightness-105 transition-all">
                    <span>Kirish</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            </motion.div>

            {/* 3. Missiyalar Compact Banner */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('missions');
              }}
              className="w-full relative overflow-hidden rounded-2xl bg-white/95 dark:bg-gradient-to-r dark:from-[#071D14] dark:to-[#05150F] border border-emerald-500/30 hover:border-emerald-400/70 px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 text-left shadow-md group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <EcoTargetArt className="w-12 h-12 shrink-0" />
                <div className="min-w-0">
                  <div className="font-display text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    Missiyalar
                  </div>
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-300 truncate">
                    Vazifalarni bajaring va EcoCoin oling!
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 dark:bg-[#04100B] border border-amber-400/35 text-amber-400 font-black font-mono tabular-nums text-xs">
                  <Coins className="w-3.5 h-3.5 fill-amber-400/20" />
                  <span>+{featuredMission?.rewardCoins || 100}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-emerald-500 dark:text-[#00F5A0] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </motion.button>

            {/* 4. Do'stlarni Taklif Compact Banner */}
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('referral');
              }}
              className="w-full relative overflow-hidden rounded-2xl bg-white/95 dark:bg-gradient-to-r dark:from-[#071D14] dark:to-[#05150F] border border-emerald-500/30 hover:border-emerald-400/70 px-3.5 sm:px-4 py-3 flex items-center justify-between gap-3 text-left shadow-md group cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/25 flex items-center justify-center shrink-0">
                  <Handshake className="w-6 h-6 text-emerald-500 dark:text-[#00F5A0]" />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-sm sm:text-base font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    Do&apos;stlarni Taklif
                  </div>
                  <div className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-300 truncate">
                    Do&apos;stlaringni taklif et va bonus oling!
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <EcoMiniGiftArt className="w-11 h-11 shrink-0" />
                <ChevronRight className="w-4 h-4 text-emerald-500 dark:text-[#00F5A0] group-hover:translate-x-0.5 transition-transform" />
              </div>
            </motion.button>
          </motion.div>
        </div>
      </section>

      {/* 2. Ad Placement: Premium Banner */}
      <section className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
        <EcoAdBanner placement="home_top" />
      </section>

      {/* 3. Sardorlar va Platforma Postlari */}
      {(activeHomePosts.length > 0 || isSuperAdmin) && (
        <section className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
            <div className="min-w-0 space-y-1">
              <h2 className="font-display text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
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
                    onChange={handleUploadInlineImage}
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
