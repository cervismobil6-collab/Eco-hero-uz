import React, { useState, useEffect, useMemo } from 'react';
import {
  Send,
  Camera,
  MapPin,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Coins,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Info,
  FileVideo,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { ProblemCategory, ProblemSeverity } from '../types/eco';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../data/mockData';
import { queuePendingReport } from '../services/offlineQueue';
import { resolveMediaUrl } from '../utils/api';

type ReportStep = 'media' | 'details' | 'location' | 'preview';

const CATEGORY_OPTIONS: { id: ProblemCategory; label: string; desc: string; hazardous?: boolean }[] = [
  { id: 'waste', label: 'Chiqindilar', desc: 'Maishiy yoki plastik chiqindilar to‘planishi' },
  { id: 'water', label: 'Suv ifloslanishi', desc: 'Ariq, kanal yoki suv havzalari ifloslanishi' },
  { id: 'deforestation', label: 'Daraxt kesilishi', desc: 'Ruxsatsiz daraxt kesish yoki shikastlash' },
  { id: 'air', label: 'Havo ifloslanishi', desc: 'Tutun, xazon yoqish yoki changlanish' },
  { id: 'greening_needed', label: "Ko'kalamzorlashtirish", desc: 'Daraxt va ko‘chat ekish zarur hudud' },
  { id: 'electrical_hazard', label: 'Elektr xavfi', desc: 'Ochiq elektr simlari yoki transformator xavfi', hazardous: true },
  { id: 'chemical_hazard', label: 'Kimyoviy / Xavfli chiqindi', desc: 'Kislota, gaz, shprits yoki zaharli moddalar', hazardous: true },
];

const HAZARD_REGEX = /(elektr|tok|kabel|transformator|kislota|kimyo|kimyoviy|gaz|zahar|shprits|shisha|xavfli|hazard)/i;

export const ReportProblemPage: React.FC = () => {
  const {
    addReport,
    syncBootstrap,
    user,
    reports,
    rewardSettings,
    uploadMediaFile,
    apiFetch,
    setActiveTab,
    triggerConfetti,
    triggerHaptic,
    showNotification,
  } = useEco();

  const [viewMode, setViewMode] = useState<'create' | 'my_reports'>('create');
  const [step, setStep] = useState<ReportStep>('media');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ProblemCategory>('waste');
  const [severity, setSeverity] = useState<ProblemSeverity>('medium');
  const [region, setRegion] = useState(user.region || 'Toshkent shahri');
  const [district, setDistrict] = useState(user.district || 'Yunusobod tumani');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState<number>(41.2995);
  const [lng, setLng] = useState<number>(69.2401);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  // AI Analysis state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiRejected, setAiRejected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isOfflineQueued, setIsOfflineQueued] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const isHazardousSelection = useMemo(() => {
    return (
      category === 'electrical_hazard' ||
      category === 'chemical_hazard' ||
      HAZARD_REGEX.test(`${title} ${description}`)
    );
  }, [category, title, description]);

  const myReports = useMemo(
    () => reports.filter(r => r.reporterUid === user.uid || r.reporterName === user.fullName),
    [reports, user.uid, user.fullName]
  );

  const samplePhotos = [
    {
      label: 'Plastik Chiqindi',
      url: 'https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?auto=format&fit=crop&w=800&q=80',
      category: 'waste' as ProblemCategory,
    },
    {
      label: 'Ifloslangan Suv',
      url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?auto=format&fit=crop&w=800&q=80',
      category: 'water' as ProblemCategory,
    },
  ];

  useEffect(() => {
    const stored = sessionStorage.getItem('ecohero_report_coords');
    if (stored) {
      try {
        const coords = JSON.parse(stored);
        setLat(coords.lat);
        setLng(coords.lng);
        setAddress(`Xarita: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
        sessionStorage.removeItem('ecohero_report_coords');
      } catch {
        // ignore parse failure
      }
    }
  }, []);

  const runAiValidation = async (imgBase64: string | null, imgUrlVal: string) => {
    if (!imgBase64 && !imgUrlVal) return;
    setIsAnalyzing(true);
    setErrorMessage('');
    setAiRejected(false);
    try {
      const res = await apiFetch('/api/ai/analyze-problem', {
        method: 'POST',
        body: JSON.stringify({
          title: title || 'Ekologik muammo',
          description: description || 'Rasm orqali ekologik muammo tahlili',
          region,
          imageBase64: imgBase64 || (imgUrlVal.startsWith('data:') ? imgUrlVal : null),
          imageUrl: imgUrlVal && !imgUrlVal.startsWith('data:') ? imgUrlVal : undefined,
        }),
      });
      const data = await res.json();
      if (data.success && data.analysis) {
        if (data.analysis.isValidEcoProblem === false || data.analysis.isAiGenerated === true) {
          setAiResult(null);
          setAiRejected(true);
          setErrorMessage(
            data.analysis.rejectionReasonUz ||
              "Ushbu suratda ekologik muammo aniqlanmadi yoki AI yordamida yasalgan. Iltimos, haqiqiy ekologik holatni yuklang."
          );
          triggerHaptic('warning');
        } else {
          setAiRejected(false);
          setAiResult(data.analysis);
          if (data.analysis.detectedCategory) setCategory(data.analysis.detectedCategory);
          if (data.analysis.severityLevel) setSeverity(data.analysis.severityLevel);
          triggerHaptic('success');
        }
      }
    } catch (err) {
      console.error('AI error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('Fayl hajmi 15 MB dan oshmasligi kerak.');
      return;
    }

    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setErrorMessage('');
      setAiRejected(false);
      setAiResult(null);

      if (!isVideo) {
        setImageBase64(base64String);
        setImageUrl(base64String);
        setVideoUrl('');
      } else {
        setImageBase64(null);
        setVideoUrl(base64String);
        setImageUrl('https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=80');
      }

      if (typeof navigator !== 'undefined' && navigator.onLine) {
        setIsUploadingMedia(true);
        const up = await uploadMediaFile(base64String, file.name);
        setIsUploadingMedia(false);
        const finalUploadedUrl = up.success && up.url ? up.url : '';
        if (finalUploadedUrl) {
          if (up.mediaType === 'video' || isVideo) {
            setVideoUrl(finalUploadedUrl);
          } else {
            setImageUrl(finalUploadedUrl);
          }
          showNotification('Fayl serverga xavfsiz yuklandi!', 'success');
        }
        if (!isVideo) {
          await runAiValidation(base64String, finalUploadedUrl || base64String);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeWithAI = async () => {
    await runAiValidation(
      imageBase64 || (imageUrl.startsWith('data:') ? imageUrl : null),
      imageUrl
    );
  };

  const handleGetLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
          setAddress(`${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`);
          triggerHaptic('success');
        },
        () => triggerHaptic('error')
      );
    }
  };

  const resetForm = () => {
    setStep('media');
    setTitle('');
    setDescription('');
    setCategory('waste');
    setSeverity('medium');
    setRegion(user.region || 'Toshkent shahri');
    setDistrict(user.district || (UZBEKISTAN_DISTRICTS[user.region || 'Toshkent shahri'] || [])[0] || 'Yunusobod tumani');
    setAddress('');
    setImageUrl('');
    setVideoUrl('');
    setImageBase64(null);
    setAiResult(null);
    setAiRejected(false);
    setIsOfflineQueued(false);
    setErrorMessage('');
    setIsSuccess(false);
  };

  const expectedCoins = rewardSettings?.problemVerified || 50;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage('');
    const clientReportId = `rep_${Date.now()}`;
    const finalImageUrl = imageUrl || samplePhotos[0].url;

    // 1. Offline queue
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      try {
        await queuePendingReport({
          title,
          description,
          category,
          severity,
          region,
          district,
          address: address || `${region}, ${district}`,
          lat,
          lng,
          imageUrl: finalImageUrl,
          imageBase64: imageBase64 || (finalImageUrl.startsWith('data:') ? finalImageUrl : undefined),
          authorUid: user.uid,
          authorName: user.fullName,
          authorSchool: user.schoolName,
          authorTelegramId: user.telegramId || user.telegramChatId || null,
        });

        addReport({
          id: clientReportId,
          title,
          description,
          category,
          severity,
          status: 'PENDING_REVIEW',
          region,
          district,
          address: address || `${region}, ${district}`,
          lat,
          lng,
          imageUrl: finalImageUrl,
          videoUrl: videoUrl || undefined,
          isHazardous: isHazardousSelection,
          rewardCoins: expectedCoins,
        });

        setIsOfflineQueued(true);
        setIsSuccess(true);
        triggerConfetti();
        triggerHaptic('success');
      } catch {
        setErrorMessage('Oflayn hisobotni saqlashda xatolik yuz berdi');
        triggerHaptic('error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // 2. Online submission with automatic IndexedDB fallback
    try {
      const res = await apiFetch('/api/reports/submit', {
        method: 'POST',
        body: JSON.stringify({
          clientReportId,
          title,
          description,
          category,
          severity,
          region,
          district,
          address: address || `${region}, ${district}`,
          lat,
          lng,
          imageUrl: finalImageUrl,
          videoUrl: videoUrl || undefined,
          imageBase64: imageBase64 || (finalImageUrl.startsWith('data:') ? finalImageUrl : null),
          authorUid: user.uid,
          authorName: user.fullName,
          schoolId: user.schoolId,
          authorSchool: user.schoolName,
          authorTelegramId: user.telegramId || user.telegramChatId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Hisobotni yuborishda xatolik yuz berdi');
        triggerHaptic('error');
        return;
      }

      addReport({
        id: data.report?.id || clientReportId,
        title,
        description,
        category,
        severity,
        status: data.report?.status || 'PENDING_REVIEW',
        region,
        district,
        address: address || `${region}, ${district}`,
        lat,
        lng,
        imageUrl: data.report?.imageUrl || finalImageUrl,
        videoUrl: data.report?.videoUrl || videoUrl || undefined,
        isHazardous: Boolean(data.report?.isHazardous || isHazardousSelection),
        rewardCoins: expectedCoins,
        aiAnalysis: aiResult
          ? {
              severityScore: aiResult.severityScore,
              recommendedAction: aiResult.recommendedAction,
              neededEquipment: aiResult.neededEquipment,
              urgencyNote: aiResult.urgencyNote,
            }
          : undefined,
      });

      await syncBootstrap();
      setIsSuccess(true);
      triggerConfetti();
      triggerHaptic('success');
    } catch {
      try {
        await queuePendingReport({
          title,
          description,
          category,
          severity,
          region,
          district,
          address: address || `${region}, ${district}`,
          lat,
          lng,
          imageUrl: finalImageUrl,
          imageBase64: imageBase64 || (finalImageUrl.startsWith('data:') ? finalImageUrl : undefined),
          authorUid: user.uid,
          authorName: user.fullName,
          authorSchool: user.schoolName,
          authorTelegramId: user.telegramId || user.telegramChatId || null,
        });

        addReport({
          title,
          description,
          category,
          severity,
          status: 'PENDING_REVIEW',
          region,
          district,
          address: address || `${region}, ${district}`,
          lat,
          lng,
          imageUrl: finalImageUrl,
          videoUrl: videoUrl || undefined,
          isHazardous: isHazardousSelection,
          rewardCoins: expectedCoins,
        });

        setIsOfflineQueued(true);
        setIsSuccess(true);
        triggerConfetti();
        triggerHaptic('success');
      } catch {
        setErrorMessage("Serverga ulanib bo'lmadi va oflayn saqlashda xatolik yuz berdi.");
        triggerHaptic('error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-xl mx-auto px-6 py-20 text-center space-y-6"
      >
        <div className="w-20 h-20 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/20">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
            {isOfflineQueued ? 'Oflayn Saqlandi!' : 'Hisobot Qabul Qilindi!'}
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {isOfflineQueued
              ? "Hisobotingiz qurilma xotirasiga saqlandi. Internetga ulanishingiz bilan avtomatik tarzda maktabingiz adminiga yetkaziladi."
              : `Hisobotingiz AI tekshiruvidan muvaffaqiyatli o'tdi va maktabingiz adminiga yuborildi. Maktab admini tasdiqlasa yoki Eko-Elchi bilan muammoni hal qilsa +${expectedCoins}–100 EcoCoin beriladi.`}
          </p>
          {isHazardousSelection && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold">
              ⚠️ Xavfli holat belgilangan: ushbu muammo o'quvchilarga biriktirilmaydi va mutasaddi idoraga yo'naltiriladi. O'zingiz yaqinlashmang!
            </div>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setActiveTab('map')}
            className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl transition-all uppercase text-xs tracking-widest cursor-pointer"
          >
            Xaritani Ko'rish
          </button>
          <button
            onClick={() => {
              resetForm();
              setViewMode('my_reports');
            }}
            className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-black rounded-2xl transition-all uppercase text-xs tracking-widest cursor-pointer"
          >
            Hisobotlarim
          </button>
        </div>
      </motion.div>
    );
  }

  const steps: { id: ReportStep; label: string }[] = [
    { id: 'media', label: 'Foto/Video' },
    { id: 'details', label: 'Tavsif' },
    { id: 'location', label: 'Manzil' },
    { id: 'preview', label: 'Yuborish' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight">Ekologik Muammo Xabar Berish</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            6 bosqichli rasmiy tekshiruv va xavfsiz bartaraf etish tizimi
          </p>
        </div>
        <div className="inline-flex p-1 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setViewMode('create')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
              viewMode === 'create' ? 'bg-emerald-600 text-white' : 'text-slate-500'
            }`}
          >
            Yangi Hisobot
          </button>
          <button
            onClick={() => setViewMode('my_reports')}
            className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors tabular-nums ${
              viewMode === 'my_reports' ? 'bg-emerald-600 text-white' : 'text-slate-500'
            }`}
          >
            Mening Hisobotlarim ({myReports.length})
          </button>
        </div>
      </div>

      {viewMode === 'my_reports' ? (
        <div className="space-y-4">
          {myReports.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs font-bold uppercase">
              Siz hali ekologik muammo xabari yubormagansiz
            </div>
          ) : (
            myReports.map(rep => (
              <div
                key={rep.id}
                className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="w-full sm:w-44 h-32 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                    {rep.videoUrl ? (
                      <video src={resolveMediaUrl(rep.videoUrl)} controls className="w-full h-full object-cover" />
                    ) : (
                      <img src={resolveMediaUrl(rep.imageUrl)} alt={rep.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-black">{rep.title}</h3>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${
                          rep.status.toUpperCase() === 'RESOLVED' || rep.status === 'resolved'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : rep.status === 'ESCALATED'
                            ? 'bg-rose-500/10 text-rose-500'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {rep.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{rep.description}</p>
                    <div className="text-[11px] text-slate-500 font-semibold">
                      {rep.category} · {rep.region}, {rep.district} · +{rep.rewardCoins} ECO
                    </div>
                    {rep.isHazardous && (
                      <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[11px] font-bold flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 shrink-0" />
                        <span>Xavfli holat: Mutasaddilar nazoratiga o'tkazilgan</span>
                      </div>
                    )}
                    {rep.statusHistory && rep.statusHistory.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                        {rep.statusHistory.map((ev, i) => (
                          <div key={i} className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-emerald-500" />
                            <span>
                              <b>{ev.status}</b> ({ev.actorName})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <>
          {/* Stepper Header */}
          <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-900 p-2 rounded-3xl border border-slate-200 dark:border-slate-800">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <button
                  onClick={() => {
                    const stepIdx = steps.findIndex(x => x.id === s.id);
                    const currentIdx = steps.findIndex(x => x.id === step);
                    if (stepIdx < currentIdx) setStep(s.id);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-2xl transition-all cursor-pointer ${
                    step === s.id ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border tabular-nums ${
                      step === s.id ? 'border-white' : 'border-slate-400'
                    }`}
                  >
                    {i + 1}
                  </div>
                  <span className="hidden sm:block text-[10px] font-black uppercase tracking-widest">{s.label}</span>
                </button>
                {i < steps.length - 1 && <div className="mx-2 w-4 h-px bg-slate-300 dark:bg-slate-700 hidden sm:block" />}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 md:p-8 shadow-sm"
            >
              {step === 'media' && (
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                      Muammo Foto yoki Videosini Yuklang
                    </h2>
                    <p className="text-xs text-slate-500">
                      Haqiqiy holatni ko'rsatuvchi rasm yoki qisqa video (15 MB gacha) yuklang.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="relative border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-3xl aspect-video flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-800/50 hover:border-emerald-500 transition-all cursor-pointer overflow-hidden">
                      <input
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      {videoUrl ? (
                        <video src={resolveMediaUrl(videoUrl)} controls className="w-full h-full object-cover z-20" />
                      ) : imageUrl ? (
                        <img src={resolveMediaUrl(imageUrl)} className="w-full h-full object-cover" alt="Muammo" />
                      ) : (
                        <>
                          <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center gap-1">
                            <Camera className="w-6 h-6" />
                            <FileVideo className="w-5 h-5" />
                          </div>
                          <div className="text-center px-4">
                            <div className="font-black text-xs uppercase tracking-wider text-slate-900 dark:text-white">
                              Foto / Video Tanlash
                            </div>
                            <div className="text-[10px] text-slate-400 font-bold mt-1">JPG, PNG, MP4, WEBM</div>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Yoki namunalardan tanlang</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {samplePhotos.map(p => (
                          <button
                            key={p.url}
                            type="button"
                            onClick={() => {
                              setImageUrl(p.url);
                              setVideoUrl('');
                              setAiRejected(false);
                              setErrorMessage('');
                              setCategory(p.category);
                            }}
                            className={`group relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                              imageUrl === p.url ? 'border-emerald-500' : 'border-transparent'
                            }`}
                          >
                            <img src={p.url} className="w-full h-24 object-cover" alt={p.label} />
                            <div className="absolute inset-0 bg-black/40 flex items-end p-2">
                              <span className="text-[9px] font-black text-white uppercase truncate">{p.label}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                          AI Himoya: Yuklangan surat haqiqiy ekologik muammo ekanligi Gemini AI orqali tekshiriladi va to‘g‘ridan-to‘g‘ri maktabingiz adminiga yuboriladi.
                        </p>
                      </div>
                    </div>
                  </div>

                  {isAnalyzing && (
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs font-bold">
                      Gemini AI rasmni ekologik muammo va haqiqiylik bo'yicha tekshirmoqda...
                    </div>
                  )}

                  {errorMessage && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs font-bold">
                      {errorMessage}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      disabled={(!imageUrl && !videoUrl) || isUploadingMedia || isAnalyzing || aiRejected}
                      onClick={() => setStep('details')}
                      className="px-7 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-30 cursor-pointer"
                    >
                      {isUploadingMedia ? 'Yuklanmoqda...' : isAnalyzing ? 'AI tekshirmoqda...' : 'Davom Etish'} <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 'details' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Muammo Toifasi va Tafsilotlari</h2>
                    <p className="text-xs text-slate-500">Toifani tanlang va vaziyatni aniq tasvirlang.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {CATEGORY_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setCategory(opt.id);
                          if (opt.hazardous) setSeverity('high');
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          category === opt.id
                            ? opt.hazardous
                              ? 'border-rose-500 bg-rose-500/10'
                              : 'border-emerald-500 bg-emerald-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
                        }`}
                      >
                        <div className={`text-xs font-black ${opt.hazardous ? 'text-rose-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {opt.label}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>

                  {isHazardousSelection && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div className="text-xs space-y-1">
                        <div className="font-black uppercase">Xavfsizlik Ogohlantirishi!</div>
                        <p>
                          Elektr toki, kimyoviy moddalar va xavfli chiqindilarni o‘quvchilar yoki Eko-Elchilar bartaraf etishi qat'iyan man etiladi. Ushbu xabar avtomatik ravishda maktab ma'muriyati va vakolatli idoralarga yo‘naltiriladi.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Muammo Sarlavhasi</label>
                      <input
                        type="text"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Masalan: Maktab hovlisidagi plastik chiqindilar"
                        className="mt-1.5 w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Batafsil Tavsif</label>
                      <textarea
                        rows={3}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Vaziyatni tushuntiring..."
                        className="mt-1.5 w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none focus:border-emerald-500 resize-none"
                      />
                    </div>
                    {!videoUrl && (
                      <div className="p-5 bg-slate-950 rounded-2xl border border-emerald-500/20 space-y-3 text-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-emerald-400 font-black text-[10px] uppercase tracking-widest">
                            <Sparkles className="w-4 h-4" /> EcoHero AI Tahlili
                          </div>
                          <button
                            type="button"
                            onClick={handleAnalyzeWithAI}
                            disabled={isAnalyzing || !title}
                            className="px-4 py-1.5 bg-emerald-500 text-white font-black text-[10px] rounded-lg uppercase disabled:opacity-50 cursor-pointer"
                          >
                            {isAnalyzing ? 'Tahlil...' : 'AI Tahlil'}
                          </button>
                        </div>
                        {aiResult && (
                          <div className="text-xs text-slate-300 space-y-1">
                            <div>Toifa: <b>{aiResult.categoryNameUz}</b> · Xavf: <b className="tabular-nums">{aiResult.severityScore}/10</b></div>
                            <div className="italic text-slate-400">"{aiResult.recommendedAction}"</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setStep('media')} className="px-5 py-3 text-slate-500 font-black text-xs uppercase flex items-center gap-1 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Orqaga
                    </button>
                    <button
                      disabled={!title || !description}
                      onClick={() => setStep('location')}
                      className="px-7 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-30 cursor-pointer"
                    >
                      Davom Etish <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 'location' && (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Joylashuvni Aniqlang</h2>
                    <p className="text-xs text-slate-500">Hudud va aniq manzilni belgilang.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Viloyat</label>
                      <select
                        value={region}
                        onChange={e => {
                          const nextReg = e.target.value;
                          setRegion(nextReg);
                          const dists = UZBEKISTAN_DISTRICTS[nextReg] || [];
                          setDistrict(dists[0] || '');
                        }}
                        className="mt-1.5 w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none"
                      >
                        {UZBEKISTAN_REGIONS.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tuman / Shahar</label>
                      <select
                        value={district}
                        onChange={e => setDistrict(e.target.value)}
                        className="mt-1.5 w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none"
                      >
                        {(UZBEKISTAN_DISTRICTS[region] || [district || 'Markaziy tuman']).map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manzil / Koordinata</label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        type="text"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                        placeholder="GPS tugmasini bosing yoki mo‘ljalni yozing"
                        className="flex-1 p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs font-bold outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleGetLocation}
                        className="px-4 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-500 transition-colors cursor-pointer"
                      >
                        <MapPin className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setStep('details')} className="px-5 py-3 text-slate-500 font-black text-xs uppercase flex items-center gap-1 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Orqaga
                    </button>
                    <button
                      disabled={!address.trim()}
                      onClick={() => setStep('preview')}
                      className="px-7 py-3.5 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 disabled:opacity-30 cursor-pointer"
                    >
                      Yakunlash <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 'preview' && (
                <div className="space-y-6">
                  <div className="text-center space-y-1">
                    <h2 className="text-2xl font-black uppercase tracking-tight">Hisobotni Tasdiqlang</h2>
                    <p className="text-xs text-slate-500">Yuborilgandan so‘ng AI tekshiruvidan o‘tib, maktabingiz adminiga tushadi.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                    <div className="md:col-span-5 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-square bg-slate-100 dark:bg-slate-800">
                      {videoUrl ? (
                        <video src={resolveMediaUrl(videoUrl)} controls className="w-full h-full object-cover" />
                      ) : (
                        <img src={resolveMediaUrl(imageUrl)} className="w-full h-full object-cover" alt={title} />
                      )}
                    </div>
                    <div className="md:col-span-7 space-y-4">
                      <div>
                        <h3 className="text-lg font-black uppercase">{title}</h3>
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {category} · {severity} xavf darajasi
                        </p>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{description}</p>
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
                        <div className="font-bold">{region} · {district}</div>
                        <div className="text-slate-500">{address}</div>
                      </div>
                      <div className="p-4 bg-emerald-600 rounded-2xl flex items-center justify-between text-white">
                        <div className="flex items-center gap-2 font-black text-xs uppercase">
                          <Coins className="w-4 h-4" /> Tasdiqlangach kutilayotgan mukofot
                        </div>
                        <span className="text-base font-black tabular-nums">+{expectedCoins} ECO</span>
                      </div>
                    </div>
                  </div>

                  {errorMessage && (
                    <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-start gap-2.5 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{errorMessage}</span>
                    </div>
                  )}

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setStep('location')} className="px-5 py-3 text-slate-500 font-black text-xs uppercase flex items-center gap-1 cursor-pointer">
                      <ChevronLeft className="w-4 h-4" /> Orqaga
                    </button>
                    <button
                      disabled={isSubmitting}
                      onClick={handleSubmit}
                      className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? 'Yuborilmoqda...' : 'Hisobotni Yuborish'} <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
};
