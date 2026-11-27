import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Calendar,
  ChevronRight,
  Crown,
  Edit2,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Leaf,
  Plus,
  Send,
  ShoppingCart,
  Sprout,
  Star,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { EcoAdBanner } from '../components/EcoAdBanner';
import { resolveMediaUrl, openAdTargetUrl, isInsideTelegramWebApp } from '../utils/api';
import {
  ECOHERO_NEWS_CHANNEL_URL,
  ECOHERO_NEWS_CHANNEL_USERNAME,
  isGenericEcoHerouzChannelUrl,
  resolveNewsTelegramPostUrl,
  validateEcoHerouzPostInput,
} from '../utils/telegramNews';
import { HomePost, HomePostCategory } from '../types/eco';
import heroEcoForestImg from '../assets/images/hero_eco_forest_1795179384249.jpg';
import earthEmblemImg from '../assets/images/mission_photo_earth_1795603120184.jpg';
import championshipCupImg from '../assets/images/home_championship_cup_1795602397115.jpg';
import missionTargetImg from '../assets/images/home_mission_target_1795602397153.jpg';
import ecoCameraImg from '../assets/images/media_eco_camera_1795687842823.jpg';
import cleanNatureImg from '../assets/images/report_clean_nature_1795687843689.jpg';
import giftLeavesImg from '../assets/images/home_gift_leaves_1795602395449.jpg';
import trophyCrestImg from '../assets/images/eco_trophy_crest_1795179383102.jpg';
import missionBooksImg from '../assets/images/mission_photo_books_1795603120993.jpg';
import missionPlantingImg from '../assets/images/mission_photo_planting_1795603120304.jpg';

const UZ_MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];

function formatUzNewsDate(iso?: string): string {
  if (!iso) return 'Bugun';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Bugun';
  const day = d.getDate();
  const month = UZ_MONTHS[d.getMonth()] || '';
  return `${day}-${month}`;
}

export const HomePage: React.FC = () => {
  const {
    setActiveTab,
    user,
    homePosts,
    triggerHaptic,
    createHomePost,
    updateHomePost,
    deleteHomePost,
    uploadMediaFile,
    showNotification,
  } = useEco();

  const newsScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeNewsIdx, setActiveNewsIdx] = useState(0);

  // Super Admin inline post editor state
  const [postModalOpen, setPostModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<HomePost | null>(null);
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postCategory, setPostCategory] = useState<HomePostCategory>('news');
  const [postImageUrl, setPostImageUrl] = useState('');
  const [postCtaText, setPostCtaText] = useState('');
  const [postCtaUrl, setPostCtaUrl] = useState('');
  const [postTelegramInput, setPostTelegramInput] = useState('');
  const [postPinned, setPostPinned] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const isSuperAdmin = user.role === 'super_admin';

  const activeHomePosts = useMemo(
    () =>
      [...homePosts]
        .filter(p => p.status === 'active')
        .sort((a, b) => Number(b.isPinned) - Number(a.isPinned)),
    [homePosts]
  );

  const userCityLabel = useMemo(() => {
    const raw = (user.region || 'Andijon')
      .replace(/\s*(viloyati|shahri|respublikasi)\s*/gi, '')
      .trim();
    return raw ? `Yashil ${raw}` : 'Yashil Andijon';
  }, [user.region]);

  const postCategoryMeta: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; badgeClass: string }
  > = {
    news: {
      label: 'Ekologiya',
      icon: Leaf,
      badgeClass: 'text-emerald-300 border-emerald-400/40 bg-[#051811]/85',
    },
    website: {
      label: 'Energetika',
      icon: Zap,
      badgeClass: 'text-amber-300 border-amber-400/40 bg-[#141707]/85',
    },
    bot_news: {
      label: 'Platforma',
      icon: Globe,
      badgeClass: 'text-sky-300 border-sky-400/40 bg-[#061822]/85',
    },
    channel_ad: {
      label: 'Telegram',
      icon: Send,
      badgeClass: 'text-cyan-300 border-cyan-400/40 bg-[#061822]/85',
    },
    school_event: {
      label: 'Maktab',
      icon: Sprout,
      badgeClass: 'text-emerald-300 border-emerald-400/40 bg-[#051811]/85',
    },
  };

  const handleNewsScroll = () => {
    const el = newsScrollRef.current;
    if (!el || activeHomePosts.length <= 1) return;
    const maxScroll = Math.max(1, el.scrollWidth - el.clientWidth);
    const ratio = el.scrollLeft / maxScroll;
    const nextIdx = Math.min(
      activeHomePosts.length - 1,
      Math.max(0, Math.round(ratio * (activeHomePosts.length - 1)))
    );
    if (nextIdx !== activeNewsIdx) {
      setActiveNewsIdx(nextIdx);
    }
  };

  const scrollToNewsIndex = (idx: number) => {
    const el = newsScrollRef.current;
    if (!el) return;
    const cards = el.querySelectorAll<HTMLElement>('[data-news-card]');
    const target = cards[idx];
    if (target) {
      el.scrollTo({ left: target.offsetLeft - 4, behavior: 'smooth' });
      setActiveNewsIdx(idx);
    }
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
    setPostCtaText('');
    setPostCtaUrl('');
    setPostTelegramInput('');
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
    setPostTelegramInput(post.telegramPostUrl || post.telegramPostId || '');
    setPostPinned(Boolean(post.isPinned));
    setPostModalOpen(true);
  };

  const inlineTgValidation = validateEcoHerouzPostInput(postTelegramInput);

  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim() || savingPost) return;
    if (!inlineTgValidation.valid) {
      showNotification(inlineTgValidation.error || 'Telegram post havolasi noto‘g‘ri', 'warning');
      return;
    }
    if (isGenericEcoHerouzChannelUrl(postCtaUrl)) {
      showNotification(
        `Umumiy kanal havolasi emas, aniq post ID yoki ${ECOHERO_NEWS_CHANNEL_URL}/POST_ID kiriting`,
        'warning'
      );
      return;
    }
    setSavingPost(true);
    try {
      const tgPayload = {
        telegramPostId: inlineTgValidation.normalized?.postId || '',
        telegramPostUrl: inlineTgValidation.normalized?.postUrl || '',
        telegramPostInput: postTelegramInput.trim(),
      };
      if (editingPost) {
        const res = await updateHomePost(editingPost.id, {
          title: postTitle.trim(),
          content: postContent.trim(),
          category: postCategory,
          imageUrl: postImageUrl.trim() || undefined,
          ctaText: postCtaText.trim(),
          ctaUrl: postCtaUrl.trim(),
          ...tgPayload,
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
          ...tgPayload,
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
      transition: { staggerChildren: 0.04 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring' as const, stiffness: 150, damping: 20 },
    },
  };

  const quickOpportunityTiles = [
    {
      id: 'shop',
      title: 'Eco Bozor',
      subtitle: "Sovg'alar va chegirmalar",
      icon: ShoppingCart,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-emerald-500/15 border-emerald-400/35',
      bgPhoto: giftLeavesImg,
      onClick: () => {
        triggerHaptic('light');
        setActiveTab('shop');
      },
    },
    {
      id: 'championship',
      title: 'Champiyonat',
      subtitle: 'Eng kuchli maktab va tumanlar',
      icon: Crown,
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/15 border-amber-400/35',
      bgPhoto: trophyCrestImg,
      onClick: () => {
        triggerHaptic('medium');
        setActiveTab('championship');
      },
    },
    {
      id: 'eco_bilim',
      title: 'Eco Bilim',
      subtitle: 'Ekologiya testlari va viktorinalar',
      icon: BookOpen,
      iconColor: 'text-sky-400',
      iconBg: 'bg-sky-500/15 border-sky-400/35',
      bgPhoto: missionBooksImg,
      onClick: () => {
        triggerHaptic('medium');
        setActiveTab('eco_bilim');
      },
    },
    {
      id: 'green_city',
      title: userCityLabel,
      subtitle: 'Toza va yashil shahar uchun',
      icon: Sprout,
      iconColor: 'text-[#00F5A0]',
      iconBg: 'bg-emerald-500/15 border-emerald-400/35',
      bgPhoto: missionPlantingImg,
      onClick: () => {
        triggerHaptic('light');
        setActiveTab('map');
      },
    },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative w-full max-w-full overflow-x-clip pb-28 pt-1 sm:pt-2 space-y-4 sm:space-y-6"
    >
      {/* Ambient emerald botanical aura */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[120%] h-80 bg-gradient-to-b from-emerald-500/14 via-teal-500/5 to-transparent blur-3xl" />
        <div className="hidden dark:block absolute bottom-10 left-1/2 -translate-x-1/2 w-[92%] max-w-5xl h-48 rounded-full bg-emerald-400/10 blur-3xl" />
      </div>

      {/* SECTION 1: EKOLOGIK YANGILIKLAR */}
      <motion.section
        variants={itemVariants}
        className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 space-y-3"
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-emerald-400/45 shadow-[0_0_14px_rgba(16,232,138,0.28)] shrink-0 bg-[#04120C]">
              <img
                src={earthEmblemImg}
                alt="Ekologik yangiliklar"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="font-display text-base sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
              Ekologik yangiliklar
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={openCreatePost}
                className="min-h-[36px] px-3 py-1.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-700 dark:text-[#00F5A0] text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Post qo‘shish</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveTab('media');
              }}
              className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-[#082519]/90 border border-slate-200 dark:border-emerald-400/35 hover:border-emerald-400/75 text-slate-800 dark:text-emerald-100 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition-all whitespace-nowrap shrink-0"
            >
              <span>Barchasi</span>
              <ArrowRight className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00F5A0]" />
            </button>
          </div>
        </div>

        {/* Horizontal Swipe Carousel (Peek on mobile, 3-up crisp track on desktop) */}
        {activeHomePosts.length > 0 ? (
          <div className="space-y-2.5">
            <div
              ref={newsScrollRef}
              onScroll={handleNewsScroll}
              className="flex gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth pb-1"
            >
              {activeHomePosts.map(post => {
                const catMeta = postCategoryMeta[post.category] || postCategoryMeta.news;
                const CatIcon = catMeta.icon;
                const formattedDate = formatUzNewsDate(post.createdAt);
                const telegramPostUrl = resolveNewsTelegramPostUrl(post);
                const fallbackCtaUrl =
                  post.category !== 'news' &&
                  post.ctaUrl &&
                  !isGenericEcoHerouzChannelUrl(post.ctaUrl)
                    ? post.ctaUrl
                    : '';
                const targetUrl = telegramPostUrl || fallbackCtaUrl;
                const buttonLabel = telegramPostUrl
                  ? post.category === 'news'
                    ? 'Batafsil o‘qish'
                    : post.ctaText?.trim() || 'Batafsil o‘qish'
                  : post.ctaText?.trim() || 'Ochish';

                return (
                  <article
                    key={post.id}
                    data-news-card
                    className="w-[78vw] max-w-[335px] sm:w-[330px] lg:w-[calc((100%-2rem)/3)] shrink-0 snap-start rounded-[22px] overflow-hidden border border-slate-200 dark:border-emerald-400/30 bg-white dark:bg-gradient-to-b dark:from-[#082418] dark:to-[#04140D] shadow-xl shadow-emerald-950/20 flex flex-col justify-between transition-colors hover:border-emerald-400/60"
                  >
                    <div className="min-w-0">
                      {/* Card Image */}
                      <div className="relative h-36 sm:h-42 bg-[#040D0A] overflow-hidden">
                        <img
                          src={resolveMediaUrl(post.imageUrl || '/assets/schools/eco_courtyard.jpg')}
                          onError={e => {
                            e.currentTarget.src = heroEcoForestImg;
                          }}
                          referrerPolicy="no-referrer"
                          alt={post.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#051A11] via-[#051A11]/25 to-black/25" />

                        {/* Category Pill Overlay (top-left) */}
                        <div className="absolute top-2.5 left-2.5 z-10">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md shadow-sm ${catMeta.badgeClass}`}
                          >
                            <CatIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{catMeta.label}</span>
                          </span>
                        </div>

                        {/* Super Admin Edit/Delete */}
                        {isSuperAdmin && (
                          <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditPost(post)}
                              className="p-1.5 rounded-xl bg-[#040D0A]/80 text-amber-300 hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                              title="Postni o'zgartirish"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteHomePost(post.id)}
                              className="p-1.5 rounded-xl bg-[#040D0A]/80 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                              title="Postni o'chirish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Metadata & Title */}
                      <div className="p-3.5 sm:p-4 pb-2 space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-emerald-100/75 tabular-nums">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                            <span>{formattedDate}</span>
                          </span>
                          <span className="truncate max-w-[140px] text-slate-500 dark:text-emerald-200/70">
                            {post.schoolName || post.authorName || ECOHERO_NEWS_CHANNEL_USERNAME}
                          </span>
                        </div>

                        <h2 className="font-display text-sm sm:text-[15px] font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2">
                          {post.title}
                        </h2>
                      </div>
                    </div>

                    {/* Full-Width Green Read More CTA (only rendered when direct post link exists) */}
                    {targetUrl ? (
                      <div className="px-3.5 sm:px-4 pb-3.5 pt-1.5">
                        <a
                          href={targetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => {
                            if (isInsideTelegramWebApp()) {
                              e.preventDefault();
                              openAdTargetUrl(targetUrl);
                            }
                          }}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-gradient-to-r from-[#10B981] to-[#059669] dark:from-[#138D59] dark:to-[#0C6A42] hover:brightness-110 border border-emerald-400/45 text-white font-bold text-xs sm:text-[13px] flex items-center justify-center gap-1.5 shadow-[0_4px_16px_rgba(16,185,129,0.24)] transition-all"
                        >
                          <span>{buttonLabel}</span>
                          <ChevronRight className="w-4 h-4 shrink-0" />
                        </a>
                      </div>
                    ) : (
                      <div className="px-3.5 sm:px-4 pb-3.5 pt-0.5">
                        <p className="text-[11px] text-slate-500 dark:text-emerald-100/65 line-clamp-2 leading-relaxed">
                          {post.content}
                        </p>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Carousel Pagination Dots */}
            {activeHomePosts.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 pt-0.5">
                {activeHomePosts.slice(0, 8).map((post, idx) => {
                  const isCurrent = idx === activeNewsIdx;
                  return (
                    <button
                      key={post.id}
                      type="button"
                      aria-label={`${idx + 1}-yangilik`}
                      onClick={() => scrollToNewsIndex(idx)}
                      className={`rounded-full transition-all cursor-pointer ${
                        isCurrent
                          ? 'w-5 h-2 bg-[#00F5A0] shadow-[0_0_8px_rgba(0,245,160,0.65)]'
                          : 'w-2 h-2 bg-slate-300 dark:bg-emerald-500/30 hover:bg-emerald-400/60'
                      }`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-[22px] border border-slate-200 dark:border-emerald-400/25 bg-white/95 dark:bg-[#061D15]/90 p-6 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="font-display text-sm font-extrabold text-slate-900 dark:text-white">
                Ekologik yangiliklar tez orada joylanadi
              </div>
              <p className="text-xs text-slate-500 dark:text-emerald-100/70">
                Rasmiy {ECOHERO_NEWS_CHANNEL_USERNAME} kanali postlarini bu yerdan kuzatishingiz mumkin.
              </p>
            </div>
            <a
              href={ECOHERO_NEWS_CHANNEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-500 text-[#04110B] font-bold text-xs inline-flex items-center gap-1.5 shrink-0"
            >
              <span>Kanal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </motion.section>

      {/* SECTION 2: MUSOBAQALAR & ECO MISSIYALAR (2-Column Feature Spotlights) */}
      <motion.section
        variants={itemVariants}
        className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          {/* Musobaqalar Card */}
          <motion.button
            whileHover={{ scale: 1.012 }}
            whileTap={{ scale: 0.985 }}
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setActiveTab('rating');
            }}
            className="relative overflow-hidden rounded-[20px] sm:rounded-[24px] border border-slate-200 dark:border-emerald-400/35 hover:border-emerald-400/75 bg-white dark:bg-gradient-to-br dark:from-[#0A2B1D] dark:via-[#072116] dark:to-[#04140D] p-2.5 sm:p-4 flex items-center justify-between gap-2 sm:gap-3.5 text-left shadow-xl shadow-emerald-950/20 group cursor-pointer min-h-[82px] sm:min-h-[98px]"
          >
            <div className="pointer-events-none absolute -left-4 -bottom-4 w-24 h-24 rounded-full bg-amber-400/15 blur-2xl" />
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 relative z-10">
              <div className="w-11 h-11 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-amber-400/40 bg-[#04110B] shadow-md shrink-0">
                <img
                  src={championshipCupImg}
                  alt="Musobaqalar kubogi"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="min-w-0 space-y-0.5">
                <h2 className="font-display text-[13px] sm:text-lg font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                  Musobaqalar
                </h2>
                <p className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-emerald-100/75 leading-snug line-clamp-2">
                  Eng faol bo&apos;ling va sovg&apos;alar yuting!
                </p>
              </div>
            </div>

            <span className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#00F5A0] group-hover:translate-x-0.5 transition-transform relative z-10">
              <ChevronRight className="w-4 h-4" />
            </span>
          </motion.button>

          {/* Eco Missiyalar Card */}
          <motion.button
            whileHover={{ scale: 1.012 }}
            whileTap={{ scale: 0.985 }}
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setActiveTab('missions');
            }}
            className="relative overflow-hidden rounded-[20px] sm:rounded-[24px] border border-slate-200 dark:border-emerald-400/35 hover:border-emerald-400/75 bg-white dark:bg-gradient-to-br dark:from-[#0A2B1D] dark:via-[#072116] dark:to-[#04140D] p-2.5 sm:p-4 flex items-center justify-between gap-2 sm:gap-3.5 text-left shadow-xl shadow-emerald-950/20 group cursor-pointer min-h-[82px] sm:min-h-[98px]"
          >
            <div className="pointer-events-none absolute -left-4 -bottom-4 w-24 h-24 rounded-full bg-emerald-400/15 blur-2xl" />
            <div className="flex items-center gap-2 sm:gap-3.5 min-w-0 relative z-10">
              <div className="w-11 h-11 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-emerald-400/40 bg-[#04110B] shadow-md shrink-0">
                <img
                  src={missionTargetImg}
                  alt="Eco Missiyalar"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="min-w-0 space-y-0.5">
                <h2 className="font-display text-[13px] sm:text-lg font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                  Eco Missiyalar
                </h2>
                <p className="text-[10px] sm:text-xs font-medium text-slate-500 dark:text-emerald-100/75 leading-snug line-clamp-2">
                  Tabiat uchun vazifalarni bajaring!
                </p>
              </div>
            </div>

            <span className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-emerald-500/15 dark:bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#00F5A0] group-hover:translate-x-0.5 transition-transform relative z-10">
              <ChevronRight className="w-4 h-4" />
            </span>
          </motion.button>
        </div>
      </motion.section>

      {/* SECTION 3: WIDE ACTION BANNER — MUAMMONI XABAR QILISH */}
      <motion.section
        variants={itemVariants}
        className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8"
      >
        <motion.div
          whileHover={{ scale: 1.005 }}
          whileTap={{ scale: 0.992 }}
          role="button"
          tabIndex={0}
          onClick={() => {
            triggerHaptic('medium');
            setActiveTab('report');
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveTab('report');
            }
          }}
          className="relative overflow-hidden rounded-[22px] sm:rounded-[26px] border border-emerald-400/45 hover:border-emerald-300/80 bg-[#051F14] px-3.5 sm:px-6 py-3.5 sm:py-5 flex items-center justify-between gap-3 sm:gap-5 shadow-2xl shadow-emerald-950/35 cursor-pointer group"
        >
          {/* Photorealistic nature & green city backdrop with high-contrast scrim */}
          <img
            src={cleanNatureImg}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute right-0 top-0 h-full w-3/4 sm:w-2/3 object-cover opacity-50 group-hover:scale-105 transition-transform duration-500"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#051F14] via-[#062619]/92 to-[#051F14]/45" />
          <div className="pointer-events-none absolute -left-8 top-1/2 -translate-y-1/2 w-40 h-28 rounded-full bg-emerald-400/20 blur-2xl" />

          <div className="flex items-center gap-3 sm:gap-4 min-w-0 relative z-10">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-emerald-300/50 bg-[#04140D] shadow-[0_0_20px_rgba(16,232,138,0.28)] shrink-0">
              <img
                src={ecoCameraImg}
                alt="Muammoni suratga olish"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="min-w-0 space-y-0.5 sm:space-y-1">
              <h2 className="font-display text-sm sm:text-xl font-extrabold text-white tracking-tight truncate">
                Muammoni xabar qilish
              </h2>
              <p className="text-[11px] sm:text-sm font-medium text-emerald-100/85 leading-snug line-clamp-2">
                Atrof-muhitdagi muammolarni bizga xabar qiling!
              </p>
            </div>
          </div>

          <span className="relative z-10 min-h-[42px] sm:min-h-[46px] px-3.5 sm:px-6 py-2.5 rounded-full bg-gradient-to-r from-[#34FC9E] via-[#10E88A] to-[#00D992] text-[#04110B] font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-[0_0_24px_rgba(16,232,138,0.45)] group-hover:brightness-105 transition-all whitespace-nowrap shrink-0">
            <span>Xabar berish</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </motion.div>
      </motion.section>

      {/* SECTION 4: BOSHQA IMKONIYATLAR + 4 QUICK TILES */}
      <motion.section
        variants={itemVariants}
        className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 space-y-3"
      >
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0" />
            <h2 className="font-display text-base sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight truncate">
              Boshqa imkoniyatlar
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setActiveTab('rewards');
            }}
            className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-white/95 dark:bg-[#082519]/90 border border-slate-200 dark:border-emerald-400/35 hover:border-emerald-400/75 text-slate-800 dark:text-emerald-100 text-xs font-bold inline-flex items-center gap-1.5 shadow-sm cursor-pointer transition-all whitespace-nowrap shrink-0"
          >
            <span>Ko&apos;proq</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-500 dark:text-[#00F5A0]" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3.5">
          {quickOpportunityTiles.map(tile => {
            const Icon = tile.icon;
            return (
              <motion.button
                key={tile.id}
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={tile.onClick}
                className="relative overflow-hidden rounded-[20px] border border-slate-200 dark:border-emerald-400/30 hover:border-emerald-400/75 bg-white dark:bg-[#072116] p-3.5 sm:p-4 flex flex-col items-center justify-center text-center gap-2 shadow-lg shadow-emerald-950/15 group cursor-pointer min-h-[124px] sm:min-h-[144px]"
              >
                {/* Photorealistic subtle depth texture behind card */}
                <img
                  src={tile.bgPhoto}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  className="pointer-events-none absolute inset-0 w-full h-full object-cover opacity-12 dark:opacity-18 group-hover:scale-105 transition-transform duration-500"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/85 via-white/90 to-white/95 dark:from-[#082418]/80 dark:via-[#061D13]/90 dark:to-[#04130D]/95" />

                <div
                  className={`relative z-10 w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border flex items-center justify-center shadow-sm ${tile.iconBg}`}
                >
                  <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${tile.iconColor}`} />
                </div>

                <div className="relative z-10 space-y-0.5 min-w-0 w-full">
                  <div className="font-display text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    {tile.title}
                  </div>
                  <div className="text-[10.5px] sm:text-xs font-medium text-slate-500 dark:text-emerald-100/70 leading-snug line-clamp-2">
                    {tile.subtitle}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.section>

      {/* SECTION 5: PARTNER AD PLACEMENT */}
      <section className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8">
        <EcoAdBanner placement="home_top" />
      </section>

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
              <div className="space-y-1.5 p-3 rounded-xl bg-[#040D0A] border border-emerald-500/20">
                <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                  <span>Telegram post ({ECOHERO_NEWS_CHANNEL_USERNAME})</span>
                  <span className="text-[10px] font-normal text-slate-400">ixtiyoriy</span>
                </div>
                <input
                  type="text"
                  value={postTelegramInput}
                  onChange={e => setPostTelegramInput(e.target.value)}
                  placeholder={`Post ID (125) yoki ${ECOHERO_NEWS_CHANNEL_URL}/125`}
                  className="w-full px-3 py-2 rounded-lg bg-[#071812] border border-emerald-500/20 font-mono text-xs outline-none"
                />
                {postTelegramInput.trim() ? (
                  inlineTgValidation.valid && inlineTgValidation.normalized ? (
                    <p className="text-[10px] text-emerald-400 font-mono truncate">
                      «Batafsil o‘qish» → {inlineTgValidation.normalized.postUrl}
                    </p>
                  ) : (
                    <p className="text-[10px] text-rose-400">{inlineTgValidation.error}</p>
                  )
                ) : (
                  <p className="text-[10px] text-slate-400">
                    Bo‘sh qolsa tugma ko‘rinmaydi.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  value={postCtaText}
                  onChange={e => setPostCtaText(e.target.value)}
                  placeholder="Tugma matni (ixtiyoriy)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#040D0A] border border-emerald-500/20 font-semibold outline-none"
                />
                <input
                  type="text"
                  value={postCtaUrl}
                  onChange={e => setPostCtaUrl(e.target.value)}
                  placeholder="Qo‘shimcha havola (ixtiyoriy)"
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
