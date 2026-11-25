import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BadgeCheck,
  BarChart3,
  Calendar,
  Camera,
  CheckCircle2,
  Clock,
  Coins,
  Crown,
  Leaf,
  Loader2,
  ShieldAlert,
  Sparkles,
  Star,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';
import { calculateLevelProgress } from '../../utils/level';
import { resolveMediaUrl } from '../../utils/api';
import { DailyMission } from '../../types/eco';
import realisticAvatarImg from '../../assets/images/profile_avatar_realistic_1795605008121.jpg';
import heroForestBackdropImg from '../../assets/images/profile_hero_forest_1795605007665.jpg';
import leafEmblemImg from '../../assets/images/profile_leaf_emblem_1795605008107.jpg';
import kabinetEarthSproutImg from '../../assets/images/kabinet_earth_sprout_1795606728116.jpg';

export const StudentDashboardView: React.FC = () => {
  const {
    user,
    schools,
    studentsLeaderboard,
    reports,
    mediaSubmissions,
    transactions,
    registrationApplications,
    dailyMissions,
    dailyMissionSubmissions,
    dailyMissionCompletions,
    missionCompletions,
    adminIntent,
    clearAdminIntent,
    setActiveTab,
    openRoleRequestModal,
    openOnboardingModal,
    updateUserProfile,
    uploadMediaFile,
    submitDailyMission,
    fetchChatPermissions,
    subscribeChatEvents,
    showNotification,
  } = useEco();

  const [detailTab, setDetailTab] = useState<'none' | 'reports' | 'media' | 'coins' | 'chat'>('none');
  const [pendingChatRequests, setPendingChatRequests] = useState(0);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);

  // Modals
  const [missionsModalOpen, setMissionsModalOpen] = useState(false);
  const [achievementsModalOpen, setAchievementsModalOpen] = useState(false);
  const [selectedMission, setSelectedMission] = useState<DailyMission | null>(null);
  const [proofPhotoUrl, setProofPhotoUrl] = useState('');
  const [proofComment, setProofComment] = useState('');
  const [uploadingProof, setUploadingProof] = useState(false);
  const [submittingProof, setSubmittingProof] = useState(false);
  const proofInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (adminIntent?.openDailyMissions) {
      setMissionsModalOpen(true);
      clearAdminIntent();
    }
  }, [adminIntent, clearAdminIntent]);

  useEffect(() => {
    let active = true;
    const refreshPerms = () => {
      fetchChatPermissions().then((res) => {
        if (!active || !res.success) return;
        const count = res.permissions.filter(
          (p) => p.status === 'pending' && String(p.targetUid) === String(user.uid)
        ).length;
        setPendingChatRequests(count);
      });
    };
    refreshPerms();
    const unsub = subscribeChatEvents((evt) => {
      if (evt.type === 'chat:permission_updated' || evt.type === 'chat:permission_update') {
        refreshPerms();
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [fetchChatPermissions, subscribeChatEvents, user.uid]);

  const isFullyOnboarded = useMemo(() => {
    const cleanPhone = String(user.phoneNumber || '').replace(/\D/g, '');
    const cleanSchool = String(user.schoolName || '').trim();
    return Boolean(
      user.isOnboarded &&
        String(user.fullName || '').trim().length >= 2 &&
        cleanPhone.length >= 9 &&
        cleanSchool &&
        cleanSchool !== 'Maktab kiritilmagan'
    );
  }, [user.isOnboarded, user.fullName, user.phoneNumber, user.schoolName]);

  const totalXp = useMemo(
    () => Number(user.ecoXP || (user.totalCoinsEarned || user.ecoCoins || 0) * 4),
    [user.ecoXP, user.totalCoinsEarned, user.ecoCoins]
  );
  const levelInfo = useMemo(() => calculateLevelProgress(totalXp), [totalXp]);

  const mySchool = useMemo(
    () => schools.find((s) => s.id === user.schoolId || s.name === user.schoolName),
    [schools, user.schoolId, user.schoolName]
  );

  const myStudentRank = useMemo(() => {
    const sorted = [...studentsLeaderboard].sort(
      (a, b) => (b.totalCoinsEarned || b.ecoCoins || 0) - (a.totalCoinsEarned || a.ecoCoins || 0)
    );
    const idx = sorted.findIndex((s) => s.uid === user.uid);
    return idx >= 0 ? idx + 1 : mySchool?.ratingRank || 1;
  }, [studentsLeaderboard, user.uid, mySchool?.ratingRank]);

  const myReports = useMemo(
    () => reports.filter((r) => r.reporterUid === user.uid || r.reporterName === user.fullName),
    [reports, user.uid, user.fullName]
  );

  const myMedia = useMemo(
    () => mediaSubmissions.filter((m) => m.userId === user.uid),
    [mediaSubmissions, user.uid]
  );

  const myApps = useMemo(
    () => registrationApplications.filter((a) => a.userId === user.uid),
    [registrationApplications, user.uid]
  );

  const myDailySubmissions = useMemo(
    () => dailyMissionSubmissions.filter((s) => s.userId === user.uid),
    [dailyMissionSubmissions, user.uid]
  );

  const remainingDailyMissions = useMemo(
    () =>
      dailyMissions.filter((m) => {
        if (m.status !== 'active') return false;
        if (dailyMissionCompletions.includes(m.id)) return false;
        const hasPending = myDailySubmissions.some((s) => s.missionId === m.id && s.status === 'pending');
        return !hasPending;
      }),
    [dailyMissions, dailyMissionCompletions, myDailySubmissions]
  );

  const pendingDailyCount = useMemo(
    () => myDailySubmissions.filter((s) => s.status === 'pending').length,
    [myDailySubmissions]
  );

  const approvedMediaCount = useMemo(
    () => myMedia.filter((m) => m.status === 'APPROVED').length,
    [myMedia]
  );

  const completedTasksCount =
    dailyMissionCompletions.length + missionCompletions.length + approvedMediaCount + myReports.filter((r) => r.status === 'resolved' || r.status === 'verified').length;

  const solvedTestsCount = missionCompletions.length;

  const activityPercentage = useMemo(() => {
    const score = Math.min(
      100,
      Math.max(
        isFullyOnboarded ? 15 : 5,
        completedTasksCount * 12 + (user.streakDays || 1) * 4 + myReports.length * 6
      )
    );
    return score;
  }, [isFullyOnboarded, completedTasksCount, user.streakDays, myReports.length]);

  const avatarCandidate = useMemo(() => {
    const raw = user.avatarUrl || user.profileImage || '';
    if (!raw || raw.includes('dicebear.com')) return '';
    return resolveMediaUrl(raw);
  }, [user.avatarUrl, user.profileImage]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showNotification('Faqat rasm faylini tanlang', 'warning');
      return;
    }
    setUploadingAvatar(true);
    try {
      const uploaded = await uploadMediaFile(file, file.name);
      if (!uploaded.success || !uploaded.url) {
        showNotification(uploaded.error || 'Rasm yuklanmadi', 'warning');
        return;
      }
      setAvatarFailed(false);
      await updateUserProfile({ avatarUrl: uploaded.url, profileImage: uploaded.url });
      showNotification('Profil rasmi yangilandi!', 'success');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleProofFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showNotification('Iltimos, missiya bajarilganini tasdiqlovchi rasm tanlang', 'warning');
      return;
    }
    setUploadingProof(true);
    try {
      const uploaded = await uploadMediaFile(file, file.name);
      if (!uploaded.success || !uploaded.url) {
        showNotification(uploaded.error || 'Rasm yuklab bo‘lmadi', 'warning');
        return;
      }
      setProofPhotoUrl(uploaded.url);
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSubmitDailyProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMission) return;
    if (!isFullyOnboarded) {
      showNotification("Avval to'liq ro'yxatdan o'ting!", 'warning');
      setMissionsModalOpen(false);
      openOnboardingModal();
      return;
    }
    if (!proofPhotoUrl) {
      showNotification('Missiyani bajarganingizni rasmga olib yuklang!', 'warning');
      return;
    }
    setSubmittingProof(true);
    try {
      const res = await submitDailyMission(selectedMission.id, {
        photoUrl: proofPhotoUrl,
        comment: proofComment.trim() || undefined,
      });
      if (res.code === 'REGISTRATION_REQUIRED') {
        setMissionsModalOpen(false);
        openOnboardingModal();
        return;
      }
      if (res.success) {
        setSelectedMission(null);
        setProofPhotoUrl('');
        setProofComment('');
      }
    } finally {
      setSubmittingProof(false);
    }
  };

  const openDetails = (tab: 'reports' | 'media' | 'coins' | 'chat') => {
    setDetailTab(tab);
    window.setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleDisplay = useMemo(() => {
    if (user.telegramUsername) {
      return user.telegramUsername.startsWith('@') ? user.telegramUsername : `@${user.telegramUsername}`;
    }
    const slug = String(user.fullName || 'ecohero')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 14);
    return `@${slug || 'ecohero'}`;
  }, [user.telegramUsername, user.fullName]);

  return (
    <div className="max-w-3xl mx-auto space-y-4 pb-8">
      {/* Unregistered Reminder Banner */}
      {!isFullyOnboarded && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-400/35 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-amber-200 font-semibold">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Bugungi missiyalar va coinlarni olish uchun ro‘yxatdan o‘tishni to‘liq yakunlang.
            </span>
          </div>
          <button
            type="button"
            onClick={() => openOnboardingModal()}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer transition-colors"
          >
            Ro‘yxatdan o‘tish
          </button>
        </div>
      )}

      {/* 1. HERO PROFILE CARD */}
      <div className="relative rounded-[26px] border border-emerald-400/25 bg-[#062315] overflow-hidden shadow-[0_16px_40px_rgba(0,0,0,0.45)] p-5">
        <img
          src={heroForestBackdropImg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none select-none"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-[#041a0f]/95 via-[#072918]/85 to-[#0b3a22]/75 pointer-events-none"
        />
        <img
          src={kabinetEarthSproutImg}
          alt=""
          aria-hidden="true"
          className="absolute -right-4 top-2 w-28 h-28 object-cover rounded-full opacity-55 mix-blend-screen pointer-events-none select-none"
        />

        <div className="relative z-10 flex items-center gap-4">
          {/* Circular Glowing Avatar + Camera Button */}
          <div className="relative shrink-0">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full p-[3px] bg-gradient-to-br from-emerald-300 via-emerald-500 to-teal-400 shadow-[0_0_24px_rgba(16,185,129,0.5)]">
              <div className="w-full h-full rounded-full overflow-hidden bg-[#062315]">
                <img
                  src={!avatarFailed && avatarCandidate ? avatarCandidate : realisticAvatarImg}
                  alt={user.fullName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarFailed(true)}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              title="Profil rasmini almashtirish"
              className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full bg-slate-950/90 border border-emerald-400/50 text-white flex items-center justify-center shadow-lg hover:bg-emerald-600 transition-colors cursor-pointer"
            >
              {uploadingAvatar ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
              ) : (
                <Camera className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>

          {/* Name, Handle, Level & XP */}
          <div className="flex-1 min-w-0 space-y-2">
            <div>
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight truncate">
                  {user.fullName || 'EcoHero O‘quvchi'}
                </h2>
                <BadgeCheck className="w-4.5 h-4.5 text-emerald-400 shrink-0" />
              </div>
              <p className="text-xs text-emerald-200/75 font-medium truncate">
                {handleDisplay} · {user.schoolName || 'Maktab kiritilmagan'}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-0.5">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#093821]/90 border border-emerald-400/35 text-xs font-extrabold text-white shadow-inner">
                <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>Lv. {levelInfo.level}</span>
              </span>
              <span className="text-[11px] font-bold font-mono tabular-nums text-emerald-100/85">
                {levelInfo.xpIntoLevel.toLocaleString()} / {levelInfo.xpRequiredForNextLevel.toLocaleString()} XP
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-[#03150c]/90 border border-emerald-500/25 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-green-300 shadow-[0_0_12px_rgba(52,211,153,0.7)] transition-all duration-500"
                style={{ width: `${levelInfo.progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. 3-COLUMN QUICK STATS ROW */}
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
        <div className="p-3.5 rounded-2xl bg-[#072617]/95 border border-emerald-400/20 flex items-center gap-2.5 shadow-md">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 via-amber-500 to-yellow-600 flex items-center justify-center shadow-[0_0_16px_rgba(245,158,11,0.35)] shrink-0">
            <Coins className="w-5 h-5 text-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-black font-mono tabular-nums text-white leading-tight truncate">
              {(user.ecoCoins || 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-200/70 font-medium">EcoCoin</div>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#072617]/95 border border-emerald-400/20 flex items-center gap-2.5 shadow-md">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 to-orange-500 flex items-center justify-center shadow-[0_0_16px_rgba(251,191,36,0.3)] shrink-0">
            <Star className="w-5 h-5 text-slate-950 fill-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-black font-mono tabular-nums text-white leading-tight truncate">
              {levelInfo.totalXp.toLocaleString()}
            </div>
            <div className="text-[11px] text-emerald-200/70 font-medium">XP</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setActiveTab('rating')}
          className="p-3.5 rounded-2xl bg-[#072617]/95 border border-emerald-400/20 hover:border-emerald-400/45 flex items-center gap-2.5 shadow-md text-left transition-colors cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-300 via-amber-500 to-amber-700 flex items-center justify-center shadow-[0_0_16px_rgba(245,158,11,0.3)] shrink-0">
            <Trophy className="w-5 h-5 text-slate-950" />
          </div>
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-black font-mono tabular-nums text-white leading-tight truncate">
              #{myStudentRank}
            </div>
            <div className="text-[11px] text-emerald-200/70 font-medium">Reyting</div>
          </div>
        </button>
      </div>

      {/* 3. BUGUNGI MISSIYALAR BANNER CARD */}
      <div className="relative rounded-[22px] border border-emerald-400/30 bg-gradient-to-r from-[#0a3520] via-[#0e4429] to-[#082919] overflow-hidden p-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
        <img
          src={heroForestBackdropImg}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-20 pointer-events-none select-none"
        />
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-br from-emerald-300 to-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.45)] shrink-0 overflow-hidden">
              <img
                src={leafEmblemImg}
                alt="Bugungi missiyalar"
                className="w-full h-full object-cover rounded-full"
              />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-white tracking-tight truncate">
                Bugungi missiyalar
              </h3>
              <p className="text-xs text-emerald-100/80 truncate">
                {dailyMissions.length === 0
                  ? 'Yangi missiyalar tez orada e’lon qilinadi'
                  : remainingDailyMissions.length > 0
                  ? `${remainingDailyMissions.length} ta vazifa sizni kutmoqda!${
                      pendingDailyCount > 0 ? ` (${pendingDailyCount} tekshiruvda)` : ''
                    }`
                  : pendingDailyCount > 0
                  ? `${pendingDailyCount} ta topshirig‘ingiz Sardor tekshiruvida`
                  : `Barcha ${dailyMissions.length} ta vazifa bajarildi!`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMissionsModalOpen(true)}
            className="px-4 py-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-green-500 hover:from-emerald-300 hover:to-green-400 text-slate-950 font-extrabold text-xs sm:text-sm inline-flex items-center gap-1.5 shadow-[0_6px_20px_rgba(16,185,129,0.45)] shrink-0 cursor-pointer transition-all"
          >
            <span>Boshlash</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 4. 2x2 ACTION GRID */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('media')}
          className="p-4 rounded-[22px] bg-[#072617]/95 border border-emerald-400/20 hover:border-emerald-400/45 text-left space-y-2.5 shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-sky-500/15 border border-sky-400/35 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Camera className="w-5 h-5 text-sky-400" />
            </div>
            <div className="text-sm font-extrabold text-white leading-snug">
              Foto / Video Yuklash
            </div>
          </div>
          <p className="text-[11px] sm:text-xs text-emerald-100/70 leading-relaxed">
            Ekologik faoliyat va dalil haqida xabar bering
          </p>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('report')}
          className="p-4 rounded-[22px] bg-[#072617]/95 border border-emerald-400/20 hover:border-emerald-400/45 text-left space-y-2.5 shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-rose-500/15 border border-rose-400/35 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
            </div>
            <div className="text-sm font-extrabold text-white leading-snug">
              Muammo Habar Qilish
            </div>
          </div>
          <p className="text-[11px] sm:text-xs text-emerald-100/70 leading-relaxed">
            Atrof-muhit muammosini bildiring
          </p>
        </button>

        <button
          type="button"
          onClick={() => openRoleRequestModal('ambassador')}
          className="p-4 rounded-[22px] bg-[#072617]/95 border border-emerald-400/20 hover:border-emerald-400/45 text-left space-y-2.5 shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-400/35 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-sm font-extrabold text-white leading-snug">
              Eco Elchilikka Ariza Berish
            </div>
          </div>
          <p className="text-[11px] sm:text-xs text-emerald-100/70 leading-relaxed">
            Maktab elchisi bo‘lish uchun ariza bering
          </p>
        </button>

        <button
          type="button"
          onClick={() => setAchievementsModalOpen(true)}
          className="p-4 rounded-[22px] bg-[#072617]/95 border border-emerald-400/20 hover:border-emerald-400/45 text-left space-y-2.5 shadow-md transition-all cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-amber-500/15 border border-amber-400/35 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Award className="w-5 h-5 text-amber-400" />
            </div>
            <div className="text-sm font-extrabold text-white leading-snug">
              Mening Yutuqlarim
            </div>
          </div>
          <p className="text-[11px] sm:text-xs text-emerald-100/70 leading-relaxed">
            O‘z yutuqlaringiz va mukofotlarni ko‘ring
          </p>
        </button>
      </div>

      {/* 5. MENING NATIJALARIM CARD */}
      <div className="p-4 sm:p-5 rounded-[24px] bg-[#072617]/95 border border-emerald-400/20 space-y-4 shadow-md">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-extrabold text-white tracking-tight">Mening Natijalarim</h3>
          </div>
          <button
            type="button"
            onClick={() => openDetails(detailTab === 'none' ? 'reports' : 'none' as any)}
            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 cursor-pointer"
          >
            <span>{detailTab === 'none' ? 'Batafsil' : 'Yopish'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-3 rounded-2xl bg-[#041b10]/90 border border-emerald-500/15 text-center space-y-1">
            <div className="w-7 h-7 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-emerald-100/75 font-medium leading-tight">
              Bajarilgan Topshiriqlar
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-white">
              {completedTasksCount}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#041b10]/90 border border-emerald-500/15 text-center space-y-1">
            <div className="w-7 h-7 mx-auto rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-emerald-100/75 font-medium leading-tight">
              Yechilgan Testlar
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-white">
              {solvedTestsCount}
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#041b10]/90 border border-emerald-500/15 text-center space-y-1">
            <div className="w-7 h-7 mx-auto rounded-full bg-teal-500/20 text-teal-300 flex items-center justify-center">
              <Leaf className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-emerald-100/75 font-medium leading-tight">
              Ekologik Faoliyat
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-white">
              {activityPercentage}%
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-[#041b10]/90 border border-emerald-500/15 text-center space-y-1">
            <div className="w-7 h-7 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="text-[11px] text-emerald-100/75 font-medium leading-tight">
              Ketma-ket Kirishlar
            </div>
            <div className="text-xl font-black font-mono tabular-nums text-white">
              {user.streakDays || 1} kun
            </div>
          </div>
        </div>
      </div>

      {/* 6. BOTTOM REALISTIC EARTH SPROUT BANNER */}
      <div className="relative rounded-[24px] border border-emerald-400/25 bg-gradient-to-r from-[#072617] via-[#0a3420] to-[#072315] overflow-hidden p-3.5 sm:p-4 shadow-lg">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-20 h-16 sm:w-24 sm:h-20 rounded-2xl overflow-hidden border border-emerald-400/30 shrink-0 shadow-md">
              <img
                src={kabinetEarthSproutImg}
                alt="Tabiatni birgalikda asraymiz"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="min-w-0 space-y-1">
              <h4 className="text-sm sm:text-base font-extrabold text-white leading-snug">
                Tabiatni birgalikda asraymiz!
              </h4>
              <p className="text-[11px] sm:text-xs text-emerald-100/75 leading-relaxed">
                Har bir kichik harakat katta o‘zgarish keltiradi
              </p>
            </div>
          </div>

          <div className="w-12 h-12 rounded-full p-0.5 bg-gradient-to-br from-emerald-400 to-green-600 shadow-[0_0_16px_rgba(16,185,129,0.4)] shrink-0 overflow-hidden hidden sm:block">
            <img src={leafEmblemImg} alt="" className="w-full h-full object-cover rounded-full" />
          </div>
        </div>
      </div>

      {/* Quick Link Strip to Full Logs & Chat */}
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        {[
          { id: 'reports', label: `Hisobotlarim (${myReports.length})` },
          { id: 'media', label: `Eko-Medialar (${myMedia.length})` },
          { id: 'coins', label: `Tanga tarixi (${transactions.length})` },
          {
            id: 'chat',
            label: pendingChatRequests > 0 ? `Suhbatlar (${pendingChatRequests} yangi)` : 'Suhbatlar',
          },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openDetails(item.id as any)}
            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              detailTab === item.id
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold'
                : 'bg-[#072617]/90 border-emerald-400/20 text-emerald-100/80 hover:border-emerald-400/45'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* EXPANDED DETAILS SECTION (Reports / Media / Coins / Chat) */}
      {detailTab !== 'none' && (
        <div ref={detailsRef} className="pt-2 space-y-4">
          {detailTab === 'reports' && (
            <div className="p-5 rounded-3xl bg-[#072617]/95 border border-emerald-400/20 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white">Yuborgan ekologik muammolaringiz</h3>
                <button
                  onClick={() => setActiveTab('report')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer"
                >
                  + Yangi hisobot
                </button>
              </div>
              {myReports.length === 0 ? (
                <p className="text-xs text-emerald-100/65 py-6 text-center">Hozircha hisobot yubormagansiz.</p>
              ) : (
                <div className="divide-y divide-emerald-500/15">
                  {myReports.map((rep) => (
                    <div key={rep.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-bold text-white truncate">{rep.title}</div>
                        <div className="text-[11px] text-emerald-100/60">
                          {new Date(rep.createdAt).toLocaleDateString()} · {rep.status}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-emerald-400 shrink-0">
                        +{rep.rewardCoins} ECO
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {detailTab === 'media' && (
            <div className="p-5 rounded-3xl bg-[#072617]/95 border border-emerald-400/20 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white">Yuklangan foto va video faoliyatlar</h3>
                <button
                  onClick={() => setActiveTab('media')}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer"
                >
                  + Media yuklash
                </button>
              </div>
              {myMedia.length === 0 ? (
                <p className="text-xs text-emerald-100/65 py-6 text-center">
                  Hali foto yoki video faoliyat yuklamadingiz.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {myMedia.map((m) => (
                    <div key={m.id} className="rounded-2xl border border-emerald-400/20 overflow-hidden bg-[#041b10]">
                      <div className="aspect-video bg-slate-900">
                        {m.mediaType === 'video' ? (
                          <video src={resolveMediaUrl(m.mediaUrl)} controls className="w-full h-full object-cover" />
                        ) : (
                          <img
                            src={resolveMediaUrl(m.mediaUrl)}
                            alt={m.description}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="p-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between font-bold">
                          <span className="text-emerald-200/70">{m.activityCategory}</span>
                          <span className={m.status === 'APPROVED' ? 'text-emerald-400' : m.status === 'REJECTED' ? 'text-rose-400' : 'text-amber-400'}>
                            {m.status}
                          </span>
                        </div>
                        <p className="text-white line-clamp-2">{m.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {detailTab === 'coins' && (
            <div className="p-5 rounded-3xl bg-[#072617]/95 border border-emerald-400/20 space-y-4">
              <h3 className="text-sm font-extrabold text-white">EcoCoin Tranzaksiya Tarixi</h3>
              {transactions.length === 0 ? (
                <p className="text-xs text-emerald-100/65 py-6 text-center">Tranzaksiyalar hali mavjud emas.</p>
              ) : (
                <div className="divide-y divide-emerald-500/15">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-white truncate">{tx.reason}</div>
                        <div className="text-[11px] text-emerald-100/60">
                          {new Date(tx.createdAt).toLocaleDateString()} · {tx.status || 'approved'}
                        </div>
                      </div>
                      <span
                        className={`font-mono tabular-nums font-extrabold shrink-0 ${
                          tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} ECO
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {detailTab === 'chat' && (
            <EcoTelegramChatPanel
              allowedScopes={['student_dm']}
              allowStudentDiscovery={true}
              title="O‘quvchilararo Ruxsatli Suhbat"
            />
          )}
        </div>
      )}

      {/* MODAL 1: BUGUNGI MISSIYALAR */}
      {missionsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => {
            setMissionsModalOpen(false);
            setSelectedMission(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#062315] border border-emerald-400/30 p-5 sm:p-6 space-y-5 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full p-0.5 bg-gradient-to-br from-emerald-400 to-green-600 overflow-hidden shrink-0">
                  <img src={leafEmblemImg} alt="" className="w-full h-full object-cover rounded-full" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold tracking-tight">Bugungi Missiyalar</h3>
                  <p className="text-xs text-emerald-100/70">
                    Vazifani bajaring va rasmga olib Maktab Sardoriga yuboring
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMissionsModalOpen(false);
                  setSelectedMission(null);
                }}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-emerald-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!isFullyOnboarded && (
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-400/40 space-y-2.5">
                <div className="text-xs font-bold text-amber-300">
                  Ro‘yxatdan o‘tish talab qilinadi!
                </div>
                <p className="text-xs text-amber-100/85 leading-relaxed">
                  Bugungi missiyalarni topshirish va EcoCoin olish uchun avval ism, telefon raqam va maktabingizni to‘liq kiriting.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMissionsModalOpen(false);
                    openOnboardingModal();
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-500 text-slate-950 text-xs font-extrabold cursor-pointer"
                >
                  Ro‘yxatdan o‘tishni yakunlash
                </button>
              </div>
            )}

            {selectedMission ? (
              <form onSubmit={handleSubmitDailyProof} className="space-y-4">
                <div className="p-4 rounded-2xl bg-[#041b10] border border-emerald-400/25 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-white">{selectedMission.title}</span>
                    <span className="text-xs font-mono font-bold text-amber-400 shrink-0">
                      +{selectedMission.rewardCoins} ECO
                    </span>
                  </div>
                  <p className="text-xs text-emerald-100/75 leading-relaxed">{selectedMission.description}</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-emerald-100">
                    1. Bajarganingizni tasdiqlovchi rasm yuklang (majburiy):
                  </label>
                  <div
                    onClick={() => proofInputRef.current?.click()}
                    className="border-2 border-dashed border-emerald-400/35 hover:border-emerald-400 rounded-2xl p-4 text-center cursor-pointer bg-[#041b10]/70 transition-colors"
                  >
                    {uploadingProof ? (
                      <div className="py-6 flex flex-col items-center gap-2 text-xs text-emerald-300">
                        <Loader2 className="w-6 h-6 animate-spin" />
                        <span>Rasm yuklanmoqda...</span>
                      </div>
                    ) : proofPhotoUrl ? (
                      <div className="space-y-2">
                        <img
                          src={resolveMediaUrl(proofPhotoUrl)}
                          alt="Missiya dalili"
                          className="max-h-56 mx-auto rounded-xl object-cover"
                        />
                        <div className="text-[11px] text-emerald-300 font-semibold">
                          Boshqa rasm tanlash uchun bosing
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 flex flex-col items-center gap-2 text-xs text-emerald-100/75">
                        <Upload className="w-7 h-7 text-emerald-400" />
                        <span className="font-bold text-white">Rasm tanlash yoki kameraga olish</span>
                        <span>JPG, PNG yoki WEBP</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={proofInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProofFileChange}
                    className="hidden"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-emerald-100">
                    2. Qisqa izoh (ixtiyoriy):
                  </label>
                  <textarea
                    value={proofComment}
                    onChange={(e) => setProofComment(e.target.value)}
                    rows={2}
                    placeholder="Masalan: Maktab hovlisidagi gullarni sug'orib chiqdik..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#041b10] border border-emerald-400/25 text-xs text-white placeholder-emerald-100/40 outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMission(null);
                      setProofPhotoUrl('');
                      setProofComment('');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-emerald-100 cursor-pointer"
                  >
                    Orqaga
                  </button>
                  <button
                    type="submit"
                    disabled={submittingProof || uploadingProof || !proofPhotoUrl || !isFullyOnboarded}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-green-500 text-slate-950 text-xs font-extrabold disabled:opacity-50 cursor-pointer"
                  >
                    {submittingProof ? 'Yuborilmoqda...' : 'Maktab Sardoriga Yuborish'}
                  </button>
                </div>
              </form>
            ) : dailyMissions.length === 0 ? (
              <div className="py-10 text-center space-y-2 text-xs text-emerald-100/70">
                <Sparkles className="w-8 h-8 text-emerald-400 mx-auto" />
                <p>Hozircha Super Admin tomonidan faol kunlik missiyalar qo‘shilmagan.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {dailyMissions.map((m) => {
                  const isDone = dailyMissionCompletions.includes(m.id);
                  const latestSub = myDailySubmissions.find((s) => s.missionId === m.id);
                  const isPending = latestSub?.status === 'pending';
                  const isRejected = latestSub?.status === 'rejected' && !isDone;
                  return (
                    <div
                      key={m.id}
                      className="p-4 rounded-2xl bg-[#041b10]/90 border border-emerald-400/20 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="text-sm font-extrabold text-white">{m.title}</div>
                          <p className="text-xs text-emerald-100/75 leading-relaxed">{m.description}</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 font-mono text-xs font-extrabold shrink-0">
                          +{m.rewardCoins} ECO
                        </span>
                      </div>

                      {isRejected && latestSub?.adminNote && (
                        <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-xl">
                          Rad etildi: {latestSub.adminNote}
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-1">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Tasdiqlangan · +{m.rewardCoins} EcoCoin olindi</span>
                          </span>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300">
                            <Clock className="w-4 h-4" />
                            <span>Maktab Sardori tekshiruvida...</span>
                          </span>
                        ) : (
                          <>
                            <span className="text-[11px] text-emerald-200/60">
                              {isRejected ? 'Qaytadan rasm yuborish mumkin' : 'Rasm dalili bilan topshiriladi'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (!isFullyOnboarded) {
                                  setMissionsModalOpen(false);
                                  openOnboardingModal();
                                  showNotification("Avval to'liq ro'yxatdan o'ting!", 'warning');
                                  return;
                                }
                                setSelectedMission(m);
                                setProofPhotoUrl('');
                                setProofComment('');
                              }}
                              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Rasm yuklab bajarish</span>
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 2: MENING YUTUQLARIM */}
      {achievementsModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setAchievementsModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#062315] border border-emerald-400/30 p-5 sm:p-6 space-y-4 text-white shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Award className="w-6 h-6 text-amber-400" />
                <h3 className="text-lg font-extrabold">Mening Yutuqlarim</h3>
              </div>
              <button
                type="button"
                onClick={() => setAchievementsModalOpen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-emerald-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3.5 rounded-2xl bg-[#041b10] border border-emerald-400/20 space-y-1">
                <div className="text-emerald-200/70">Unvon</div>
                <div className="font-extrabold text-emerald-300">{user.badge || 'Eko-Qahramon'}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#041b10] border border-emerald-400/20 space-y-1">
                <div className="text-emerald-200/70">Jami yig‘ilgan</div>
                <div className="font-mono font-extrabold text-amber-300">
                  {(user.totalCoinsEarned || user.ecoCoins || 0).toLocaleString()} ECO
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-emerald-200">Tasdiqlangan kunlik missiyalar</div>
              {myDailySubmissions.filter((s) => s.status === 'approved').length === 0 ? (
                <p className="text-xs text-emerald-100/60 p-4 rounded-2xl bg-[#041b10] border border-emerald-400/15">
                  Hali tasdiqlangan kunlik missiyalar yo‘q. Bugungi missiyalardan birini bajaring!
                </p>
              ) : (
                <div className="space-y-2">
                  {myDailySubmissions
                    .filter((s) => s.status === 'approved')
                    .map((s) => (
                      <div
                        key={s.id}
                        className="p-3 rounded-2xl bg-[#041b10] border border-emerald-400/20 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{s.missionTitle}</div>
                          <div className="text-[11px] text-emerald-100/60">
                            Tasdiqladi: {s.reviewedBy || 'Maktab Sardori'}
                          </div>
                        </div>
                        <span className="font-mono font-extrabold text-emerald-400 shrink-0">
                          +{s.awardedCoins} ECO
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {myApps.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-emerald-200">Lavozim arizalari holati</div>
                <div className="space-y-2">
                  {myApps.slice(0, 3).map((app) => (
                    <div
                      key={app.id}
                      className="p-3 rounded-2xl bg-[#041b10] border border-emerald-400/20 flex items-center justify-between text-xs"
                    >
                      <span className="font-semibold text-white">{app.requestedRoleName || app.requestedRole}</span>
                      <span
                        className={
                          app.status === 'approved'
                            ? 'text-emerald-400 font-bold'
                            : app.status === 'rejected'
                            ? 'text-rose-400 font-bold'
                            : 'text-amber-300 font-bold'
                        }
                      >
                        {app.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
