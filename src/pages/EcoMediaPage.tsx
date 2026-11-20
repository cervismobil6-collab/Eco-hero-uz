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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { INITIAL_ARTICLES } from '../data/mockData';
import { EcoArticle, MediaCategory } from '../types/eco';
import { useEco } from '../context/EcoContext';
import { apiUrl, parseApiJson } from '../utils/api';
import { EcoAdBanner } from '../components/EcoAdBanner';

export const EcoMediaPage: React.FC = () => {
  const {
    user,
    mediaSubmissions,
    uploadMediaFile,
    submitEcoMedia,
    rewardSettings,
    triggerHaptic,
    showNotification,
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
      const response = await fetch(apiUrl('/api/ai/eco-assistant'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Ushbu maqolani o'quvchilar uchun 3 ta muhim nuqtada xulosa qilib ber: "${selectedArticle.title}. ${selectedArticle.content}"`,
          chatHistory: [],
        }),
      });
      const data = await parseApiJson<{ success?: boolean; reply?: string; error?: string }>(response);
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
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white pb-24">
      {/* Hero Header */}
      <div className="relative h-[400px] w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1473081556163-2a17de81fc97?auto=format&fit=crop&w=2000&q=80"
            className="w-full h-full object-cover opacity-60 dark:opacity-40 scale-105"
            alt="Eco Media Hero"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50/0 via-slate-50/50 to-slate-50 dark:from-[#020617]/0 dark:via-[#020617]/50 dark:to-[#020617]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 h-full flex flex-col justify-center space-y-5 pt-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest w-fit">
            <Radio className="w-3 h-3" /> Eco Media & Faoliyat Markazi
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl md:text-6xl font-black uppercase tracking-tight leading-none">
                Eco <span className="text-emerald-500">Media</span>
              </h1>
              <p className="text-sm md:text-base text-slate-600 dark:text-slate-400 font-medium max-w-2xl">
                Ekologik foto va videolarni yuklang, Super Admin tasdig‘idan so‘ng EcoCoin yuting va Yashil Makon yangiliklarini kuzating.
              </p>
            </div>
            <button
              onClick={() => setShowUploadPanel(prev => !prev)}
              className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 flex items-center gap-2 w-fit cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              {showUploadPanel ? 'Yuklash Panelini Yopish' : 'Eko-Faoliyat Yuklash'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-10 relative z-20 space-y-12">
        {/* Upload Activity Media Panel */}
        {showUploadPanel && (
          <form
            onSubmit={handleSubmitActivityMedia}
            className="p-6 md:p-8 bg-white dark:bg-[#0f172a] rounded-3xl border border-emerald-500/30 shadow-xl space-y-5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Eko-Faoliyat Foto / Video Yuborish</h2>
                <p className="text-xs text-slate-500">
                  Faqat moderator tasdig‘idan so‘ng EcoCoin beriladi. Takroriy fayllar avtomatik bloklanadi.
                </p>
              </div>
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                Tanlangan mukofot: +{activityCategoryOptions.find(c => c.id === uploadCat)?.coins || 0} ECO
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faoliyat Toifasi</label>
                  <select
                    value={uploadCat}
                    onChange={e => setUploadCat(e.target.value as MediaCategory)}
                    className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  >
                    {activityCategoryOptions.map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label} (+{opt.coins} ECO)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Faoliyat Tavsifi</label>
                  <textarea
                    rows={3}
                    value={uploadDesc}
                    onChange={e => setUploadDesc(e.target.value)}
                    placeholder="Masalan: Maktabimiz bog‘iga 12 tup chinor ko‘chati ekdik..."
                    className="mt-1.5 w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium outline-none"
                  />
                </div>
              </div>

              <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl aspect-video flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/60 overflow-hidden">
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

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowUploadPanel(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={isUploadingFile || isSubmittingMedia || !uploadedUrl}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-black uppercase tracking-wider cursor-pointer"
              >
                {isSubmittingMedia ? 'Yuborilmoqda...' : 'Moderatsiyaga Yuborish'}
              </button>
            </div>
          </form>
        )}

        {/* Community Verified & User Submitted Media Gallery */}
        <section className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">Hamjamiyat Eko-Medialari</h2>
              <p className="text-xs text-slate-500">O‘quvchilar va Eko-Elchilarning tasdiqlangan ishlari</p>
            </div>
            <select
              value={mediaFilterCat}
              onChange={e => setMediaFilterCat(e.target.value as any)}
              className="px-4 py-2.5 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
            >
              <option value="all">Barcha faoliyatlar</option>
              {activityCategoryOptions.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {visibleSubmissions.length === 0 ? (
            <div className="p-10 text-center bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 text-xs text-slate-400 font-bold uppercase">
              Hozircha tasdiqlangan eko-media yuklanmagan — birinchi bo‘lib yuklang!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {visibleSubmissions.slice(0, 12).map(item => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col"
                >
                  <div className="aspect-video bg-slate-100 dark:bg-slate-900 relative">
                    {item.mediaType === 'video' ? (
                      <video src={item.mediaUrl} controls className="w-full h-full object-cover" />
                    ) : (
                      <img src={item.mediaUrl} alt={item.description} className="w-full h-full object-cover" />
                    )}
                    <span
                      className={`absolute top-3 right-3 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                        item.status === 'APPROVED'
                          ? 'bg-emerald-600 text-white'
                          : item.status === 'REJECTED'
                          ? 'bg-rose-600 text-white'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="p-5 space-y-2 flex-1 flex flex-col">
                    <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                      {activityCategoryOptions.find(c => c.id === item.activityCategory)?.label || item.activityCategory}
                    </div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-2">{item.description}</p>
                    {item.moderatorNote && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">Izoh: {item.moderatorNote}</p>
                    )}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 mt-auto tabular-nums">
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
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 rounded-2xl overflow-x-auto scrollbar-hide max-w-full">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap cursor-pointer ${
                  activeCategory === cat ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat === 'all' ? 'Barchasi' : cat}
              </button>
            ))}
          </div>

          <div className="flex-1 max-w-md relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Maqolalarni qidirish..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-100 dark:bg-slate-900 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50"
            />
          </div>
        </div>

        {/* Featured Big Article Card */}
        {filteredArticles.length > 0 && !searchQuery && activeCategory === 'all' && (
          <div
            onClick={() => setSelectedArticle(filteredArticles[0])}
            className="group rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-lg transition-all cursor-pointer grid grid-cols-1 lg:grid-cols-12"
          >
            <div className="lg:col-span-7 aspect-video lg:aspect-auto relative overflow-hidden">
              <img
                src={filteredArticles[0].imageUrl}
                alt={filteredArticles[0].title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute top-5 left-5 px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest">
                Top Maqola
              </div>
            </div>

            <div className="lg:col-span-5 p-8 flex flex-col justify-center space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                  <span>{filteredArticles[0].category}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {filteredArticles[0].readTime}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-tight uppercase tracking-tight">
                  {filteredArticles[0].title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                  {filteredArticles[0].excerpt}
                </p>
              </div>
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400 uppercase">{filteredArticles[0].author}</span>
                <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                  O‘qish <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </div>
        )}

        <EcoAdBanner placement="media_sidebar" />

        {/* Grid of Other Articles */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredArticles.slice(activeCategory === 'all' && !searchQuery ? 1 : 0).map(article => (
            <div
              key={article.id}
              onClick={() => setSelectedArticle(article)}
              className="group rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:-translate-y-1 transition-all cursor-pointer flex flex-col"
            >
              <div className="h-52 w-full relative overflow-hidden bg-slate-100 dark:bg-slate-800">
                <img
                  src={article.imageUrl}
                  alt={article.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute top-4 left-4 px-3 py-1 rounded-xl bg-black/60 text-[9px] font-black text-white uppercase tracking-widest">
                  {article.category}
                </div>
              </div>

              <div className="p-6 space-y-3 flex-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase">
                  <span>{article.date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {article.readTime}</span>
                </div>
                <h3 className="font-black text-base uppercase tracking-tight line-clamp-2">{article.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{article.excerpt}</p>
              </div>

              <div className="px-6 pb-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase mt-auto">
                <span className="truncate max-w-[150px]">{article.author}</span>
                <span className="flex items-center gap-1 font-mono text-emerald-500 tabular-nums">
                  <Eye className="w-3.5 h-3.5" />
                  {article.views.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Video Masterclasses */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-black uppercase tracking-tight">Video Kurslar</h2>
              <p className="text-xs text-slate-500">Amaliy ekologik ko‘nikmalarni o‘rganing</p>
            </div>
            <div className="text-xs font-bold text-rose-500 flex items-center gap-1.5">
              <Youtube className="w-4 h-4" /> EcoHero Academy
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: 'Plastikni saralash sirlari', author: 'Sanfa Academy', duration: '4:20', image: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=80' },
              { title: "Daraxtni to'g'ri sug'orish", author: 'Yashil Makon', duration: '3:45', image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80' },
              { title: 'Quyosh panelini tanlash', author: 'Green Tech', duration: '6:12', image: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=800&q=80' },
            ].map((vid, i) => (
              <div key={i} className="group relative aspect-video rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                <img src={vid.image} className="w-full h-full object-cover" alt={vid.title} />
                <div className="absolute inset-0 bg-black/45" />
                <div className="absolute inset-0 flex flex-col justify-between p-6">
                  <div className="flex justify-between items-start">
                    <span className="px-2.5 py-1 rounded-lg bg-black/60 text-[9px] font-black text-white uppercase">Video Dars</span>
                    <span className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[9px] font-black tabular-nums">{vid.duration}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white">
                      <Play className="w-5 h-5 fill-current" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-white font-black text-sm uppercase truncate">{vid.title}</h4>
                      <p className="text-white/70 text-[10px] font-bold uppercase">{vid.author}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Academy Module */}
        <div className="p-8 bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl text-white space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase tracking-widest">
                <GraduationCap className="w-3.5 h-3.5" /> Eko-Hero Akademiyasi
              </div>
              <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">Bilim va Amaliyot</h2>
              <p className="text-slate-300 text-xs max-w-xl">
                Har bir ekologik modulni yakunlab, amaliy topshiriq yuklang va EcoCoin jamg‘aring.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: "Global Iqlim O'zgarishi", level: "Boshlang'ich", progress: 40 },
              { title: 'Chiqindilarni Boshqarish', level: "O'rta", progress: 15 },
            ].map((mod, i) => (
              <div key={i} className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-base font-black uppercase">{mod.title}</h4>
                    <div className="text-[10px] font-bold text-slate-400 uppercase">{mod.level}</div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-400" />
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${mod.progress}%` }} />
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
              className="relative w-full max-w-3xl bg-white dark:bg-[#0f172a] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="relative h-64 shrink-0">
                <img src={selectedArticle.imageUrl} className="w-full h-full object-cover" alt={selectedArticle.title} />
                <button
                  onClick={() => { setSelectedArticle(null); setAiSummary(null); }}
                  className="absolute top-4 right-4 p-2.5 bg-black/40 rounded-full text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 sm:p-8 space-y-6 overflow-y-auto">
                <div className="space-y-2">
                  <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                    {selectedArticle.category} · {selectedArticle.date}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight">{selectedArticle.title}</h2>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={generateAiSummary}
                    disabled={isSummarizing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isSummarizing ? 'Tahlil qilinmoqda...' : aiSummary ? 'AI Xulosani yangilash' : 'AI Xulosa'}
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" /> {copied ? 'Nusxalandi!' : 'Ulashish'}
                  </button>
                </div>

                {aiSummary && (
                  <div className="p-5 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black text-emerald-600 uppercase">
                      <Lightbulb className="w-4 h-4" /> AI Xulosasi
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{aiSummary}</p>
                  </div>
                )}

                <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p className="font-bold text-slate-900 dark:text-white">{selectedArticle.excerpt}</p>
                  <p>{selectedArticle.content}</p>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3 text-xs font-bold">
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
