import React, { useState, useMemo } from 'react';
import {
  Radio,
  BookOpen,
  Eye,
  ArrowRight,
  Share2,
  Play,
  X,
  Sparkles,
  Search,
  Clock,
  Youtube,
  GraduationCap,
  ChevronRight,
  Lightbulb,
  Upload,
  Camera,
  FileVideo,
  Coins,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { INITIAL_ARTICLES } from '../data/mockData';
import { EcoArticle, MediaCategory } from '../types/eco';
import { useEco } from '../context/EcoContext';
import { isInsideTelegramWebApp, openAdTargetUrl, parseApiJson } from '../utils/api';
import { resolveNewsTelegramPostUrl } from '../utils/telegramNews';
import { EcoAdBanner } from '../components/EcoAdBanner';
import mediaEcoCameraImg from '../assets/images/media_eco_camera_1795687842823.jpg';

export const EcoMediaPage: React.FC = () => {
  const {
    user,
    mediaSubmissions,
    uploadMediaFile,
    submitEcoMedia,
    rewardSettings,
    triggerHaptic,
    showNotification,
    apiFetch,
    openAuthModal,
  } = useEco();

  const [articles] = useState<EcoArticle[]>(INITIAL_ARTICLES);
  const [selectedArticle, setSelectedArticle] = useState<EcoArticle | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);

  // Eco Activity Upload State
  const [showUploadPanel, setShowUploadPanel] = useState(false);
  const [uploadCat, setUploadCat] = useState<MediaCategory>('tree_planting');
  const [uploadDesc, setUploadDesc] = useState('');
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [uploadedType, setUploadedType] = useState<'image' | 'video'>('image');
  const [uploadedHash, setUploadedHash] = useState<string | undefined>(undefined);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSubmittingMedia, setIsSubmittingMedia] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [mediaFilterCat, setMediaFilterCat] = useState<'all' | MediaCategory>('all');

  const activityCategoryOptions = useMemo(
    () => [
      { id: 'tree_planting' as MediaCategory, label: 'Daraxt ekish videosi / fotolari', coins: rewardSettings.treePlanting },
      { id: 'tree_care' as MediaCategory, label: 'Daraxtni parvarishlash va sug‘orish', coins: rewardSettings.treeCareWatering },
      { id: 'school_garden' as MediaCategory, label: 'Maktab bog‘i loyihasi', coins: rewardSettings.gardenProject },
      { id: 'awareness_video' as MediaCategory, label: 'Ekologik targ‘ibot videosi', coins: rewardSettings.awarenessPost },
      { id: 'waste_sorting' as MediaCategory, label: 'Chiqindilarni saralash faoliyati', coins: rewardSettings.wasteSorting },
      { id: 'school_improvement' as MediaCategory, label: 'Maktab hududini obodonlashtirish', coins: rewardSettings.schoolImprovement },
      { id: 'environmental_campaign' as MediaCategory, label: 'Ekologik aksiya / kampaniya', coins: rewardSettings.environmentalCampaign },
    ],
    [rewardSettings]
  );

  const categories = ['all', 'Yangiliklar', "Qo'llanma", 'Yashil Makon', 'Texnologiya'];

  const filteredArticles = articles.filter(art => {
    const matchesCategory = activeCategory === 'all' || art.category === activeCategory;
    const matchesSearch =
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const visibleSubmissions = useMemo(() => {
    return mediaSubmissions.filter(m => {
      if (mediaFilterCat !== 'all' && m.activityCategory !== mediaFilterCat) return false;
      if (m.status === 'APPROVED') return true;
      return m.userId === user.uid || user.role === 'super_admin' || user.role === 'moderator';
    });
  }, [mediaSubmissions, mediaFilterCat, user.uid, user.role]);

  const handleMediaFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setUploadError('Fayl hajmi 15 MB dan oshmasligi kerak.');
      return;
    }
    setUploadError('');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result as string;
      setIsUploadingFile(true);
      const res = await uploadMediaFile(base64, file.name);
      setIsUploadingFile(false);
      if (res.success && res.url) {
        setUploadedUrl(res.url);
        setUploadedType(res.mediaType || (file.type.startsWith('video/') ? 'video' : 'image'));
        setUploadedHash(res.fileHash);
        showNotification('Media fayl yuklandi!', 'success');
      } else {
        setUploadError(res.error || 'Fayl yuklashda xatolik');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitActivityMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedUrl) {
      setUploadError('Avval foto yoki video faylni yuklang.');
      return;
    }
    if (uploadDesc.trim().length < 5) {
      setUploadError('Iltimos, faoliyat tavsifini kiriting (kamida 5 belgi).');
      return;
    }
    setUploadError('');
    setIsSubmittingMedia(true);
    const res = await submitEcoMedia({
      activityCategory: uploadCat,
      mediaType: uploadedType,
      mediaUrl: uploadedUrl,
      fileHash: uploadedHash,
      description: uploadDesc.trim(),
    });
    setIsSubmittingMedia(false);
    if (!res.success) {
      setUploadError(res.error || 'Saqlashda xatolik yuz berdi.');
      return;
    }
    setUploadDesc('');
    setUploadedUrl('');
    setUploadedHash(undefined);
    setShowUploadPanel(false);
  };

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      triggerHaptic('light');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const generateAiSummary = async () => {
    if (!selectedArticle) return;
    setIsSummarizing(true);
    triggerHaptic('medium');
    try {
      const response = await apiFetch('/api/ai/eco-assistant', {
        method: 'POST',
        timeoutMs: 35000,
        body: JSON.stringify({
          message: `Ushbu maqolani o'quvchilar uchun 3 ta muhim nuqtada xulosa qilib ber: "${selectedArticle.title}. ${selectedArticle.content}"`,
          chatHistory: [],
        }),
      });
      const data = await parseApiJson<{ success?: boolean; reply?: string; error?: string }>(response);
      if (response.status === 401) {
        openAuthModal();
      }
      if (response.ok && data.success && data.reply) {
        setAiSummary(data.reply);
      } else {
        setAiSummary(data.error || "Kechirasiz, sun'iy intellekt javob bera olmadi.");
      }
    } catch (err: any) {
      setAiSummary(err?.message || "Kechirasiz, sun'iy intellekt hozirda band.");
    } finally {
      setIsSummarizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f7f4] dark:bg-[#040D0A] text-slate-900 dark:text-white pb-24">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 space-y-6">
        {/* Compact Duolingo Hero Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 p-4 sm:p-6 text-white shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <img
                src={mediaEcoCameraImg}
                alt="Eco Media"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-emerald-400/40 shrink-0 shadow-md"
              />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#00F5A0] uppercase tracking-wider">
                  <Radio className="w-3.5 h-3.5" /> Eco Media & Faoliyat
                </span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                  Eco <span className="text-[#00F5A0]">Media</span>
                </h1>
                <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
                  Ekologik foto va videolarni yuklang, tasdiqlangach EcoCoin yuting.
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowUploadPanel(prev => !prev)}
              className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl text-xs font-black flex items-center gap-2 w-fit cursor-pointer shrink-0 active:translate-y-[1px] transition-all"
            >
              <Upload className="w-4 h-4" />
              {showUploadPanel ? 'Panelni Yopish' : 'Eko-Faoliyat Yuklash'}
            </button>
          </div>
        </div>

        {/* Upload Activity Media Panel */}
        {showUploadPanel && (
          <form
            onSubmit={handleSubmitActivityMedia}
            className="p-4 sm:p-6 bg-white dark:bg-[#061812] rounded-3xl border border-emerald-500/30 shadow-sm space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-emerald-500/15 pb-3">
              <div>
                <h2 className="text-base font-black tracking-tight">Eko-Faoliyat Foto / Video Yuborish</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Faqat moderator tasdig‘idan so‘ng EcoCoin beriladi. Takroriy fayllar avtomatik bloklanadi.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-[#00F5A0] tabular-nums">
                Mukofot: +{activityCategoryOptions.find(c => c.id === uploadCat)?.coins || 0} ECO
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Faoliyat Toifasi</label>
                  <select
                    value={uploadCat}
                    onChange={e => setUploadCat(e.target.value as MediaCategory)}
                    className="mt-1 w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  >
                    {activityCategoryOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} (+{opt.coins} ECO)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Faoliyat Tavsifi</label>
                  <textarea
                    rows={3}
                    value={uploadDesc}
                    onChange={e => setUploadDesc(e.target.value)}
                    placeholder="Masalan: Maktabimiz bog‘iga 12 tup chinor ko‘chati ekdik..."
                    className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-medium outline-none"
                  />
                </div>
              </div>

              <div className="relative border-2 border-dashed border-slate-300 dark:border-emerald-500/35 rounded-2xl aspect-video flex flex-col items-center justify-center bg-slate-50 dark:bg-[#040D0A] overflow-hidden cursor-pointer">
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleMediaFilePick}
                  className="absolute inset-0 opacity-0 cursor-pointer z-10"
                />
                {uploadedUrl ? (
                  uploadedType === 'video' ? (
                    <video src={uploadedUrl} controls className="w-full h-full object-cover z-20" />
                  ) : (
                    <img src={uploadedUrl} alt="Preview" className="w-full h-full object-cover" />
                  )
                ) : (
                  <div className="text-center p-4 space-y-2">
                    <div className="flex items-center justify-center gap-2 text-emerald-500">
                      <Camera className="w-6 h-6" />
                      <FileVideo className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-bold">
                      {isUploadingFile ? 'Yuklanmoqda...' : 'Foto yoki Video Tanlang (15 MB gacha)'}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {uploadError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowUploadPanel(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={isUploadingFile || isSubmittingMedia || !uploadedUrl}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 disabled:opacity-40 text-xs cursor-pointer"
              >
                {isSubmittingMedia ? 'Yuborilmoqda...' : 'Moderatsiyaga Yuborish'}
              </button>
            </div>
          </form>
        )}

        {/* Community Verified & User Submitted Media Gallery */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">Hamjamiyat Eko-Medialari</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">O‘quvchilar va Eko-Elchilarning tasdiqlangan ishlari</p>
            </div>
            <select
              value={mediaFilterCat}
              onChange={e => setMediaFilterCat(e.target.value as any)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
            >
              <option value="all">Barcha faoliyatlar</option>
              {activityCategoryOptions.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {visibleSubmissions.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-500 dark:text-slate-400 font-bold">
              Hozircha tasdiqlangan eko-media yuklanmagan — birinchi bo‘lib yuklang!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleSubmissions.slice(0, 12).map(item => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 overflow-hidden shadow-sm flex flex-col"
                >
                  <div className="aspect-video bg-slate-100 dark:bg-[#040D0A] relative">
                    {item.mediaType === 'video' ? (
                      <video src={item.mediaUrl} controls className="w-full h-full object-cover" />
                    ) : (
                      <img src={item.mediaUrl} alt={item.description} className="w-full h-full object-cover" />
                    )}
                    <span
                      className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                        item.status === 'APPROVED'
                          ? 'bg-emerald-600 text-white'
                          : item.status === 'REJECTED'
                          ? 'bg-rose-600 text-white'
                          : 'bg-amber-500 text-[#04110B]'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="p-4 space-y-2 flex-1 flex flex-col">
                    <div className="text-[11px] font-bold text-emerald-600 dark:text-[#00F5A0]">
                      {activityCategoryOptions.find(c => c.id === item.activityCategory)?.label || item.activityCategory}
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2">{item.description}</p>
                    {item.moderatorNote && (
                      <p className="text-[11px] text-amber-500 font-semibold">Izoh: {item.moderatorNote}</p>
                    )}
                    <div className="pt-2.5 border-t border-slate-100 dark:border-emerald-500/15 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-auto tabular-nums">
                      <span className="truncate">{item.userName} · {item.schoolName}</span>
                      <span className="font-bold text-emerald-500 shrink-0">
                        {item.awardedCoins > 0 ? `+${item.awardedCoins} ECO` : 'Tekshiruvda'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Navigation & Search Bar for Articles */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-3 bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 shadow-sm">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#040D0A] rounded-xl overflow-x-auto scrollbar-hide max-w-full">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  activeCategory === cat
                    ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black'
                    : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Barchasi' : cat}
              </button>
            ))}
          </div>

          <div className="flex-1 md:max-w-sm relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Maqolalarni qidirish..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full min-h-[40px] pl-10 pr-3.5 py-2 bg-slate-100 dark:bg-[#040D0A] rounded-xl text-xs font-semibold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Featured Big Article Card */}
        {filteredArticles.length > 0 && !searchQuery && activeCategory === 'all' && (
          <div
            onClick={() => setSelectedArticle(filteredArticles[0])}
            className="group rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/25 overflow-hidden shadow-sm hover:border-emerald-500/50 transition-all cursor-pointer grid grid-cols-1 lg:grid-cols-12"
          >
            <div className="lg:col-span-6 aspect-video lg:aspect-auto relative overflow-hidden">
              <img
                src={filteredArticles[0].imageUrl}
                alt={filteredArticles[0].title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute top-3.5 left-3.5 px-2.5 py-1 rounded-lg bg-[#040D0A]/85 border border-emerald-500/40 text-[#00F5A0] text-[10px] font-black uppercase">
                Top Maqola
              </div>
            </div>

            <div className="lg:col-span-6 p-5 sm:p-6 flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-xs font-bold text-emerald-500 dark:text-[#00F5A0]">
                  <span>{filteredArticles[0].category}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {filteredArticles[0].readTime}</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight tracking-tight">
                  {filteredArticles[0].title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {filteredArticles[0].excerpt}
                </p>
              </div>
              <div className="pt-3 border-t border-slate-100 dark:border-emerald-500/15 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-400 truncate">{filteredArticles[0].author}</span>
                <div className="flex items-center gap-3 shrink-0">
                  {(() => {
                    const tgPostUrl = resolveNewsTelegramPostUrl(filteredArticles[0]);
                    if (!tgPostUrl) return null;
                    return (
                      <a
                        href={tgPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => {
                          e.stopPropagation();
                          if (isInsideTelegramWebApp()) {
                            e.preventDefault();
                            openAdTargetUrl(tgPostUrl);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                      >
                        <span>Batafsil o‘qish</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    );
                  })()}
                  <span className="flex items-center gap-1.5 text-xs font-black text-emerald-500 dark:text-[#00F5A0]">
                    O‘qish <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        <EcoAdBanner placement="media_sidebar" />

        {/* Grid of Other Articles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredArticles.slice(activeCategory === 'all' && !searchQuery ? 1 : 0).map(article => (
            <div
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="group rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden shadow-sm hover:border-emerald-500/45 transition-all cursor-pointer flex flex-col"
            >
              <div className="h-44 w-full relative overflow-hidden bg-slate-100 dark:bg-[#040D0A]">
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-[10px] font-bold text-white">
                  {article.category}
                </div>
              </div>

              <div className="p-4 space-y-2 flex-1">
                <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                  <span>{article.date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readTime}</span>
                </div>
                <h3 className="font-black text-sm tracking-tight line-clamp-2">{article.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{article.excerpt}</p>
              </div>

              <div className="px-4 pb-3.5 pt-2.5 border-t border-slate-100 dark:border-emerald-500/15 flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-400 mt-auto">
                <span className="truncate max-w-[140px]">{article.author}</span>
                <div className="flex items-center gap-2.5 shrink-0">
                  {(() => {
                    const tgPostUrl = resolveNewsTelegramPostUrl(article);
                    if (!tgPostUrl) return null;
                    return (
                      <a
                        href={tgPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => {
                          e.stopPropagation();
                          if (isInsideTelegramWebApp()) {
                            e.preventDefault();
                            openAdTargetUrl(tgPostUrl);
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-colors"
                      >
                        <span>Batafsil o‘qish</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    );
                  })()}
                  <span className="flex items-center gap-1 font-mono text-emerald-500 tabular-nums">
                    <Eye className="w-3.5 h-3.5" />
                    {article.views.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Video Masterclasses */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg sm:text-xl font-black tracking-tight">Video Kurslar</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Amaliy ekologik ko‘nikmalarni o‘rganing</p>
            </div>
            <div className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
              <Youtube className="w-4 h-4" /> EcoHero Academy
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Plastikni saralash sirlari', author: 'Sanfa Academy', duration: '4:20', image: '/assets/eco/eco_camera.jpg' },
              { title: "Daraxtni to'g'ri sug'orish", author: 'Yashil Makon', duration: '3:45', image: '/assets/eco/mission_planting.jpg' },
              { title: 'Quyosh panelini tanlash', author: 'Green Tech', duration: '6:12', image: '/assets/eco/mission_ecology.jpg' },
            ].map((vid, i) => (
              <div key={i} className="group relative aspect-video rounded-2xl overflow-hidden border border-slate-200 dark:border-emerald-500/20 shadow-sm">
                <img src={vid.image} className="w-full h-full object-cover" alt={vid.title} />
                <div className="absolute inset-0 bg-black/50" />
                <div className="absolute inset-0 flex flex-col justify-between p-4">
                  <div className="flex justify-between items-start">
                    <span className="px-2 py-0.5 rounded-lg bg-black/70 text-[10px] font-bold text-white">Video Dars</span>
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-500 text-[#04110B] text-[10px] font-black tabular-nums">{vid.duration}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white shrink-0">
                      <Play className="w-4 h-4 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-white font-black text-sm truncate">{vid.title}</h4>
                      <p className="text-white/75 text-[11px] font-semibold">{vid.author}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Academy Module */}
        <div className="p-5 sm:p-6 bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 rounded-3xl text-white space-y-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400">
              <GraduationCap className="w-4 h-4" /> Eko-Hero Akademiyasi
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">Bilim va Amaliyot</h2>
            <p className="text-slate-300 text-xs max-w-xl">
              Har bir ekologik modulni yakunlab, amaliy topshiriq yuklang va EcoCoin jamg‘aring.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {[
              { title: "Global Iqlim O'zgarishi", level: "Boshlang'ich", progress: 40 },
              { title: 'Chiqindilarni Boshqarish', level: "O'rta", progress: 15 },
            ].map((mod, i) => (
              <div key={i} className="p-4 bg-[#040D0A]/80 rounded-2xl border border-emerald-500/20 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-black">{mod.title}</h4>
                    <div className="text-[11px] font-semibold text-slate-400">{mod.level}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#00F5A0]" />
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#00F5A0] to-[#10B981] rounded-full" style={{ width: `${mod.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Article Detail Modal */}
      <AnimatePresence>
        {selectedArticle && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
              onClick={() => { setSelectedArticle(null); setAiSummary(null); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/25 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="relative h-56 shrink-0">
                <img src={selectedArticle.imageUrl} className="w-full h-full object-cover" alt={selectedArticle.title} />
                <button
                  onClick={() => { setSelectedArticle(null); setAiSummary(null); }}
                  className="absolute top-3.5 right-3.5 p-2.5 bg-black/50 rounded-xl text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-emerald-500 dark:text-[#00F5A0]">
                    {selectedArticle.category} · {selectedArticle.date}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black tracking-tight">{selectedArticle.title}</h2>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <button
                    onClick={generateAiSummary}
                    disabled={isSummarizing}
                    className="min-h-[40px] flex items-center gap-2 px-4 py-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-[#00F5A0] rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isSummarizing ? 'Tahlil qilinmoqda...' : aiSummary ? 'AI Xulosani yangilash' : 'AI Xulosa'}
                  </button>
                  <button
                    onClick={handleShare}
                    className="min-h-[40px] flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" /> {copied ? 'Nusxalandi!' : 'Ulashish'}
                  </button>
                  {(() => {
                    const tgPostUrl = resolveNewsTelegramPostUrl(selectedArticle);
                    if (!tgPostUrl) return null;
                    return (
                      <a
                        href={tgPostUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => {
                          if (isInsideTelegramWebApp()) {
                            e.preventDefault();
                            openAdTargetUrl(tgPostUrl);
                          }
                        }}
                        className="min-h-[40px] flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors"
                      >
                        <span>Batafsil o‘qish</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    );
                  })()}
                </div>

                {aiSummary && (
                  <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/25 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-600 dark:text-[#00F5A0]">
                      <Lightbulb className="w-4 h-4" /> AI Xulosasi
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{aiSummary}</p>
                  </div>
                )}

                <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p className="font-bold text-slate-900 dark:text-white">{selectedArticle.excerpt}</p>
                  <p>{selectedArticle.content}</p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-emerald-500/15 flex items-center gap-2.5 text-xs font-bold">
                  <BookOpen className="w-4 h-4 text-emerald-500" /> Muallif: {selectedArticle.author}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
