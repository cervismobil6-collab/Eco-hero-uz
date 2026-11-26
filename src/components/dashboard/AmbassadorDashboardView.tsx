import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Camera,
  Trophy,
  Upload,
  Play,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Crown,
  Calendar,
  MapPin,
  FileVideo,
  Coins,
  Zap,
  Lock,
  Plus,
  Send,
  BarChart3,
  Eye,
  X,
  Check,
  Flame,
  Trees,
  Medal,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import {
  DistrictLeaderboardDetailsResponse,
  EcoReport,
  ProblemCategory,
} from '../../types/eco';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';
import { resolveMediaUrl } from '../../utils/api';
import { calculateLevelProgress } from '../../utils/level';
import {
  STUDENT_PROBLEM_CATEGORIES,
  getProblemCategoryLabel,
  getReportStatusBadge,
  isReportFinalReviewStatus,
  isReportOpenForAmbassadorAction,
  isReportRejectedStatus,
  isReportResolvedStatus,
} from '../../utils/reportStatus';
import { UZBEKISTAN_DISTRICTS, UZBEKISTAN_REGIONS } from '../../data/mockData';
import {
  syncEcoReportToFirestore,
  uploadEvidenceToFirebaseStorage,
} from '../../services/firebase';
import crestImg from '../../assets/images/eco_trophy_crest_1795179383102.jpg';
import earthSproutImg from '../../assets/images/kabinet_earth_sprout_1795606728116.jpg';

type AmbassadorTab = 'boshqaruv' | 'muammolar' | 'faoliyatim' | 'reyting' | 'yutuqlar';
type ProblemFilter = 'all' | 'actionable' | 'final_review' | 'resolved' | 'mine';

const HAZARD_REGEX = /(elektr|tok|kabel|transformator|kislota|kimyo|kimyoviy|gaz|zahar|shprits|shisha|xavfli|hazard)/i;

export const AmbassadorDashboardView: React.FC = () => {
  const {
    user,
    ecoTasks,
    reports,
    mediaSubmissions,
    liveSyncVersion,
    updateEcoTask,
    advanceReportWorkflow,
    resolveReportWithAiVerification,
    uploadMediaFile,
    fetchDistrictLeaderboardDetails,
    apiFetch,
    syncBootstrap,
    setActiveTab,
    showNotification,
    triggerConfetti,
  } = useEco();

  const [cabinetTab, setCabinetTab] = useState<AmbassadorTab>('boshqaruv');
  const [problemFilter, setProblemFilter] = useState<ProblemFilter>('all');
  const [rankingMode, setRankingMode] = useState<'monthly' | 'overall'>('monthly');
  const [districtDetails, setDistrictDetails] = useState<DistrictLeaderboardDetailsResponse | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  // Task submission state
  const [submittingTaskId, setSubmittingTaskId] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [isUploadingTaskFile, setIsUploadingTaskFile] = useState(false);

  // After-only evidence resolution state (BEFORE photo is strictly immutable)
  const [resolvingReportId, setResolvingReportId] = useState<string | null>(null);
  const [afterImgUrl, setAfterImgUrl] = useState('');
  const [afterVideoUrl, setAfterVideoUrl] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [uploadingTarget, setUploadingTarget] = useState<'after_img' | 'after_vid' | null>(null);
  const [submittingResolutionId, setSubmittingResolutionId] = useState<string | null>(null);
  const [startingProgressId, setStartingProgressId] = useState<string | null>(null);

  // Inline Problem Report Form state
  const [showReportForm, setShowReportForm] = useState(false);
  const [repTitle, setRepTitle] = useState('');
  const [repCategory, setRepCategory] = useState<ProblemCategory>('waste');
  const [repDescription, setRepDescription] = useState('');
  const [repRegion, setRepRegion] = useState(user.region || 'Toshkent shahri');
  const [repDistrict, setRepDistrict] = useState(user.district || 'Yunusobod tumani');
  const [repAddress, setRepAddress] = useState('');
  const [repLat, setRepLat] = useState<number>(41.2995);
  const [repLng, setRepLng] = useState<number>(69.2401);
  const [repPhotoUrl, setRepPhotoUrl] = useState('');
  const [repVideoUrl, setRepVideoUrl] = useState('');
  const [uploadingRepMedia, setUploadingRepMedia] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);

  // Zoom Lightbox
  const [lightboxMedia, setLightboxMedia] = useState<{ url: string; type: 'image' | 'video'; caption: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLbLoading(true);
    fetchDistrictLeaderboardDetails({
      region: user.region,
      district: user.district,
      mode: rankingMode,
    })
      .then(res => {
        if (mounted && res) {
          setDistrictDetails(res);
        }
      })
      .finally(() => {
        if (mounted) setLbLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [fetchDistrictLeaderboardDetails, user.region, user.district, rankingMode, liveSyncVersion]);

  const levelInfo = useMemo(() => calculateLevelProgress(user.ecoXP || 0), [user.ecoXP]);

  const myTasks = useMemo(
    () => ecoTasks.filter(t => t.assigneeUid === user.uid || (user.schoolId && t.schoolId === user.schoolId)),
    [ecoTasks, user.uid, user.schoolId]
  );

  const schoolAndAssignedReports = useMemo(
    () =>
      reports.filter(r => {
        const sameSchool =
          (user.schoolId && r.schoolId === user.schoolId) ||
          (user.schoolName && r.schoolName === user.schoolName);
        return r.assignedAmbassadorUid === user.uid || r.reporterUid === user.uid || sameSchool;
      }),
    [reports, user.uid, user.schoolId, user.schoolName]
  );

  const openActionReports = useMemo(
    () =>
      schoolAndAssignedReports.filter(
        r =>
          isReportOpenForAmbassadorAction(r.status) &&
          (!r.assignedAmbassadorUid || r.assignedAmbassadorUid === user.uid || r.schoolId === user.schoolId)
      ),
    [schoolAndAssignedReports, user.uid, user.schoolId]
  );

  const finalReviewReports = useMemo(
    () => schoolAndAssignedReports.filter(r => isReportFinalReviewStatus(r.status)),
    [schoolAndAssignedReports]
  );

  const resolvedReports = useMemo(
    () => schoolAndAssignedReports.filter(r => isReportResolvedStatus(r.status)),
    [schoolAndAssignedReports]
  );

  const pendingReportsCount = useMemo(
    () =>
      schoolAndAssignedReports.filter(
        r => !isReportResolvedStatus(r.status) && !isReportRejectedStatus(r.status)
      ).length,
    [schoolAndAssignedReports]
  );

  const myResolvedCount = useMemo(
    () =>
      resolvedReports.filter(
        r => r.assignedAmbassadorUid === user.uid || !r.assignedAmbassadorUid || r.reporterUid === user.uid
      ).length,
    [resolvedReports, user.uid]
  );

  const filteredReports = useMemo(() => {
    switch (problemFilter) {
      case 'actionable':
        return openActionReports;
      case 'final_review':
        return finalReviewReports;
      case 'resolved':
        return resolvedReports;
      case 'mine':
        return schoolAndAssignedReports.filter(r => r.reporterUid === user.uid);
      default:
        return schoolAndAssignedReports;
    }
  }, [problemFilter, openActionReports, finalReviewReports, resolvedReports, schoolAndAssignedReports, user.uid]);

  const myMedia = useMemo(() => mediaSubmissions.filter(m => m.userId === user.uid), [mediaSubmissions, user.uid]);
  const approvedMediaCount = useMemo(() => myMedia.filter(m => m.status === 'APPROVED').length, [myMedia]);

  // Monthly activity counters
  const monthPrefix = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const monthlyStats = useMemo(() => {
    const monthlyResolved = resolvedReports.filter(
      r => (r.resolvedAt || r.updatedAt || r.createdAt || '').startsWith(monthPrefix)
    ).length;
    const monthlyMedia = myMedia.filter(
      m => m.status === 'APPROVED' && (m.moderatedAt || m.createdAt || '').startsWith(monthPrefix)
    ).length;
    const monthlyTasks = myTasks.filter(
      t => t.status === 'verified' && (t.updatedAt || t.createdAt || '').startsWith(monthPrefix)
    ).length;
    return { monthlyResolved, monthlyMedia, monthlyTasks };
  }, [resolvedReports, myMedia, myTasks, monthPrefix]);

  const ambList = districtDetails?.ambassadorRatings || [];
  const top10Ambassadors = useMemo(
    () => (districtDetails?.top10Ambassadors && districtDetails.top10Ambassadors.length > 0
      ? districtDetails.top10Ambassadors
      : ambList.slice(0, 10)),
    [districtDetails?.top10Ambassadors, ambList]
  );
  const totalAmb = districtDetails?.totalAmbassadorsInDistrict || ambList.length;
  const myAmbRating =
    districtDetails?.myAmbassadorRating || ambList.find(a => a.id === user.uid) || null;
  const top3Threshold = ambList[2]?.realScore ?? 0;

  // Achievement badges for Yutuqlar tab
  const achievements = useMemo(() => {
    const rank = myAmbRating?.rank || 999;
    return [
      {
        id: 'first_resolve',
        title: 'Birinchi Hal Etilgan Muammo',
        desc: "Kamida 1 ta ekologik muammoni rasmiy Avval/Keyin dalili bilan hal qiling",
        unlocked: myResolvedCount >= 1,
        progress: `${Math.min(1, myResolvedCount)} / 1`,
        reward: '+200 ECO',
      },
      {
        id: 'five_resolves',
        title: "Maktab Qo'riqchisi",
        desc: '5 ta ekologik muammoni maktab admini tasdig‘i bilan yakunlang',
        unlocked: myResolvedCount >= 5,
        progress: `${Math.min(5, myResolvedCount)} / 5`,
        reward: 'Oltin Nishon',
      },
      {
        id: 'media_creator',
        title: 'Faol Ekologik Muxbir',
        desc: '5 ta tasdiqlangan foto yoki video hisobot yuklang',
        unlocked: approvedMediaCount >= 5,
        progress: `${Math.min(5, approvedMediaCount)} / 5`,
        reward: 'Media Yulduzi',
      },
      {
        id: 'top3_district',
        title: 'Tuman TOP-3 Yetakchisi',
        desc: 'Tumaningizdagi Eco-Elchilar reytingida kuchli uchlikka kiring',
        unlocked: Boolean(myAmbRating?.isTop3 || (rank > 0 && rank <= 3)),
        progress: myAmbRating ? `#${myAmbRating.rank}` : 'Kutilmoqda',
        reward: 'Oy Oxiri Sovg‘asi',
      },
      {
        id: 'level_5',
        title: 'Tajribali Eco-Elchi (Lv. 5+)',
        desc: 'Ekologik XP yig‘ish orqali 5-darajaga ko‘tariling',
        unlocked: levelInfo.level >= 5,
        progress: `Lv. ${levelInfo.level} / 5`,
        reward: 'Master Unvoni',
      },
      {
        id: 'tree_keeper',
        title: "Yashil Bog'bon",
        desc: 'Kamida 10 ta daraxt ekish yoki parvarish aksiyasida qatnashing',
        unlocked: (user.activityStats?.treesPlanted || user.treesPlanted || 0) >= 10,
        progress: `${Math.min(10, user.activityStats?.treesPlanted || user.treesPlanted || 0)} / 10`,
        reward: 'Eko-Bog‘bon',
      },
    ];
  }, [myResolvedCount, approvedMediaCount, myAmbRating, levelInfo.level, user.activityStats?.treesPlanted, user.treesPlanted]);

  const handleUploadAfterEvidence = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'video'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      showNotification('Fayl hajmi 25 MB dan oshmasligi kerak', 'warning');
      return;
    }
    setUploadingTarget(kind === 'image' ? 'after_img' : 'after_vid');
    try {
      const fbUrl = await uploadEvidenceToFirebaseStorage(file, 'after', file.name);
      if (fbUrl) {
        if (kind === 'image') setAfterImgUrl(fbUrl);
        else setAfterVideoUrl(fbUrl);
        showNotification(kind === 'image' ? 'Keyingi rasm yuklandi!' : 'Keyingi video yuklandi!', 'success');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const up = await uploadMediaFile(reader.result as string, file.name);
          if (up.success && up.url) {
            if (kind === 'image') setAfterImgUrl(up.url);
            else setAfterVideoUrl(up.url);
            showNotification(kind === 'image' ? 'Keyingi rasm yuklandi!' : 'Keyingi video yuklandi!', 'success');
          } else {
            showNotification(up.error || 'Yuklashda xatolik', 'warning');
          }
        } finally {
          setUploadingTarget(null);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingTarget(null);
      showNotification('Fayl yuklashda xatolik yuz berdi', 'warning');
    } finally {
      if (e.target) e.target.value = '';
    }
  };

  const handleStartProgress = async (reportId: string) => {
    setStartingProgressId(reportId);
    try {
      await resolveReportWithAiVerification(reportId, { action: 'start_progress' });
    } finally {
      setStartingProgressId(null);
    }
  };

  const handleSubmitAfterEvidence = async (report: EcoReport) => {
    if (!afterImgUrl && !afterVideoUrl) {
      showNotification("Muammo bartaraf etilganidan keyingi rasm yoki video yuklang!", 'warning');
      return;
    }
    if (resolutionNote.trim().length < 3) {
      showNotification("Qanday chora ko‘rilgani haqida qisqacha izoh yozing!", 'warning');
      return;
    }
    setSubmittingResolutionId(report.id);
    try {
      const res = await resolveReportWithAiVerification(report.id, {
        action: 'submit_evidence',
        afterImageUrl: afterImgUrl || undefined,
        afterVideoUrl: afterVideoUrl || undefined,
        note: resolutionNote.trim(),
      });
      if (res.success) {
        if (res.report) {
          syncEcoReportToFirestore(res.report).catch(() => {});
        }
        setResolvingReportId(null);
        setAfterImgUrl('');
        setAfterVideoUrl('');
        setResolutionNote('');
      }
    } finally {
      setSubmittingResolutionId(null);
    }
  };

  const handleEvidenceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingTaskFile(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const uploaded = await uploadMediaFile(reader.result as string, file.name);
        if (uploaded.success && uploaded.url) {
          setEvidenceUrl(uploaded.url);
          showNotification('Dalil fayli yuklandi!', 'success');
        } else {
          showNotification(uploaded.error || 'Yuklashda xatolik', 'warning');
        }
      } finally {
        setIsUploadingTaskFile(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitTaskEvidence = async (taskId: string, relatedReportId?: string) => {
    if (!completionNote.trim()) {
      showNotification('Bajarilgan ish tavsifini kiriting', 'warning');
      return;
    }
    await updateEcoTask(taskId, {
      status: 'submitted',
      evidenceUrl: evidenceUrl || undefined,
      completionNote: completionNote.trim(),
    });
    if (relatedReportId) {
      await advanceReportWorkflow(relatedReportId, 'ambassador_solution', {
        note: completionNote.trim(),
        resolutionEvidenceUrl: evidenceUrl || undefined,
      });
    }
    setSubmittingTaskId(null);
    setCompletionNote('');
    setEvidenceUrl('');
  };

  const handleInlineReportMedia = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      showNotification('Fayl hajmi 20 MB dan oshmasligi kerak', 'warning');
      return;
    }
    const isVideo = file.type.startsWith('video/');
    setUploadingRepMedia(true);
    try {
      const fbUrl = await uploadEvidenceToFirebaseStorage(file, 'before', file.name);
      if (fbUrl) {
        if (isVideo) {
          setRepVideoUrl(fbUrl);
        } else {
          setRepPhotoUrl(fbUrl);
        }
        showNotification('Original dalil yuklandi!', 'success');
        setUploadingRepMedia(false);
        return;
      }
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const up = await uploadMediaFile(reader.result as string, file.name);
          if (up.success && up.url) {
            if (isVideo || up.mediaType === 'video') setRepVideoUrl(up.url);
            else setRepPhotoUrl(up.url);
            showNotification('Original dalil yuklandi!', 'success');
          } else {
            showNotification(up.error || 'Faylni yuklashda xatolik', 'warning');
          }
        } finally {
          setUploadingRepMedia(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadingRepMedia(false);
    }
  };

  const handleGetGps = () => {
    if (!navigator.geolocation) {
      showNotification('Brauzer GPS joylashuvni qo‘llamaydi', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setRepLat(pos.coords.latitude);
        setRepLng(pos.coords.longitude);
        if (!repAddress.trim()) {
          setRepAddress(`${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`);
        }
        showNotification('GPS koordinatalari olindi!', 'success');
      },
      () => showNotification('GPS ruxsati berilmadi', 'warning')
    );
  };

  const handleSubmitInlineReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repPhotoUrl && !repVideoUrl) {
      showNotification('Original rasm yoki video yuklang!', 'warning');
      return;
    }
    if (repDescription.trim().length < 5) {
      showNotification('Muammo tavsifini batafsil yozing', 'warning');
      return;
    }
    setSubmittingReport(true);
    try {
      const catMeta = STUDENT_PROBLEM_CATEGORIES.find(c => c.id === repCategory);
      const isHazardous = Boolean(
        catMeta?.hazardous || HAZARD_REGEX.test(`${repTitle} ${repDescription}`)
      );
      const clientReportId = `rep_${Date.now()}`;
      const res = await apiFetch('/api/reports/submit', {
        method: 'POST',
        body: JSON.stringify({
          clientReportId,
          title: repTitle.trim() || catMeta?.label || 'Ekologik muammo',
          description: repDescription.trim(),
          category: repCategory,
          severity: isHazardous ? 'high' : 'medium',
          region: repRegion,
          district: repDistrict,
          address: repAddress.trim() || `${repRegion}, ${repDistrict}`,
          lat: repLat,
          lng: repLng,
          imageUrl: repPhotoUrl || undefined,
          beforeImageUrl: repPhotoUrl || undefined,
          videoUrl: repVideoUrl || undefined,
          beforeVideoUrl: repVideoUrl || undefined,
          authorUid: user.uid,
          authorName: user.fullName,
          schoolId: user.schoolId,
          authorSchool: user.schoolName,
          schoolNumber: user.schoolNumber,
          isHazardous,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Hisobot yuborishda xatolik', 'warning');
        return;
      }
      if (data.report) {
        syncEcoReportToFirestore(data.report).catch(() => {});
      }
      showNotification('Murojaat maktab administratoriga yuborildi!', 'success');
      triggerConfetti();
      setShowReportForm(false);
      setRepTitle('');
      setRepDescription('');
      setRepAddress('');
      setRepPhotoUrl('');
      setRepVideoUrl('');
      await syncBootstrap();
    } catch {
      showNotification('Tarmoq xatoligi yuz berdi', 'warning');
    } finally {
      setSubmittingReport(false);
    }
  };

  const renderMediaThumb = (url: string | undefined, isVideo: boolean, label: string, tone: 'before' | 'after') => {
    const resolved = url ? resolveMediaUrl(url) : '';
    const borderTone = tone === 'before' ? 'border-amber-500/35' : 'border-emerald-500/40';
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
          <span className={tone === 'before' ? 'text-amber-300' : 'text-emerald-300'}>{label}</span>
          {tone === 'before' && (
            <span className="inline-flex items-center gap-1 text-slate-400 font-medium normal-case">
              <Lock className="w-2.5 h-2.5" /> O‘zgarmas
            </span>
          )}
        </div>
        {resolved ? (
          <button
            type="button"
            onClick={() =>
              setLightboxMedia({
                url: resolved,
                type: isVideo ? 'video' : 'image',
                caption: label,
              })
            }
            className={`relative block w-full h-36 rounded-xl overflow-hidden bg-black/50 border ${borderTone} group cursor-zoom-in`}
          >
            {isVideo ? (
              <video
                src={resolved}
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={resolved}
                alt={label}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            )}
            <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-semibold inline-flex items-center gap-1">
              <Eye className="w-3 h-3" /> Ko‘rish
            </span>
          </button>
        ) : (
          <div className="w-full h-36 rounded-xl border border-dashed border-emerald-500/25 bg-[#04100B] flex items-center justify-center text-[11px] text-emerald-200/45 px-3 text-center">
            {tone === 'before' ? 'Original media mavjud emas' : 'Keyingi holat hali yuklanmagan'}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 text-emerald-50">
      {/* HERO IDENTITY BANNER — Dark Emerald Eco-Elchi Showcase (NO application button!) */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#062218] via-[#051811] to-[#030D09] border border-emerald-500/30 shadow-2xl shadow-emerald-950/60 p-5 md:p-7">
        <img
          src={earthSproutImg}
          alt=""
          aria-hidden="true"
          className="pointer-events-none select-none absolute -right-8 -top-6 w-56 h-56 md:w-72 md:h-72 object-cover opacity-25 rounded-full blur-[1px]"
        />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4 min-w-0">
            <div className="relative shrink-0">
              <img
                src={crestImg}
                alt="Eco-Elchi nishoni"
                className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-cover border-2 border-emerald-400/60 shadow-lg shadow-emerald-500/20"
              />
              <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center border-2 border-[#051811]">
                <ShieldCheck className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-400/35 text-emerald-300 text-[11px] font-bold">
                  <ShieldCheck className="w-3 h-3" /> Tasdiqlangan Eco-Elchi
                </span>
                <span className="text-[11px] text-emerald-200/75 truncate">
                  {user.region} · {districtDetails?.district || user.district}
                </span>
              </div>

              <h2 className="text-xl md:text-2xl font-black tracking-tight text-white truncate">
                {user.fullName}
              </h2>

              <p className="text-xs text-emerald-100/80 font-medium truncate">
                {user.schoolName}
                {user.schoolNumber ? ` · №${user.schoolNumber}-maktab` : ''}
              </p>

              {/* Level & XP Bar */}
              <div className="pt-1 max-w-md space-y-1">
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums">
                  <span className="inline-flex items-center gap-1 font-bold text-amber-300">
                    <Crown className="w-3.5 h-3.5" /> Lv. {levelInfo.level}
                  </span>
                  <span className="text-emerald-200/85">
                    {levelInfo.xpIntoLevel.toLocaleString()} / {levelInfo.xpRequiredForNextLevel.toLocaleString()} XP
                  </span>
                </div>
                <div className="h-2 rounded-full bg-black/50 border border-emerald-500/25 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-lime-400 transition-all duration-500"
                    style={{ width: `${levelInfo.progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 shrink-0">
            <div className="flex items-center gap-4 px-4 py-2.5 rounded-2xl bg-black/35 border border-emerald-500/25">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-200/70 font-semibold">EcoCoin</div>
                <div className="text-lg font-black font-mono tabular-nums text-amber-400">
                  {(user.ecoCoins || 0).toLocaleString()} ECO
                </div>
              </div>
              <div className="w-px h-8 bg-emerald-500/20" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-emerald-200/70 font-semibold">Tuman reytingi</div>
                <div className="text-lg font-black font-mono tabular-nums text-emerald-300">
                  {myAmbRating ? `#${myAmbRating.rank} / ${totalAmb}` : '—'}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setCabinetTab('muammolar');
                  setShowReportForm(true);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Muammo xabar qilish</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('media')}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/35 text-emerald-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Camera className="w-4 h-4" />
                <span>Foto / Video</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5-SECTION NAVIGATION TABS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-1.5 rounded-2xl bg-[#061811] border border-emerald-500/25">
        {(
          [
            { id: 'boshqaruv', label: 'Boshqaruv', icon: BarChart3 },
            { id: 'muammolar', label: 'Muammolar', icon: AlertTriangle, badge: openActionReports.length },
            { id: 'faoliyatim', label: 'Faoliyatim', icon: ClipboardList },
            { id: 'reyting', label: 'Tuman reytingi', icon: Trophy },
            { id: 'yutuqlar', label: 'Yutuqlar', icon: Medal },
          ] as const
        ).map(tab => {
          const Icon = tab.icon;
          const active = cabinetTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCabinetTab(tab.id)}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                active
                  ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/25'
                  : 'text-emerald-100/75 hover:bg-emerald-500/10 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{tab.label}</span>
              {'badge' in tab && typeof tab.badge === 'number' && tab.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-black font-mono tabular-nums ${
                    active ? 'bg-slate-950 text-emerald-300' : 'bg-amber-500 text-slate-950'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: BOSHQARUV */}
      {cabinetTab === 'boshqaruv' && (
        <div className="space-y-5">
          {/* 4 Core KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-1">
              <div className="text-[11px] text-emerald-200/70 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Hal etilgan muammolar</span>
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-emerald-400">
                {myResolvedCount} ta
              </div>
              <div className="text-[10px] text-emerald-200/55">Maktab admini tasdiqlagan</div>
            </div>

            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-1">
              <div className="text-[11px] text-emerald-200/70 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Kutilayotgan / Jarayonda</span>
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-amber-400">
                {pendingReportsCount} ta
              </div>
              <div className="text-[10px] text-emerald-200/55">
                {openActionReports.length} ta ijroga tayyor · {finalReviewReports.length} ta yakuniy tekshiruvda
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-1">
              <div className="text-[11px] text-emerald-200/70 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-sky-400" />
                <span>Oylik faollik ({monthPrefix})</span>
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-sky-400">
                {monthlyStats.monthlyResolved + monthlyStats.monthlyMedia + monthlyStats.monthlyTasks} ta
              </div>
              <div className="text-[10px] text-emerald-200/55">
                {monthlyStats.monthlyResolved} hal · {monthlyStats.monthlyMedia} media · {monthlyStats.monthlyTasks} vazifa
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-1">
              <div className="text-[11px] text-emerald-200/70 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-lime-400" />
                <span>Jami Ekologik XP</span>
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-white">
                {(user.ecoXP || 0).toLocaleString()} XP
              </div>
              <div className="text-[10px] text-emerald-200/55">
                Keyingi darajagacha {levelInfo.xpRemainingForNextLevel.toLocaleString()} XP
              </div>
            </div>
          </div>

          {/* Transparent Eco-Elchi Verification & Reward Rules Strip */}
          <div className="p-4 rounded-2xl bg-[#071E15] border border-emerald-500/30 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-emerald-500/20">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black font-mono tabular-nums text-amber-300">+200 EcoCoin</div>
                <div className="text-[11px] text-emerald-100/75">Eco-Elchi (muammo hal etilganda)</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-emerald-500/20">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-black font-mono tabular-nums text-emerald-300">+100 EcoCoin</div>
                <div className="text-[11px] text-emerald-100/75">Xabar bergan o‘quvchiga mukofot</div>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-xl bg-black/30 border border-emerald-500/20">
              <div className="w-10 h-10 rounded-xl bg-violet-500/15 text-violet-300 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">Avval / Keyin Nazorati</div>
                <div className="text-[11px] text-emerald-100/75">Coin faqat maktab admini yakuniy tasdiqlagach beriladi</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Quick Action Reports Queue */}
            <div className="lg:col-span-7 p-5 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Ijrodagi Muammolar ({openActionReports.length})</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setCabinetTab('muammolar')}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  Barchasi →
                </button>
              </div>

              {openActionReports.length === 0 ? (
                <div className="py-8 text-center text-xs text-emerald-200/60 border border-dashed border-emerald-500/20 rounded-xl">
                  Hozircha sizga biriktirilgan ochiq muammolar yo‘q.
                </div>
              ) : (
                <div className="space-y-3">
                  {openActionReports.slice(0, 3).map(rep => {
                    const badge = getReportStatusBadge(rep.status);
                    return (
                      <div
                        key={rep.id}
                        className="p-3.5 rounded-xl bg-[#04100B] border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {rep.beforeImageUrl || rep.imageUrl ? (
                            <img
                              src={resolveMediaUrl(rep.beforeImageUrl || rep.imageUrl)}
                              alt={rep.title}
                              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-amber-500/35"
                            />
                          ) : null}
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-white truncate">{rep.title}</span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badge.badgeClass}`}>
                                {badge.label}
                              </span>
                            </div>
                            <div className="text-[11px] text-emerald-200/70 line-clamp-1">
                              {getProblemCategoryLabel(rep.category)} · {rep.reporterName}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setCabinetTab('muammolar');
                            setProblemFilter('actionable');
                            setResolvingReportId(rep.id);
                          }}
                          className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shrink-0 cursor-pointer"
                        >
                          Keyingi rasm yuklash
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tasks from School Captain */}
            <div className="lg:col-span-5 p-5 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-emerald-400" />
                  <span>Maktab Sardori Vazifalari</span>
                </h3>
                <span className="text-xs font-mono tabular-nums text-emerald-300">{myTasks.length} ta</span>
              </div>

              {myTasks.length === 0 ? (
                <div className="py-8 text-center text-xs text-emerald-200/60 border border-dashed border-emerald-500/20 rounded-xl">
                  Hozircha yangi vazifalar biriktirilmagan.
                </div>
              ) : (
                <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                  {myTasks.map(task => (
                    <div key={task.id} className="p-3.5 rounded-xl bg-[#04100B] border border-emerald-500/20 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white">{task.title}</div>
                          <div className="text-[11px] text-emerald-200/70 mt-0.5">{task.instructions}</div>
                          <div className="text-[10px] text-emerald-300/80 mt-1 font-mono">
                            +{task.rewardCoins} ECO · Holat: {task.status}
                          </div>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          {task.status === 'assigned' && (
                            <button
                              type="button"
                              onClick={() => updateEcoTask(task.id, { status: 'in_progress' })}
                              className="px-2.5 py-1.5 rounded-lg bg-sky-500 text-slate-950 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Play className="w-3 h-3" /> Boshlash
                            </button>
                          )}
                          {(task.status === 'assigned' || task.status === 'in_progress' || task.status === 'needs_revision') && (
                            <button
                              type="button"
                              onClick={() => {
                                setSubmittingTaskId(task.id);
                                setCompletionNote(task.completionNote || '');
                                setEvidenceUrl(task.evidenceUrl || '');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-bold cursor-pointer"
                            >
                              Dalil
                            </button>
                          )}
                          {task.status === 'verified' && (
                            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Tasdiqlandi
                            </span>
                          )}
                        </div>
                      </div>

                      {submittingTaskId === task.id && (
                        <div className="p-3 rounded-xl bg-[#061D14] border border-emerald-500/30 space-y-2.5">
                          <textarea
                            rows={2}
                            value={completionNote}
                            onChange={e => setCompletionNote(e.target.value)}
                            placeholder="Bajarilgan ish natijasi..."
                            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-emerald-500/30 text-xs text-white outline-none"
                          />
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/35 text-[11px] font-semibold text-emerald-200 cursor-pointer">
                              <Upload className="w-3.5 h-3.5" />
                              <span>{isUploadingTaskFile ? 'Yuklanmoqda...' : evidenceUrl ? 'Fayl biriktirildi' : 'Foto / Video'}</span>
                              <input type="file" accept="image/*,video/*" onChange={handleEvidenceFile} className="hidden" />
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setSubmittingTaskId(null)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] text-emerald-200/70 cursor-pointer"
                              >
                                Bekor
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSubmitTaskEvidence(task.id, task.relatedReportId)}
                                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-[11px] font-extrabold cursor-pointer"
                              >
                                Yuborish
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Embedded @Ecoheros_bot Chat */}
          <EcoTelegramChatPanel
            allowedScopes={['school_ambassadors', 'student_dm']}
            allowStudentDiscovery={true}
            title="@Ecoheros_bot · Maktab Sardori, Eko-Elchilar & O'quvchilar Suhbati"
          />
        </div>
      )}

      {/* TAB 2: MUAMMOLAR (Immutable BEFORE + Upload AFTER + Report New Problem) */}
      {cabinetTab === 'muammolar' && (
        <div className="space-y-5">
          {/* Header & Controls */}
          <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { id: 'all', label: `Barchasi (${schoolAndAssignedReports.length})` },
                  { id: 'actionable', label: `Ijro (${openActionReports.length})` },
                  { id: 'final_review', label: `Yakuniy tekshiruv (${finalReviewReports.length})` },
                  { id: 'resolved', label: `Hal etilgan (${resolvedReports.length})` },
                  { id: 'mine', label: 'Mening murojaatlarim' },
                ] as const
              ).map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setProblemFilter(f.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    problemFilter === f.id
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-black/30 text-emerald-200/80 border border-emerald-500/20 hover:border-emerald-400/50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowReportForm(prev => !prev)}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{showReportForm ? 'Formani yopish' : 'Yangi muammo xabar qilish'}</span>
            </button>
          </div>

          {/* Inline Student/Ambassador Problem Submission Form */}
          {showReportForm && (
            <form
              onSubmit={handleSubmitInlineReport}
              className="p-5 rounded-2xl bg-[#061D14] border border-emerald-500/40 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-white">Ekologik Muammo Haqida Xabar Berish</h3>
                  <p className="text-[11px] text-emerald-200/75">
                    Original foto yoki video o‘zgarmas dalil sifatida saqlanadi va maktab administratoriga yuboriladi.
                  </p>
                </div>
              </div>

              {/* Auto-filled account identity card */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-black/35 border border-emerald-500/20 text-xs">
                <div>
                  <div className="text-[10px] text-emerald-200/60">F.I.Sh (Avtomatik)</div>
                  <div className="font-bold text-white truncate">{user.fullName}</div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-200/60">Maktab (Avtomatik)</div>
                  <div className="font-bold text-emerald-300 truncate">
                    {user.schoolName} {user.schoolNumber ? `(№${user.schoolNumber})` : ''}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-200/60">Yuborish sanasi</div>
                  <div className="font-mono font-bold text-white">{new Date().toLocaleDateString('uz-UZ')}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-200/80 mb-1">Muammo toifasi *</label>
                  <select
                    value={repCategory}
                    onChange={e => setRepCategory(e.target.value as ProblemCategory)}
                    className="w-full px-3 py-2.5 rounded-xl bg-black/45 border border-emerald-500/30 text-xs text-white outline-none"
                  >
                    {STUDENT_PROBLEM_CATEGORIES.map(c => (
                      <option key={c.id} value={c.id} className="bg-slate-900">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-200/80 mb-1">Qisqa sarlavha</label>
                  <input
                    type="text"
                    value={repTitle}
                    onChange={e => setRepTitle(e.target.value)}
                    placeholder="Masalan: Maktab orqa hovlisida plastik chiqindi"
                    className="w-full px-3 py-2.5 rounded-xl bg-black/45 border border-emerald-500/30 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-emerald-200/80 mb-1">Muammo tavsifi *</label>
                <textarea
                  rows={2}
                  required
                  value={repDescription}
                  onChange={e => setRepDescription(e.target.value)}
                  placeholder="Muammo qayerda va qanday holatda ekanini aniq yozing..."
                  className="w-full px-3 py-2.5 rounded-xl bg-black/45 border border-emerald-500/30 text-xs text-white outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <select
                  value={repRegion}
                  onChange={e => {
                    const nextReg = e.target.value;
                    setRepRegion(nextReg);
                    setRepDistrict((UZBEKISTAN_DISTRICTS[nextReg] || [])[0] || '');
                  }}
                  className="px-3 py-2 rounded-xl bg-black/45 border border-emerald-500/30 text-xs text-white outline-none"
                >
                  {UZBEKISTAN_REGIONS.map(reg => (
                    <option key={reg} value={reg} className="bg-slate-900">
                      {reg}
                    </option>
                  ))}
                </select>
                <select
                  value={repDistrict}
                  onChange={e => setRepDistrict(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-black/45 border border-emerald-500/30 text-xs text-white outline-none"
                >
                  {(UZBEKISTAN_DISTRICTS[repRegion] || [user.district || 'Yunusobod tumani']).map(d => (
                    <option key={d} value={d} className="bg-slate-900">
                      {d}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={repAddress}
                    onChange={e => setRepAddress(e.target.value)}
                    placeholder="Manzil yoki mo‘ljal"
                    className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-black/45 border border-emerald-500/30 text-xs text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleGetGps}
                    title="GPS olish"
                    className="px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-bold shrink-0 cursor-pointer"
                  >
                    <MapPin className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer">
                    <Camera className="w-4 h-4" />
                    <span>{uploadingRepMedia ? 'Yuklanmoqda...' : repPhotoUrl ? 'Foto yuklandi ✓' : 'Original Foto / Video yuklash *'}</span>
                    <input type="file" accept="image/*,video/*" onChange={handleInlineReportMedia} className="hidden" />
                  </label>
                  {repVideoUrl && <span className="text-[11px] text-emerald-300 font-semibold">Video tayyor ✓</span>}
                </div>

                <button
                  type="submit"
                  disabled={submittingReport || uploadingRepMedia || (!repPhotoUrl && !repVideoUrl)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {submittingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span>Yuborish</span>
                </button>
              </div>
            </form>
          )}

          {/* Reports List with Immutable BEFORE & AFTER Upload */}
          {filteredReports.length === 0 ? (
            <div className="p-10 rounded-2xl bg-[#061811] border border-emerald-500/20 text-center text-xs text-emerald-200/60">
              Tanlangan filtr bo‘yicha ekologik muammolar topilmadi.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredReports.map(rep => {
                const badge = getReportStatusBadge(rep.status);
                const beforePhoto = rep.beforeImageUrl || rep.imageUrl;
                const beforeVideo = rep.beforeVideoUrl || rep.videoUrl;
                const afterPhoto = rep.afterImageUrl || rep.resolvedImageUrl;
                const afterVideo = rep.afterVideoUrl;
                const canWork = !rep.isHazardous && isReportOpenForAmbassadorAction(rep.status);
                const isAssignedOnly = String(rep.status || '').toUpperCase() === 'ASSIGNED';
                const isReupload = String(rep.status || '').toUpperCase() === 'REUPLOAD_REQUIRED';
                const isExpanded = resolvingReportId === rep.id;

                return (
                  <div
                    key={rep.id}
                    className={`p-5 rounded-2xl bg-[#061811] border space-y-4 ${
                      isReupload
                        ? 'border-orange-500/50'
                        : isReportFinalReviewStatus(rep.status)
                        ? 'border-violet-500/45'
                        : 'border-emerald-500/25'
                    }`}
                  >
                    {/* Report Meta Header */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-black text-white">{rep.title}</h4>
                          <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold inline-flex items-center gap-1.5 ${badge.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                            {badge.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-white/5 border border-emerald-500/20 text-[10px] font-semibold text-emerald-200">
                            {getProblemCategoryLabel(rep.category)}
                          </span>
                        </div>
                        <p className="text-xs text-emerald-100/80">{rep.captainInstructions || rep.description}</p>
                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-emerald-200/60 font-mono">
                          <span>O‘quvchi: {rep.reporterName}</span>
                          <span>· {rep.address || `${rep.region}, ${rep.district}`}</span>
                          <span>· {new Date(rep.createdAt).toLocaleDateString('uz-UZ')}</span>
                          {rep.lat && rep.lng ? (
                            <span>· GPS: {rep.lat.toFixed(4)}, {rep.lng.toFixed(4)}</span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {canWork && isAssignedOnly && (
                          <button
                            type="button"
                            disabled={startingProgressId === rep.id}
                            onClick={() => handleStartProgress(rep.id)}
                            className="px-3 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {startingProgressId === rep.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                            <span>Ishni boshlash</span>
                          </button>
                        )}
                        {canWork && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isExpanded) {
                                setResolvingReportId(null);
                              } else {
                                setResolvingReportId(rep.id);
                                setAfterImgUrl(rep.afterImageUrl || '');
                                setAfterVideoUrl(rep.afterVideoUrl || '');
                                setResolutionNote(rep.resolutionDescription || '');
                              }
                            }}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer"
                          >
                            {isExpanded ? 'Yopish' : isReupload ? 'Qayta dalil yuklash' : 'Keyingi holatni yuklash'}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Hazard Warning */}
                    {rep.isHazardous && (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-300 font-semibold flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>XAVFLI HOLAT: O‘quvchilar va Eco-Elchilar mustaqil hal qilishi taqiqlanadi. Maktab ma’muriyati mas’ul!</span>
                      </div>
                    )}

                    {/* Re-upload feedback banner */}
                    {isReupload && (
                      <div className="p-3 rounded-xl bg-orange-500/15 border border-orange-500/40 text-xs text-orange-200 space-y-1">
                        <div className="font-bold text-orange-300">Maktab administratori qayta rasm/video so‘radi:</div>
                        <div>{rep.finalReviewNote || "Iltimos, muammo to‘liq hal qilinganini ko‘rsatuvchi aniqroq KEYIN suratini yuklang."}</div>
                      </div>
                    )}

                    {/* Side-by-side AVVAL (Immutable) & KEYIN */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {renderMediaThumb(
                        beforeVideo || beforePhoto,
                        Boolean(beforeVideo && !beforePhoto),
                        "AVVAL (O'quvchi — Original)",
                        'before'
                      )}
                      {renderMediaThumb(
                        afterPhoto || afterVideo,
                        Boolean(afterVideo && !afterPhoto),
                        'KEYIN (Eco-Elchi natijasi)',
                        'after'
                      )}
                    </div>

                    {/* Status-specific guidance / notes */}
                    {rep.resolutionDescription && (
                      <div className="p-3 rounded-xl bg-black/35 border border-emerald-500/20 text-xs text-emerald-100/85">
                        <span className="font-bold text-emerald-300">Eco-Elchi izohi: </span>
                        {rep.resolutionDescription}
                      </div>
                    )}

                    {isReportFinalReviewStatus(rep.status) && (
                      <div className="p-3 rounded-xl bg-violet-500/15 border border-violet-500/35 text-xs text-violet-200 font-medium">
                        Maktab administratori Avval va Keyin dalillarini solishtirmoqda. Tasdiqlangandan so‘ng sizga{' '}
                        <b className="text-amber-300">+200 EcoCoin</b>, o‘quvchiga <b className="text-emerald-300">+100 EcoCoin</b> beriladi.
                      </div>
                    )}

                    {isReportResolvedStatus(rep.status) && (
                      <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs text-emerald-200 font-semibold flex flex-wrap items-center justify-between gap-2">
                        <span>Maktab administratori tasdiqladi · Muammo rasman hal etildi!</span>
                        <span className="font-mono text-amber-300 font-black">
                          +{rep.ambassadorRewardedCoins ?? 200} ECO (Elchi) · +{rep.studentRewardedCoins ?? 100} ECO (O‘quvchi)
                        </span>
                      </div>
                    )}

                    {/* AFTER-ONLY Upload Drawer */}
                    {isExpanded && canWork && (
                      <div className="p-4 rounded-xl bg-[#04120D] border border-emerald-500/40 space-y-3">
                        <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Faqat hal qilingandan keyingi (KEYIN) foto/video yuklang — Avvalgi rasm saqlanib qoladi</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-2">
                            {afterImgUrl && (
                              <img
                                src={resolveMediaUrl(afterImgUrl)}
                                alt="Keyingi rasm"
                                className="w-full h-28 object-cover rounded-xl border border-emerald-500/40"
                              />
                            )}
                            <label className="w-full px-3 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:bg-emerald-500/25">
                              <Camera className="w-4 h-4" />
                              <span>{uploadingTarget === 'after_img' ? 'Yuklanmoqda...' : afterImgUrl ? 'Keyingi rasmni almashtirish' : 'Keyingi rasmni yuklash *'}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={e => handleUploadAfterEvidence(e, 'image')}
                                className="hidden"
                              />
                            </label>
                          </div>

                          <div className="space-y-2">
                            {afterVideoUrl && (
                              <video
                                src={resolveMediaUrl(afterVideoUrl)}
                                controls
                                className="w-full h-28 object-cover rounded-xl border border-emerald-500/40"
                              />
                            )}
                            <label className="w-full px-3 py-2.5 rounded-xl bg-black/40 border border-emerald-500/25 text-emerald-200/85 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer hover:border-emerald-400/60">
                              <FileVideo className="w-4 h-4" />
                              <span>{uploadingTarget === 'after_vid' ? 'Video yuklanmoqda...' : afterVideoUrl ? 'Video biriktirildi ✓' : 'Video qo‘shish (ixtiyoriy)'}</span>
                              <input
                                type="file"
                                accept="video/*"
                                onChange={e => handleUploadAfterEvidence(e, 'video')}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        <textarea
                          rows={2}
                          value={resolutionNote}
                          onChange={e => setResolutionNote(e.target.value)}
                          placeholder="Muammo qanday va kimlar bilan bartaraf etilgani haqida izoh yozing..."
                          className="w-full px-3 py-2.5 rounded-xl bg-black/45 border border-emerald-500/30 text-xs text-white outline-none resize-none"
                        />

                        <button
                          type="button"
                          disabled={
                            submittingResolutionId === rep.id ||
                            uploadingTarget !== null ||
                            (!afterImgUrl && !afterVideoUrl)
                          }
                          onClick={() => handleSubmitAfterEvidence(rep)}
                          className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                        >
                          {submittingResolutionId === rep.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Yakuniy tekshiruvga yuborilmoqda...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Maktab Adminiga Yakuniy Tekshiruvga Yuborish</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FAOLIYATIM */}
      {cabinetTab === 'faoliyatim' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25">
              <div className="text-[11px] text-emerald-200/70">Hal etilgan muammolar</div>
              <div className="text-2xl font-black font-mono tabular-nums text-emerald-400">{myResolvedCount}</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25">
              <div className="text-[11px] text-emerald-200/70">Tasdiqlangan media</div>
              <div className="text-2xl font-black font-mono tabular-nums text-sky-400">{approvedMediaCount}</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25">
              <div className="text-[11px] text-emerald-200/70">Bajarilgan vazifalar</div>
              <div className="text-2xl font-black font-mono tabular-nums text-amber-400">
                {myTasks.filter(t => t.status === 'verified').length}
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-[#061811] border border-emerald-500/25">
              <div className="text-[11px] text-emerald-200/70">Ekologik daraxtlar</div>
              <div className="text-2xl font-black font-mono tabular-nums text-lime-400 flex items-center gap-1.5">
                <Trees className="w-5 h-5" />
                {user.activityStats?.treesPlanted || user.treesPlanted || 0}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white">Tasdiqlangan Yechimlar & Media Faoliyatlar</h3>
              <button
                type="button"
                onClick={() => setActiveTab('media')}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 text-xs font-bold cursor-pointer"
              >
                + Media yuklash
              </button>
            </div>

            {resolvedReports.length === 0 && myMedia.length === 0 ? (
              <div className="py-10 text-center text-xs text-emerald-200/60">
                Hozircha faoliyatlar tarixi bo‘sh. Muammolarni hal eting yoki ekologik media yuklang!
              </div>
            ) : (
              <div className="space-y-3">
                {resolvedReports.map(rep => (
                  <div key={rep.id} className="p-4 rounded-xl bg-[#04100B] border border-emerald-500/25 space-y-3">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-white">{rep.title}</span>
                      <span className="font-mono font-black text-amber-300">
                        +{rep.ambassadorRewardedCoins ?? 200} ECO
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {renderMediaThumb(rep.beforeImageUrl || rep.imageUrl, false, 'Avval', 'before')}
                      {renderMediaThumb(rep.afterImageUrl || rep.resolvedImageUrl, false, 'Keyin', 'after')}
                    </div>
                  </div>
                ))}

                {myMedia.map(m => (
                  <div
                    key={m.id}
                    className="p-3.5 rounded-xl bg-[#04100B] border border-emerald-500/20 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {m.mediaType === 'image' ? (
                        <img
                          src={resolveMediaUrl(m.mediaUrl)}
                          alt={m.description}
                          className="w-12 h-12 rounded-xl object-cover shrink-0 border border-emerald-500/25"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                          <FileVideo className="w-5 h-5 text-emerald-400" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{m.description}</div>
                        <div className="text-[11px] text-emerald-200/65">
                          {m.activityCategory} · {new Date(m.createdAt).toLocaleDateString('uz-UZ')}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                        m.status === 'APPROVED'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : m.status === 'REJECTED'
                          ? 'bg-rose-500/15 text-rose-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {m.status === 'APPROVED' ? `+${m.awardedCoins} ECO` : m.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TUMAN REYTINGI (Monthly vs Overall + TOP 10 + Always Highlighted Current User) */}
      {cabinetTab === 'reyting' && (
        <div className="p-5 rounded-2xl bg-[#061811] border border-emerald-500/25 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>{districtDetails?.district || user.district} · TOP-10 Eco-Elchilar Reytingi</span>
              </h3>
              <p className="text-[11px] text-emerald-200/70">
                Faqat maktab admini tasdiqlagan hal etilgan muammolar, media va vazifalar hisoblanadi ·{' '}
                Oy oxirigacha <b className="font-mono text-amber-300">{districtDetails?.daysRemainingInMonth ?? '—'} kun</b>
              </p>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-black/45 border border-emerald-500/25 shrink-0">
              <button
                type="button"
                onClick={() => setRankingMode('monthly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  rankingMode === 'monthly'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-emerald-200/75 hover:text-white'
                }`}
              >
                Oylik reyting
              </button>
              <button
                type="button"
                onClick={() => setRankingMode('overall')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  rankingMode === 'overall'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-emerald-200/75 hover:text-white'
                }`}
              >
                Umumiy reyting
              </button>
            </div>
          </div>

          {/* Highlighted Current Eco-Elchi Card (ALWAYS shown, even if outside Top 10) */}
          {myAmbRating ? (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/20 via-teal-500/15 to-black/30 border border-emerald-400/50 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-xs font-black text-white flex flex-wrap items-center gap-2">
                  <span>Sizning o‘rningiz ({rankingMode === 'monthly' ? 'Oylik' : 'Umumiy'}):</span>
                  <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500 text-slate-950 font-mono font-black">
                    #{myAmbRating.rank} / {totalAmb}
                  </span>
                  {myAmbRating.rank > 10 && (
                    <span className="text-[11px] text-amber-300 font-semibold">· TOP-10 dan tashqarida, lekin kuzatuvda</span>
                  )}
                </div>
                <div className="text-[11px] text-emerald-100/80">
                  {myAmbRating.resolvedProblemsCount ?? myAmbRating.resolvedReportsCount} hal etilgan ·{' '}
                  {myAmbRating.verifiedActivitiesCount} tasdiqlangan media · {myAmbRating.tasksCompletedCount} vazifa
                  {!myAmbRating.isTop3 && totalAmb >= 3
                    ? ` · TOP-3 gacha +${Math.max(1, top3Threshold - myAmbRating.realScore).toLocaleString()} ball`
                    : ''}
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-xl font-black text-emerald-300">{myAmbRating.realScore.toLocaleString()} ball</div>
                <div className="text-[11px] text-amber-300">{myAmbRating.ecoCoins.toLocaleString()} ECO</div>
              </div>
            </div>
          ) : null}

          {/* Gold / Silver / Bronze TOP-3 Podium */}
          {top10Ambassadors.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {top10Ambassadors.slice(0, 3).map((amb, idx) => (
                <div
                  key={amb.id}
                  className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
                    idx === 0
                      ? 'bg-amber-500/15 border-amber-400/55'
                      : idx === 1
                      ? 'bg-slate-400/10 border-slate-400/40'
                      : 'bg-orange-500/15 border-orange-400/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-amber-300 inline-flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5" /> #{amb.rank}
                    </span>
                    <span className="font-mono tabular-nums font-black text-emerald-300">
                      {amb.realScore.toLocaleString()} ball
                    </span>
                  </div>
                  <div className="font-bold text-white truncate">
                    {amb.fullName} {amb.isMe ? '(Siz)' : ''}
                  </div>
                  <div className="text-[11px] text-emerald-100/70 truncate">{amb.schoolName}</div>
                </div>
              ))}
            </div>
          )}

          {/* TOP-10 Leaderboard Table/Cards */}
          {lbLoading && top10Ambassadors.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-200/70">Tuman reytingi yuklanmoqda...</div>
          ) : top10Ambassadors.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-200/60">Tumaningizda hozircha Eco-Elchilar topilmadi.</div>
          ) : (
            <div className="divide-y divide-emerald-500/15">
              {top10Ambassadors.map(amb => (
                <div
                  key={amb.id}
                  className={`py-3 px-3 rounded-xl flex items-center justify-between gap-3 text-xs ${
                    amb.isMe ? 'bg-emerald-500/15 border border-emerald-400/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`w-8 font-mono tabular-nums font-black ${
                        amb.isTop3 ? 'text-amber-400' : 'text-emerald-200/65'
                      }`}
                    >
                      #{amb.rank}
                    </span>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate flex items-center gap-1.5">
                        <span>{amb.fullName}</span>
                        {amb.isMe && <span className="text-emerald-300 font-extrabold">(Siz)</span>}
                      </div>
                      <div className="text-[11px] text-emerald-200/65 truncate">
                        {amb.schoolName} · {amb.resolvedProblemsCount ?? amb.resolvedReportsCount} hal · {amb.verifiedActivitiesCount} media
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-black text-emerald-300">{amb.realScore.toLocaleString()} ball</div>
                    <div className="text-[11px] text-amber-300/90">{amb.ecoCoins.toLocaleString()} ECO</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {districtDetails && districtDetails.monthlyAwards.length > 0 && (
            <div className="pt-3 border-t border-emerald-500/20 text-xs space-y-1.5">
              <div className="font-bold text-emerald-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                <span>So‘nggi oy g‘oliblari ({districtDetails.monthlyAwards[0].periodLabel}):</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] font-mono text-amber-300">
                {districtDetails.monthlyAwards[0].topAmbassadors.map(ta => (
                  <span key={ta.id} className="font-semibold">
                    #{ta.rank} {ta.fullName} (+{ta.bonusCoins} ECO{ta.promoCode ? ` · ${ta.promoCode}` : ''})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: YUTUQLAR */}
      {cabinetTab === 'yutuqlar' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {achievements.map(ach => (
            <div
              key={ach.id}
              className={`p-5 rounded-2xl border space-y-3 ${
                ach.unlocked
                  ? 'bg-gradient-to-br from-emerald-500/20 to-[#061811] border-emerald-400/50'
                  : 'bg-[#061811] border-emerald-500/20 opacity-80'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    ach.unlocked ? 'bg-emerald-500 text-slate-950' : 'bg-black/40 text-emerald-200/50'
                  }`}
                >
                  <Award className="w-5 h-5" />
                </div>
                <span
                  className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono ${
                    ach.unlocked
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      : 'bg-white/5 text-emerald-200/60'
                  }`}
                >
                  {ach.unlocked ? 'Ochilgan ✓' : ach.progress}
                </span>
              </div>
              <div>
                <h4 className="text-sm font-black text-white">{ach.title}</h4>
                <p className="text-xs text-emerald-100/75 mt-1">{ach.desc}</p>
              </div>
              <div className="pt-2 border-t border-emerald-500/15 flex items-center justify-between text-[11px] font-mono">
                <span className="text-emerald-200/60">Mukofot:</span>
                <span className="font-bold text-amber-300">{ach.reward}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zoom Lightbox for Side-by-Side BEFORE / AFTER inspection */}
      {lightboxMedia && (
        <div
          onClick={() => setLightboxMedia(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="max-w-3xl w-full bg-[#061811] border border-emerald-500/35 rounded-2xl p-3 space-y-2.5"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-emerald-200">{lightboxMedia.caption}</span>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {lightboxMedia.type === 'video' ? (
              <video
                src={lightboxMedia.url}
                controls
                autoPlay
                className="w-full max-h-[78vh] rounded-xl object-contain bg-black"
              />
            ) : (
              <img
                src={lightboxMedia.url}
                alt={lightboxMedia.caption}
                className="w-full max-h-[78vh] rounded-xl object-contain bg-black"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
