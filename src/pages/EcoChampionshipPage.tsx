import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy,
  Award,
  Medal,
  Search,
  Building2,
  Globe,
  MapPin,
  Clock,
  Zap,
  Lock,
  ShieldCheck,
  Users,
  Trees,
  CheckCircle2,
  RefreshCw,
  Crown,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import {
  CompetitionLevel,
  ChampionshipLiveResponse,
  ChampionshipSchoolEntry,
  ChampionshipStudentEntry,
} from '../types/eco';
import { resolveMediaUrl } from '../utils/api';
import { useLiveCountdown } from '../utils/countdown';
import homeChampionshipCupImg from '../assets/images/home_championship_cup_1795602397115.jpg';

const getInitials = (name: string) =>
  String(name || 'E')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'E';

export const EcoChampionshipPage: React.FC = () => {
  const {
    user,
    schools,
    liveMetrics,
    monthlyAwards,
    championshipMeta,
    liveSyncVersion,
    fetchChampionshipLive,
    triggerHaptic,
    setActiveTab,
  } = useEco();

  const [activeLevel, setActiveLevel] = useState<CompetitionLevel>('district');
  const [activeEntity, setActiveEntity] = useState<'schools' | 'students'>('schools');
  const [searchQuery, setSearchQuery] = useState('');

  const registeredRegion = (user.region || 'Toshkent shahri').trim();
  const registeredDistrict = (user.district || '').trim();
  const registeredSchoolName =
    user.schoolName && user.schoolName !== 'Maktab kiritilmagan'
      ? user.schoolName
      : "Maktab biriktirilmagan";

  const [liveData, setLiveData] = useState<ChampionshipLiveResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [showArchiveModal, setShowArchiveModal] = useState<boolean>(false);

  const loadChampionship = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchChampionshipLive({
        level: activeLevel,
        entity: activeEntity,
        region: activeLevel === 'national' ? undefined : registeredRegion,
        district: activeLevel === 'district' ? registeredDistrict || undefined : undefined,
      });
      if (data) {
        setLiveData(data);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeLevel, activeEntity, registeredRegion, registeredDistrict, fetchChampionshipLive]);

  useEffect(() => {
    loadChampionship(false);
  }, [loadChampionship]);

  useEffect(() => {
    if (liveSyncVersion > 0) {
      loadChampionship(true);
    }
  }, [liveSyncVersion, loadChampionship]);

  const eligibility = liveData?.eligibility || championshipMeta;
  const stageSchedule = eligibility?.stageSchedule || {
    district: { cycleLabel: '1 oyda 1 marta', periodKey: 'Oylik', daysRemaining: 0, hoursRemaining: 0, minutesRemaining: 0, secondsRemaining: 0 },
    regional: { cycleLabel: '3 oyda 1 marta', periodKey: 'Choraklik', daysRemaining: 0, hoursRemaining: 0, minutesRemaining: 0, secondsRemaining: 0 },
    national: { cycleLabel: '3 oyda 1 marta', periodKey: 'Choraklik', daysRemaining: 0, hoursRemaining: 0, minutesRemaining: 0, secondsRemaining: 0 },
  };
  const currentStageSchedule = stageSchedule[activeLevel];
  const stageCountdown = useLiveCountdown({
    endsAt: currentStageSchedule.endsAt,
    serverNow: liveData?.serverNow || currentStageSchedule.serverNow,
    fallbackDays: currentStageSchedule.daysRemaining,
    fallbackHours: currentStageSchedule.hoursRemaining,
    fallbackMinutes: currentStageSchedule.minutesRemaining,
    fallbackSeconds: currentStageSchedule.secondsRemaining,
    onExpire: () => loadChampionship(true),
  });
  const isRegionalLocked = activeLevel === 'regional' && Boolean(liveData?.locked || (eligibility && !eligibility.regionalUnlocked));

  const filteredSchools: ChampionshipSchoolEntry[] = useMemo(() => {
    const list = liveData?.schools || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.district.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q)
    );
  }, [liveData, searchQuery]);

  const filteredStudents: ChampionshipStudentEntry[] = useMemo(() => {
    const list = liveData?.students || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.schoolName.toLowerCase().includes(q) ||
        s.district.toLowerCase().includes(q)
    );
  }, [liveData, searchQuery]);

  const activeItems = activeEntity === 'schools' ? filteredSchools : filteredStudents;
  const top3 = activeItems.slice(0, 3);
  const restItems = activeItems.slice(3, 25);

  const myOwnSchoolEntry = useMemo(() => {
    if (activeEntity !== 'schools') return null;
    return filteredSchools.find((s) => s.isMine || (user.schoolId && s.id === user.schoolId)) || null;
  }, [activeEntity, filteredSchools, user.schoolId]);

  const myOwnStudentEntry = useMemo(() => {
    if (activeEntity !== 'students') return null;
    return filteredStudents.find((s) => s.isMe || s.uid === user.uid) || null;
  }, [activeEntity, filteredStudents, user.uid]);

  const totalSchoolsDisplay = liveData?.totals?.schoolsCount ?? schools.length;
  const totalStudentsDisplay = liveData?.totals?.studentsCount ?? liveMetrics.totalUsers;
  const recentWinners = liveData?.recentWinners?.length ? liveData.recentWinners : monthlyAwards;

  const podiumOrder = top3.length === 3 ? [top3[1], top3[0], top3[2]] : top3;

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 space-y-5 sm:space-y-7 pb-24">
      {/* 1. Compact Vivid Emerald Arena Header */}
      <section className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-[#06241B] via-[#041510] to-[#020A08] border border-emerald-500/30 p-4 sm:p-6 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 max-w-2xl">
            <img
              src={homeChampionshipCupImg}
              alt="EcoHero Chempionat"
              className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-amber-400/40 shadow-lg shrink-0"
            />
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <Trophy className="w-3.5 h-3.5 shrink-0" />
                <span>EcoHero Milliy Chempionati · Jonli</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight text-balance">
                3 Bosqichli Ekologik Liga
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-snug">
                Tuman <span className="text-emerald-300 font-semibold">oylik</span>, Viloyat va Respublika{' '}
                <span className="text-amber-300 font-semibold">3 oylik</span> bosqich. Viloyatga faqat TOP-3 g&apos;oliblar chiqadi.
              </p>
            </div>
          </div>

          {/* Live Stage Countdown + Real Totals */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 shrink-0">
            <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-black/40 border border-emerald-500/20 text-center">
              <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Tugashiga</span>
              </div>
              <div className="text-sm sm:text-base font-extrabold font-mono tabular-nums text-emerald-400 mt-0.5 whitespace-nowrap">
                {stageCountdown.days}k {String(stageCountdown.hours).padStart(2, '0')}s{' '}
                {String(stageCountdown.minutes).padStart(2, '0')}d{' '}
                <span className="text-emerald-300/90">{String(stageCountdown.seconds).padStart(2, '0')}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">{currentStageSchedule.cycleLabel}</div>
            </div>
            <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/20 text-center">
              <div className="text-[11px] text-slate-400">Maktablar</div>
              <div className="text-sm sm:text-lg font-extrabold font-mono tabular-nums text-white mt-0.5">
                {totalSchoolsDisplay.toLocaleString()}
              </div>
              {typeof liveData?.totals?.allPlatformSchools === 'number' &&
                liveData.totals.allPlatformSchools > totalSchoolsDisplay && (
                  <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                    Jami: {liveData.totals.allPlatformSchools.toLocaleString()}
                  </div>
                )}
            </div>
            <div className="p-3 rounded-2xl bg-black/40 border border-emerald-500/20 text-center">
              <div className="text-[11px] text-slate-400">Qatnashchilar</div>
              <div className="text-sm sm:text-lg font-extrabold font-mono tabular-nums text-amber-400 mt-0.5">
                {totalStudentsDisplay.toLocaleString()}
              </div>
              {typeof liveData?.totals?.allPlatformUsers === 'number' &&
                liveData.totals.allPlatformUsers > totalStudentsDisplay && (
                  <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                    Jami: {liveData.totals.allPlatformUsers.toLocaleString()}
                  </div>
                )}
            </div>
          </div>
        </div>
      </section>

      {/* 2. Interactive 3-Stage Selector with Schedule Cadence */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          {
            id: 'district' as CompetitionLevel,
            label: 'Tuman bosqichi',
            cycle: '1 oyda 1 marta',
            icon: MapPin,
            locked: false,
          },
          {
            id: 'regional' as CompetitionLevel,
            label: 'Viloyat bosqichi',
            cycle: '3 oyda 1 marta',
            icon: Building2,
            locked: Boolean(eligibility && !eligibility.regionalUnlocked),
          },
          {
            id: 'national' as CompetitionLevel,
            label: 'Respublika',
            cycle: '3 oyda 1 marta',
            icon: Globe,
            locked: false,
          },
        ].map((stage) => {
          const Icon = stage.icon;
          const isActive = activeLevel === stage.id;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setActiveLevel(stage.id);
              }}
              className={`min-h-[60px] p-2.5 sm:p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                isActive
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 text-slate-700 dark:text-slate-200 hover:border-emerald-400/50'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-slate-950' : 'text-emerald-500'}`} />
                {stage.locked && (
                  <Lock className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-slate-950' : 'text-amber-500'}`} />
                )}
              </div>
              <div>
                <div className="text-[11px] sm:text-xs font-extrabold leading-tight truncate">{stage.label}</div>
                <div className={`text-[10px] font-semibold mt-0.5 truncate ${isActive ? 'text-slate-900/80' : 'text-slate-400'}`}>
                  {stage.cycle}
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* 3. Main Content: Filters + Live Podium & Leaderboard */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Registered School Territory & Rules Panel */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-emerald-500/15">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Sizning maktabingiz hududi</h2>
              <button
                type="button"
                onClick={() => loadChampionship(false)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#040D0A] text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 hover:bg-emerald-500/15 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Yangilash</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                <Building2 className="w-4 h-4 shrink-0 text-emerald-500" />
                <span className="truncate">{registeredSchoolName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {registeredRegion}
                  {registeredDistrict ? ` · ${registeredDistrict}` : ''}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Siz avtomatik ravishda ro&apos;yxatdan o&apos;tgan maktabingiz va tumaningiz nomidan qatnashasiz.
              </p>
            </div>

            {/* Stage Eligibility & Schedule Info */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-900 dark:text-emerald-300">
                <span>Bosqich tartibi</span>
                <span className="font-mono text-[11px]">{currentStageSchedule.cycleLabel}</span>
              </div>
              <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                {activeLevel === 'district'
                  ? "Har oyda 1 marta o'tkaziladi. Tuman bo'yicha 1, 2 va 3-o'rin olgan maktab va o'quvchilar Viloyat bosqichiga chiqadi."
                  : activeLevel === 'regional'
                  ? "3 oyda 1 marta o'tkaziladi. Faqat tuman bosqichida TOP-3 o'rinni egallagan g'oliblar uchun ochiq."
                  : "3 oyda 1 marta o'tkaziladi. O'zbekiston bo'ylab barcha hududlarning umumiy jonli natijalari."}
              </p>
              {eligibility && (
                <div className="pt-2 border-t border-slate-200/70 dark:border-emerald-500/15 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 dark:text-slate-400">Tumandagi o'rningiz:</span>
                  <span className="font-mono font-bold text-emerald-500 tabular-nums">
                    {eligibility.callerDistrictRank ? `#${eligibility.callerDistrictRank}` : 'Hali aniqlanmagan'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Real Past Winners Archive Callout */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-amber-500/15 to-emerald-500/10 border border-amber-500/30 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">G'oliblar arxivi</h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  {recentWinners.length > 0
                    ? `${recentWinners.length} ta rasmiy taqdirlash qayd etilgan`
                    : "Hozircha arxiv yozuvlari yo'q"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowArchiveModal(true)}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
            >
              Arxivni ko'rish
            </button>
          </div>
        </aside>

        {/* Right Live Rankings Board */}
        <div className="lg:col-span-8 space-y-4">
          {/* Sub-Tabs + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
              {[
                { id: 'schools' as const, label: 'Maktablar' },
                { id: 'students' as const, label: "O'quvchilar" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveEntity(tab.id);
                  }}
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeEntity === tab.id
                      ? 'bg-emerald-500 text-slate-950 shadow-sm'
                      : 'text-slate-500 dark:text-slate-300 hover:text-emerald-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ism yoki maktab qidirish..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>

          {/* Regional Top-3 Qualification Gate */}
          {isRegionalLocked ? (
            <div className="p-6 sm:p-10 rounded-3xl bg-white dark:bg-[#061812] border border-amber-500/35 text-center space-y-4 shadow-md">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <div className="space-y-2 max-w-md mx-auto">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                  Viloyat bosqichi yopiq
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {liveData?.lockReason ||
                    "Viloyat bosqichi faqat Tuman bosqichida 1, 2 yoki 3-o'rin olgan g'olib o'quvchilar va TOP-3 maktablar uchun ochiladi."}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveLevel('district')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
                >
                  Tuman bosqichida qatnashish
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('missions')}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-white font-bold text-xs cursor-pointer"
                >
                  Missiya bajarib ball yig'ish
                </button>
              </div>
            </div>
          ) : loading && activeItems.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-36 rounded-2xl bg-slate-100 dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/15 animate-pulse"
                />
              ))}
            </div>
          ) : activeItems.length === 0 ? (
            <div className="p-10 rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center space-y-2">
              <Trophy className="w-10 h-10 text-emerald-500/40 mx-auto" />
              <h4 className="text-base font-extrabold text-slate-900 dark:text-white">
                Ushbu hududda hali natijalar yo'q
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                O'quvchilar ro'yxatdan o'tishi yoki missiya/muammo yuborishi bilan jonli reyting shu yerda paydo bo'ladi.
              </p>
            </div>
          ) : (
            <>
              {/* TOP 3 VIVID PODIUM */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3.5 items-end">
                {podiumOrder.map((entry) => {
                  const isSchool = activeEntity === 'schools';
                  const schoolItem = isSchool ? (entry as ChampionshipSchoolEntry) : null;
                  const studentItem = !isSchool ? (entry as ChampionshipStudentEntry) : null;
                  const rank = entry.rank;
                  const isFirst = rank === 1;
                  const isMine = isSchool ? schoolItem?.isMine : studentItem?.isMe;
                  const title = isSchool ? schoolItem!.name : studentItem!.name;
                  const sub = isSchool
                    ? `${schoolItem!.district} · ${schoolItem!.studentsCount} o'quvchi`
                    : `${studentItem!.schoolName}${studentItem!.grade ? ` · ${studentItem!.grade}` : ''}`;
                  const pts = entry.points;

                  const podiumTheme =
                    rank === 1
                      ? 'from-amber-500/25 via-emerald-950/80 to-[#051811] border-amber-400/60 shadow-lg shadow-amber-500/10'
                      : rank === 2
                      ? 'from-slate-400/20 via-[#081F17] to-[#04120D] border-slate-300/40'
                      : 'from-orange-500/20 via-[#081F17] to-[#04120D] border-orange-400/40';

                  const medalColor =
                    rank === 1
                      ? 'bg-amber-400 text-slate-950'
                      : rank === 2
                      ? 'bg-slate-200 text-slate-950'
                      : 'bg-orange-400 text-slate-950';

                  return (
                    <motion.div
                      key={isSchool ? schoolItem!.id : studentItem!.uid}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`rounded-2xl sm:rounded-3xl bg-gradient-to-b ${podiumTheme} border p-2.5 sm:p-4 text-center flex flex-col items-center justify-between gap-2 ${
                        isFirst ? 'min-h-[178px] sm:min-h-[205px]' : 'min-h-[154px] sm:min-h-[178px]'
                      } ${isMine ? 'ring-2 ring-emerald-400' : ''}`}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl ${medalColor} font-black text-xs flex items-center justify-center shadow-sm`}>
                          {rank === 1 ? <Crown className="w-4 h-4" /> : `#${rank}`}
                        </div>

                        {isSchool ? (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                            <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                          </div>
                        ) : studentItem?.avatarUrl ? (
                          <img
                            src={resolveMediaUrl(studentItem.avatarUrl)}
                            referrerPolicy="no-referrer"
                            alt={title}
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl object-cover border border-emerald-400/40"
                          />
                        ) : (
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-xs sm:text-sm font-extrabold text-emerald-300">
                            {getInitials(title)}
                          </div>
                        )}
                      </div>

                      <div className="w-full space-y-0.5 min-w-0">
                        <div className="text-[11px] sm:text-sm font-extrabold text-white line-clamp-2 leading-tight">
                          {title}
                        </div>
                        <div className="text-[10px] text-slate-300/80 truncate">{sub}</div>
                      </div>

                      <div className="w-full pt-1.5 border-t border-white/10">
                        <div className="text-xs sm:text-base font-black font-mono tabular-nums text-emerald-300">
                          {pts.toLocaleString()}
                        </div>
                        <div className="text-[9px] text-amber-300 font-semibold">Viloyatga yo'llanma</div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* STUDENT-RANKING STYLE LIVE LIST */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1">
                  <span>Jonli jadval · {activeItems.length} ta ishtirokchi</span>
                  <span>Ballar EcoCoin + faollikdan hisoblanadi</span>
                </div>

                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {(restItems.length > 0 ? restItems : activeItems).map((entry) => {
                      const isSchool = activeEntity === 'schools';
                      const schoolItem = isSchool ? (entry as ChampionshipSchoolEntry) : null;
                      const studentItem = !isSchool ? (entry as ChampionshipStudentEntry) : null;
                      const isMine = isSchool ? schoolItem?.isMine : studentItem?.isMe;
                      const keyId = isSchool ? schoolItem!.id : studentItem!.uid;
                      const name = isSchool ? schoolItem!.name : studentItem!.name;
                      const subtitle = isSchool
                        ? `${schoolItem!.district} · ${schoolItem!.studentsCount} o'quvchi · ${schoolItem!.treesPlanted} daraxt`
                        : `${studentItem!.schoolName}${studentItem!.grade ? ` · ${studentItem!.grade}` : ''} · ${studentItem!.district}`;

                      return (
                        <motion.div
                          key={keyId}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className={`p-3 sm:p-3.5 rounded-2xl border flex items-center justify-between gap-3 transition-all ${
                            isMine
                              ? 'bg-emerald-500/15 border-emerald-400/60 shadow-sm'
                              : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400/40'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div
                              className={`w-9 h-9 rounded-xl font-black font-mono tabular-nums text-xs flex items-center justify-center shrink-0 ${
                                entry.rank <= 3
                                  ? 'bg-amber-500 text-slate-950'
                                  : isMine
                                  ? 'bg-emerald-500 text-slate-950'
                                  : 'bg-slate-100 dark:bg-[#040D0A] text-slate-600 dark:text-emerald-300 border border-slate-200 dark:border-emerald-500/20'
                              }`}
                            >
                              #{entry.rank}
                            </div>

                            {isSchool ? (
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 shrink-0">
                                <Building2 className="w-5 h-5" />
                              </div>
                            ) : studentItem?.avatarUrl ? (
                              <img
                                src={resolveMediaUrl(studentItem.avatarUrl)}
                                referrerPolicy="no-referrer"
                                alt={name}
                                className="w-10 h-10 rounded-xl object-cover border border-emerald-500/25 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-xs font-extrabold text-emerald-500 shrink-0">
                                {getInitials(name)}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                                  {name}
                                </span>
                                {isMine && (
                                  <span className="text-[10px] font-bold text-emerald-500 shrink-0">· Siz</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {subtitle}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-sm sm:text-base font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                              {entry.points.toLocaleString()}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {entry.rank <= 3 ? "Yo'llanma" : 'Ball'}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                {/* Pinned Own School / Own Rank Strip */}
                {((activeEntity === 'schools' && myOwnSchoolEntry && myOwnSchoolEntry.rank > 3) ||
                  (activeEntity === 'students' && myOwnStudentEntry && myOwnStudentEntry.rank > 3)) && (
                  <div className="p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-400/50 text-white flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-emerald-300">
                          {activeEntity === 'schools' ? "Sizning maktabingiz o'rni" : "Sizning joriy o'rningiz"}
                        </div>
                        <div className="text-sm font-extrabold truncate">
                          #{activeEntity === 'schools' ? myOwnSchoolEntry!.rank : myOwnStudentEntry!.rank} ·{' '}
                          {activeEntity === 'schools' ? myOwnSchoolEntry!.name : myOwnStudentEntry!.name}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div className="text-sm font-black text-amber-300">
                        {(activeEntity === 'schools' ? myOwnSchoolEntry!.points : myOwnStudentEntry!.points).toLocaleString()}
                      </div>
                      <div className="text-[10px] text-emerald-300">Ball</div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Real Archive Modal */}
      {showArchiveModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-emerald-500/15">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">G'oliblar arxivi</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-300 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {recentWinners.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Trophy className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Hali taqdirlash arxivi shakllanmagan</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Oy yakunida koordinatorlar tomonidan TOP-3 g'oliblar tasdiqlanganda bu yerda avtomatik ko'rinadi.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentWinners.map((rec: any) => (
                  <div
                    key={rec.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-500">{rec.periodLabel || rec.monthKey || 'Mavsum'}</span>
                      <span className="text-slate-400">{rec.district || rec.region}</span>
                    </div>
                    <div className="space-y-1">
                      {(rec.topSchools || rec.winners || []).map((w: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                            #{w.rank || i + 1} · {w.name || w.fullName}
                          </span>
                          <span className="font-mono font-bold text-amber-500 shrink-0">
                            +{(w.bonusCoins || 0).toLocaleString()} EC
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
