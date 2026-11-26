import React, { useEffect, useMemo, useState } from 'react';
import {
  School as SchoolIcon,
  Users,
  Award,
  AlertTriangle,
  ShieldAlert,
  ClipboardList,
  CheckCircle2,
  Plus,
  Trophy,
  UserPlus,
  Clock,
  XCircle,
  MessageSquare,
  Bot,
  Search,
  Send,
  Crown,
  Calendar,
  Eye,
  Lock,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { VoucherVerifierPanel } from '../shop/VoucherVerifierPanel';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';
import { StudentRatingManagerCard } from './StudentRatingManagerCard';
import { resolveMediaUrl } from '../../utils/api';
import {
  getProblemCategoryLabel,
  getReportStatusBadge,
  isReportFinalReviewStatus,
} from '../../utils/reportStatus';
import {
  DistrictLeaderboardDetailsResponse,
  RosterAmbassadorEntry,
  RosterStudentEntry,
} from '../../types/eco';
import cabinetCaptainBannerImg from '../../assets/images/cabinet_captain_banner_1795687841413.jpg';

export const SchoolCaptainDashboardView: React.FC = () => {
  const {
    user,
    schools,
    reports,
    ambassadors,
    studentsLeaderboard,
    ecoTasks,
    registrationApplications,
    dailyMissionSubmissions,
    adminIntent,
    clearAdminIntent,
    liveSyncVersion,
    createEcoTask,
    updateEcoTask,
    advanceReportWorkflow,
    schoolReportAction,
    appointAmbassadorHierarchical,
    reviewApplication,
    reviewDailyMissionSubmission,
    fetchDistrictLeaderboardDetails,
    fetchRosterDirectory,
    showNotification,
  } = useEco();

  const [districtDetails, setDistrictDetails] = useState<DistrictLeaderboardDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [rosterStudents, setRosterStudents] = useState<RosterStudentEntry[]>([]);
  const [rosterAmbassadors, setRosterAmbassadors] = useState<RosterAmbassadorEntry[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentSourceFilter, setStudentSourceFilter] = useState<'all' | 'bot'>('all');
  const [selectedChatChannelId, setSelectedChatChannelId] = useState<string>('');
  const [sectionTab, setSectionTab] = useState<'reviews' | 'team' | 'rating_voucher' | 'students_chat'>('reviews');
  const chatSectionRef = React.useRef<HTMLDivElement | null>(null);
  const dailyVerifyRef = React.useRef<HTMLDivElement | null>(null);
  const [highlightedDailySubId, setHighlightedDailySubId] = useState<string | null>(null);
  const [dailyRejectNoteMap, setDailyRejectNoteMap] = useState<Record<string, string>>({});
  const [reviewingDailyId, setReviewingDailyId] = useState<string | null>(null);
  const [dailyPreviewPhoto, setDailyPreviewPhoto] = useState<string | null>(null);

  // Direct Ambassador Onboarding Form state
  const [ambFullName, setAmbFullName] = useState('');
  const [ambPhone, setAmbPhone] = useState('');
  const [ambTelegram, setAmbTelegram] = useState('');
  const [ambEmail, setAmbEmail] = useState('');
  const [ambGrade, setAmbGrade] = useState('');
  const [addingAmb, setAddingAmb] = useState(false);

  // Application review note state
  const [appNotes, setAppNotes] = useState<Record<string, string>>({});

  // Task assignment & report review state
  const [selectedAmbUid, setSelectedAmbUid] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskInstructions, setTaskInstructions] = useState('');
  const [assignNoteMap, setAssignNoteMap] = useState<Record<string, string>>({});
  const [assignAmbMap, setAssignAmbMap] = useState<Record<string, string>>({});
  const [finalReviewNoteMap, setFinalReviewNoteMap] = useState<Record<string, string>>({});
  const [actingFinalReportId, setActingFinalReportId] = useState<string | null>(null);
  const [evidenceLightbox, setEvidenceLightbox] = useState<{
    url: string;
    type: 'image' | 'video';
    caption: string;
  } | null>(null);

  const mySchool = useMemo(
    () => schools.find(s => s.id === user.schoolId || s.name === user.schoolName),
    [schools, user.schoolId, user.schoolName]
  );

  const loadDistrictRatings = async () => {
    setDetailsLoading(true);
    const [res, rosterRes] = await Promise.all([
      fetchDistrictLeaderboardDetails({
        region: mySchool?.region || user.region,
        district: mySchool?.district || user.district,
      }),
      fetchRosterDirectory({ schoolId: mySchool?.id || user.schoolId }),
    ]);
    if (res) setDistrictDetails(res);
    if (rosterRes) {
      setRosterStudents(rosterRes.schoolStudents || []);
      setRosterAmbassadors(rosterRes.schoolAmbassadors || []);
    }
    setDetailsLoading(false);
  };

  useEffect(() => {
    loadDistrictRatings();
  }, [fetchDistrictLeaderboardDetails, fetchRosterDirectory, mySchool?.region, mySchool?.district, user.region, user.district, user.schoolId, liveSyncVersion]);

  const effectiveSchoolId = mySchool?.id || user.schoolId || '';

  const openBotChat = (ambUid?: string) => {
    const ch = ambUid ? `amb_dm:${effectiveSchoolId}:${ambUid}` : `amb_group:${effectiveSchoolId}`;
    setSelectedChatChannelId(ch);
    setSectionTab('students_chat');
    window.setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const filteredBotStudents = useMemo(() => {
    const base: RosterStudentEntry[] =
      rosterStudents.length > 0
        ? rosterStudents
        : studentsLeaderboard
            .filter(s => (user.schoolId && s.schoolId === user.schoolId) || s.schoolName === user.schoolName)
            .map(s => ({
              uid: s.uid,
              fullName: s.fullName,
              grade: s.grade,
              schoolId: s.schoolId,
              schoolName: s.schoolName,
              region: s.region,
              district: s.district,
              role: s.role,
              ecoCoins: s.ecoCoins || 0,
              reportsCount: s.activityStats?.reportsCount || 0,
              treesPlanted: s.activityStats?.treesPlanted || 0,
              badge: s.badge || 'Eko-Qahramon',
              phoneNumber: s.phoneNumber,
              telegramUsername: s.telegramUsername,
              telegramLinked: Boolean(s.telegramId || s.telegramUsername),
            }));
    const q = studentSearch.trim().toLowerCase();
    return base.filter(st => {
      if (studentSourceFilter === 'bot' && !st.telegramLinked) return false;
      if (!q) return true;
      return (
        st.fullName.toLowerCase().includes(q) ||
        (st.grade || '').toLowerCase().includes(q) ||
        (st.telegramUsername || '').toLowerCase().includes(q) ||
        (st.phoneNumber || '').toLowerCase().includes(q)
      );
    });
  }, [rosterStudents, studentsLeaderboard, user.schoolId, user.schoolName, studentSearch, studentSourceFilter]);

  const schoolStudents = useMemo(
    () =>
      studentsLeaderboard.filter(
        s => (user.schoolId && s.schoolId === user.schoolId) || s.schoolName === user.schoolName
      ),
    [studentsLeaderboard, user.schoolId, user.schoolName]
  );

  const schoolAmbassadors = useMemo(
    () =>
      ambassadors.filter(
        a => a.status !== 'revoked' && ((user.schoolId && a.schoolId === user.schoolId) || a.schoolName === user.schoolName)
      ),
    [ambassadors, user.schoolId, user.schoolName]
  );

  // Incoming Eco-Ambassador applications specifically targeting Captain's school
  const incomingAmbassadorApplications = useMemo(
    () =>
      registrationApplications.filter(a => {
        if (a.requestedRole !== 'ambassador') return false;
        if (!['pending', 'needs_info'].includes(a.status)) return false;
        if (user.role === 'super_admin') return true;
        if (user.schoolId && a.schoolId === user.schoolId) return true;
        if (user.schoolNumber && a.schoolNumber === user.schoolNumber && a.district === user.district) return true;
        return a.officialSchoolName === user.schoolName;
      }),
    [registrationApplications, user.role, user.schoolId, user.schoolNumber, user.district, user.schoolName]
  );

  const incomingApprovedReports = useMemo(
    () =>
      reports.filter(
        r =>
          ((user.schoolId && r.schoolId === user.schoolId) || r.schoolName === user.schoolName) &&
          r.status !== 'rejected' &&
          r.status !== 'REJECTED'
      ),
    [reports, user.schoolId, user.schoolName]
  );

  const finalReviewQueue = useMemo(
    () => incomingApprovedReports.filter(r => isReportFinalReviewStatus(r.status)),
    [incomingApprovedReports]
  );

  const generalReportsQueue = useMemo(
    () => incomingApprovedReports.filter(r => !isReportFinalReviewStatus(r.status)),
    [incomingApprovedReports]
  );

  const exactRegisteredStudentsCount =
    rosterStudents.length > 0
      ? rosterStudents.length
      : mySchool?.registeredStudentsCount ?? schoolStudents.length;

  const schoolTasks = useMemo(
    () => ecoTasks.filter(t => t.schoolId === (mySchool?.id || user.schoolId)),
    [ecoTasks, mySchool?.id, user.schoolId]
  );

  const scopedDailySubmissions = useMemo(() => {
    const isPrivileged = user.role === 'super_admin' || user.role === 'moderator';
    return dailyMissionSubmissions.filter(s => {
      if (isPrivileged) return true;
      const sameSchoolId = Boolean(user.schoolId && s.schoolId === user.schoolId);
      const sameSchoolName =
        Boolean(user.schoolName && s.schoolName) &&
        String(s.schoolName).trim().toLowerCase() === String(user.schoolName).trim().toLowerCase();
      return sameSchoolId || sameSchoolName;
    });
  }, [dailyMissionSubmissions, user.role, user.schoolId, user.schoolName]);

  const pendingDailySubmissions = useMemo(
    () => scopedDailySubmissions.filter(s => s.status === 'pending'),
    [scopedDailySubmissions]
  );

  useEffect(() => {
    if (adminIntent?.verifyDailySubId) {
      setSectionTab('reviews');
      setHighlightedDailySubId(adminIntent.verifyDailySubId);
      window.setTimeout(() => {
        dailyVerifyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
      clearAdminIntent();
    }
  }, [adminIntent, clearAdminIntent]);

  const handleReviewDailySub = async (subId: string, action: 'approve' | 'reject') => {
    setReviewingDailyId(subId);
    try {
      const note = dailyRejectNoteMap[subId]?.trim();
      await reviewDailyMissionSubmission(subId, action, note || undefined);
      if (highlightedDailySubId === subId) setHighlightedDailySubId(null);
    } finally {
      setReviewingDailyId(null);
    }
  };

  const mySchoolRating = districtDetails?.mySchoolRating || districtDetails?.schoolRatings.find(s => s.id === mySchool?.id);
  const top3ThresholdScore = districtDetails?.schoolRatings?.[2]?.realScore ?? 0;

  const handleDirectAddAmbassador = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ambFullName.trim()) {
      showNotification("Eko-Elchi ism-familiyasini kiriting", 'warning');
      return;
    }
    setAddingAmb(true);
    const res = await appointAmbassadorHierarchical({
      schoolId: mySchool?.id || user.schoolId,
      schoolName: mySchool?.name || user.schoolName,
      schoolNumber: mySchool?.number || user.schoolNumber,
      fullName: ambFullName.trim(),
      phoneNumber: ambPhone.trim() || undefined,
      telegramUsername: ambTelegram.trim() || undefined,
      email: ambEmail.trim() || undefined,
      grade: ambGrade.trim() || undefined,
    });
    setAddingAmb(false);
    if (res.success) {
      setAmbFullName('');
      setAmbPhone('');
      setAmbTelegram('');
      setAmbEmail('');
      setAmbGrade('');
      loadDistrictRatings();
    }
  };

  const handleReviewApp = async (appId: string, action: 'approve' | 'reject' | 'request_info') => {
    const note = appNotes[appId]?.trim();
    const res = await reviewApplication(appId, action, note);
    if (res.success) {
      loadDistrictRatings();
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmb = selectedAmbUid || schoolAmbassadors[0]?.id;
    if (!targetAmb || !taskTitle.trim()) {
      showNotification('Eko-Elchi va vazifa nomini kiriting', 'warning');
      return;
    }
    const res = await createEcoTask({
      schoolId: mySchool?.id || user.schoolId,
      assigneeUid: targetAmb,
      title: taskTitle.trim(),
      instructions: taskInstructions.trim() || 'Maktab ekologik rejasiga muvofiq xavfsiz bajaring.',
    });
    if (res.success) {
      setTaskTitle('');
      setTaskInstructions('');
    }
  };

  const pendingReviewsTotal = pendingDailySubmissions.length + finalReviewQueue.length;

  return (
    <div className="space-y-4">
      {/* Compact Duolingo Dark-Emerald Hero Header */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 text-white shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src={cabinetCaptainBannerImg}
            alt="Maktab Sardori Kabineti"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-emerald-400/40 shrink-0 shadow-md"
          />
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#00F5A0] uppercase tracking-wider truncate">
              Maktab Sardori Kabineti · {mySchool?.district || user.district}
            </div>
            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white truncate">
              {mySchool?.name || user.schoolName}
            </h2>
            <p className="text-xs text-emerald-100/70 truncate">
              {mySchool?.region || user.region} · Sardor: {user.fullName}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 shrink-0">
          <div className="px-3.5 py-2.5 rounded-2xl bg-[#040D0A]/80 border border-emerald-500/25">
            <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-[#00F5A0]">
              {(mySchoolRating?.realScore ?? mySchool?.totalCoins ?? 0).toLocaleString()}
            </div>
            <div className="text-[10px] font-semibold text-emerald-100/65">Maktab real bali</div>
          </div>
          <div className="px-3.5 py-2.5 rounded-2xl bg-[#040D0A]/80 border border-amber-500/30">
            <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-amber-400">
              #{mySchoolRating?.rank || mySchool?.ratingRank || 1}
              {districtDetails?.totalSchoolsInDistrict ? ` / ${districtDetails.totalSchoolsInDistrict}` : ''}
            </div>
            <div className="text-[10px] font-semibold text-emerald-100/65">Tuman reytingi</div>
          </div>
        </div>
      </div>

      {/* Compact KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/60">O‘quvchilar (Jonli)</div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
            {exactRegisteredStudentsCount} ta
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/60">Maktab Eko-Elchilari</div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-500">{schoolAmbassadors.length}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/60">Kelgan elchi arizalari</div>
          <div className="text-xl font-black font-mono tabular-nums text-amber-500">{incomingAmbassadorApplications.length}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] font-medium text-slate-500 dark:text-emerald-100/60">Oy oxirigacha qoldi</div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-400">
            {districtDetails?.daysRemainingInMonth ?? 15} kun
          </div>
        </div>
      </div>

      {/* Role-Specific Compact Top Sub-Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
        {[
          { id: 'reviews' as const, label: 'Tekshiruvlar', badge: pendingReviewsTotal },
          { id: 'team' as const, label: 'Jamoa & Vazifalar', badge: incomingAmbassadorApplications.length },
          { id: 'rating_voucher' as const, label: 'Reyting & Vaucher', badge: 0 },
          { id: 'students_chat' as const, label: 'O‘quvchilar & Suhbat', badge: 0 },
        ].map(tab => {
          const active = sectionTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionTab(tab.id)}
              className={`flex-1 min-w-[140px] min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                active
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 shadow-sm'
                  : 'text-slate-600 dark:text-emerald-100/75 hover:bg-slate-100 dark:hover:bg-[#040D0A]'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black font-mono tabular-nums ${
                    active ? 'bg-[#04110B] text-[#00F5A0]' : 'bg-amber-500 text-slate-950'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {sectionTab === 'reviews' && (
        <div className="space-y-4">
      {/* Bugungi Missiyalarni Tekshirish Queue */}
      <div
        ref={dailyVerifyRef}
        className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border space-y-4 ${
          pendingDailySubmissions.length > 0
            ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
            : 'border-slate-200 dark:border-emerald-500/20'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Bugungi Missiyalarni Tekshirish</span>
              {pendingDailySubmissions.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-black font-mono tabular-nums">
                  {pendingDailySubmissions.length} ta kutilmoqda
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-emerald-100/65">
              O‘quvchilar bugungi missiyani bajarib yuborgan rasmlarni tekshiring. Tasdiqlangach o‘quvchiga EcoCoin va chat xabari boradi.
            </p>
          </div>
        </div>

        {pendingDailySubmissions.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-emerald-100/60 border border-dashed border-slate-200 dark:border-emerald-500/20 rounded-2xl">
            Hozircha tekshirish kutilayotgan bugungi missiya rasmlari yo‘q.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {pendingDailySubmissions.map(sub => {
              const isHighlighted = highlightedDailySubId === sub.id;
              const isBusy = reviewingDailyId === sub.id;
              return (
                <div
                  key={sub.id}
                  className={`rounded-2xl border overflow-hidden flex flex-col justify-between bg-slate-50 dark:bg-[#040D0A] ${
                    isHighlighted
                      ? 'border-emerald-400 ring-2 ring-emerald-400/50'
                      : 'border-slate-200 dark:border-emerald-500/20'
                  }`}
                >
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {sub.userName} {sub.userGrade ? `(${sub.userGrade})` : ''}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 truncate">
                          {sub.schoolName} · {new Date(sub.createdAt).toLocaleString('uz-UZ')}
                        </div>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-500 font-mono tabular-nums text-xs font-extrabold shrink-0">
                        +{sub.awardedCoins} ECO
                      </span>
                    </div>

                    <div className="text-xs font-bold text-emerald-600 dark:text-[#00F5A0]">
                      🎯 {sub.missionTitle}
                    </div>

                    {sub.comment && (
                      <p className="text-xs text-slate-600 dark:text-emerald-100/80 bg-white dark:bg-[#061812] p-2.5 rounded-xl border border-slate-200/70 dark:border-emerald-500/20">
                        {sub.comment}
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => setDailyPreviewPhoto(resolveMediaUrl(sub.photoUrl))}
                      className="block w-full aspect-video rounded-xl overflow-hidden bg-slate-200 dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 cursor-zoom-in"
                    >
                      <img
                        src={resolveMediaUrl(sub.photoUrl)}
                        alt={sub.missionTitle}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </button>

                    <input
                      type="text"
                      value={dailyRejectNoteMap[sub.id] || ''}
                      onChange={e =>
                        setDailyRejectNoteMap(prev => ({ ...prev, [sub.id]: e.target.value }))
                      }
                      placeholder="Izoh yoki rad etish sababi (ixtiyoriy)..."
                      className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="p-3 pt-0 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleReviewDailySub(sub.id, 'approve')}
                      className="flex-1 min-h-[44px] py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 active:translate-y-[1px] inline-flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isBusy ? 'Saqlanmoqda...' : `Tasdiqlash (+${sub.awardedCoins} ECO)`}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleReviewDailySub(sub.id, 'reject')}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-500 text-xs font-bold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>Rad etish</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {dailyPreviewPhoto && (
        <div
          onClick={() => setDailyPreviewPhoto(null)}
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <img
            src={dailyPreviewPhoto}
            alt="Missiya rasmi"
            className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl border border-emerald-500/30"
          />
        </div>
      )}

        </div>
      )}

      {sectionTab === 'rating_voucher' && (
        <div className="space-y-4">
      {/* Real District School Rating & Month-End TOP-3 Tracker */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Tuman Maktablari Haqiqiy Reytingi · Oy Oxiri TOP-3</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-emerald-100/65">
              Ball = EcoCoin + hal etilgan muammolar (×150) + tasdiqlangan media (×100) + daraxtlar (×15). Oy oxirida tumandagi eng faol 3 ta maktab mukofotlanadi.
            </p>
          </div>
          {mySchoolRating && (
            <div className="text-xs font-semibold shrink-0">
              {mySchoolRating.isTop3 ? (
                <span className="text-emerald-500 font-bold">
                  Siz hozir TOP-3 sovrinli o‘rinda (#{mySchoolRating.rank})!
                </span>
              ) : (
                <span className="text-amber-500 font-mono tabular-nums">
                  TOP-3 gacha: +{Math.max(1, top3ThresholdScore - mySchoolRating.realScore)} ball
                </span>
              )}
            </div>
          )}
        </div>

        {detailsLoading && !districtDetails ? (
          <div className="py-8 text-center text-xs text-slate-500">Haqiqiy reyting hisoblanmoqda...</div>
        ) : !districtDetails || districtDetails.schoolRatings.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">Tumanda maktablar reytingi shakllanmoqda.</div>
        ) : (
          <div className="space-y-3.5">
            {/* Gold / Silver / Bronze TOP-3 Podium */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {districtDetails.schoolRatings.slice(0, 3).map((sr, idx) => (
                <div
                  key={sr.id}
                  className={`p-3 rounded-2xl border text-xs space-y-1 ${
                    idx === 0
                      ? 'bg-amber-500/10 border-amber-400/50'
                      : idx === 1
                      ? 'bg-slate-200/60 dark:bg-[#040D0A] border-slate-300 dark:border-emerald-500/20'
                      : 'bg-orange-500/10 border-orange-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-black text-amber-500 inline-flex items-center gap-1">
                      <Crown className="w-3.5 h-3.5" /> #{sr.rank}
                    </span>
                    <span className="font-mono tabular-nums font-black text-emerald-500">
                      {sr.realScore.toLocaleString()} ball
                    </span>
                  </div>
                  <div className="font-bold text-slate-900 dark:text-white truncate">{sr.name}</div>
                  <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 truncate">
                    {sr.captainName || sr.ambassadorName || 'Tayinlanmagan'}
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2.5">
              {districtDetails.schoolRatings.map(sr => {
                const isMine = sr.isMySchool || sr.id === mySchool?.id;
                return (
                  <div
                    key={sr.id}
                    className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                      isMine
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : sr.isTop3
                        ? 'bg-amber-500/5 border-amber-500/30'
                        : 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          <span className={`font-mono mr-1.5 ${sr.isTop3 ? 'text-amber-500' : 'text-slate-400'}`}>
                            #{sr.rank}
                          </span>
                          {sr.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {isMine ? 'Sizning maktabingiz' : `Elchi: ${sr.ambassadorName || 'Tayinlanmagan'}`}
                        </div>
                      </div>
                      <div className="font-mono tabular-nums font-black text-emerald-500 shrink-0">
                        {sr.realScore.toLocaleString()} ball
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 dark:border-emerald-500/20 text-[11px] font-mono tabular-nums">
                      <div>
                        <div className="text-slate-400 font-sans">EcoCoin</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">{sr.totalCoins.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-sans">Hal</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">{sr.resolvedReportsCount}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-sans">Media</div>
                        <div className="font-bold text-slate-800 dark:text-slate-200">{sr.approvedMediaCount}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-400 font-sans">Daraxt</div>
                        <div className="font-bold text-emerald-500">{sr.treesPlanted}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-emerald-500/20 text-slate-500 dark:text-emerald-100/60">
                  <tr>
                    <th className="py-2.5 pr-3">O‘rin</th>
                    <th className="py-2.5 px-3">Maktab</th>
                    <th className="py-2.5 px-3 text-right">EcoCoin</th>
                    <th className="py-2.5 px-3 text-right">Hal etilgan</th>
                    <th className="py-2.5 px-3 text-right">Media</th>
                    <th className="py-2.5 px-3 text-right">Daraxt</th>
                    <th className="py-2.5 pl-3 text-right">Real Ball</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                  {districtDetails.schoolRatings.map(sr => {
                    const isMine = sr.isMySchool || sr.id === mySchool?.id;
                    return (
                      <tr
                        key={sr.id}
                        className={isMine ? 'bg-emerald-500/10 font-semibold' : ''}
                      >
                        <td className="py-2.5 pr-3 font-mono tabular-nums font-bold">
                          <span className={sr.isTop3 ? 'text-amber-500' : 'text-slate-400'}>#{sr.rank}</span>
                        </td>
                        <td className="py-2.5 px-3 min-w-[180px]">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{sr.name}</span>
                            {isMine && <span className="text-[11px] text-emerald-400 font-bold">(Sizning maktabingiz)</span>}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {sr.isTop3 ? 'Oy oxiri TOP-3 zonasi' : `Eko-Elchi: ${sr.ambassadorName}`}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{sr.totalCoins.toLocaleString()}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{sr.resolvedReportsCount}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{sr.approvedMediaCount}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-500">{sr.treesPlanted}</td>
                        <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-black text-emerald-500">
                          {sr.realScore.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {districtDetails && (
          <div className="pt-3 border-t border-slate-100 dark:border-emerald-500/20 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-500" />
              Oy oxiri mukofoti sanasi: <b className="font-mono text-slate-700 dark:text-slate-300">{districtDetails.lastDayDateLabel || 'Oy oxirgi kuni'}</b>
            </span>
            {districtDetails.monthlyAwards.length > 0 && (
              <div className="flex flex-wrap gap-3 font-mono tabular-nums text-amber-500 font-bold">
                {districtDetails.monthlyAwards[0].topSchools.map(ts => (
                  <span key={ts.id}>
                    #{ts.rank} {ts.name} (+{ts.bonusCoins} ECO{ts.promoCode ? ` · ${ts.promoCode}` : ''})
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* School Student Rating Activation & Top-1 Monthly Award */}
      <StudentRatingManagerCard
        mode="school"
        schoolId={effectiveSchoolId}
        schoolName={mySchool?.name || user.schoolName}
        region={mySchool?.region || user.region}
        district={mySchool?.district || user.district}
      />

      {/* Voucher & Promo Code Verifier for School Admin */}
      <VoucherVerifierPanel />
        </div>
      )}

      {sectionTab === 'team' && (
        <div className="space-y-4">
      {/* Add Eco-Ambassador Directly + Review Incoming Applications for This School */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-500" />
              <span>Eko-Elchi Qo‘shish</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-emerald-100/65">
              Maktabingiz o‘quvchisi ma’lumotlarini kiriting va darhol Eko-Elchi sifatida biriktiring.
            </p>
          </div>
          <form onSubmit={handleDirectAddAmbassador} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">To‘liq ism-familiya *</label>
              <input
                type="text"
                required
                value={ambFullName}
                onChange={e => setAmbFullName(e.target.value)}
                placeholder="Masalan: Dilshod Raximov"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">Telefon raqam</label>
                <input
                  type="text"
                  value={ambPhone}
                  onChange={e => setAmbPhone(e.target.value)}
                  placeholder="+99890..."
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">Sinf</label>
                <input
                  type="text"
                  value={ambGrade}
                  onChange={e => setAmbGrade(e.target.value)}
                  placeholder="10-A"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">Telegram username</label>
                <input
                  type="text"
                  value={ambTelegram}
                  onChange={e => setAmbTelegram(e.target.value)}
                  placeholder="@username"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-emerald-100/70 mb-1">Email (ixtiyoriy)</label>
                <input
                  type="email"
                  value={ambEmail}
                  onChange={e => setAmbEmail(e.target.value)}
                  placeholder="email@mail.uz"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={addingAmb}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 disabled:opacity-50 text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 active:translate-y-[1px] cursor-pointer transition-all"
            >
              {addingAmb ? 'Biriktirilmoqda...' : 'Maktab Eko-Elchisi etib qo‘shish'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Eko-Elchi Bo‘lish Uchun Kelgan Arizalar</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/65">
                Maktabingizni ko‘rsatib Eko-Elchi bo‘lishga ariza yuborgan o‘quvchilarni tasdiqlang yoki rad eting.
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs font-bold text-amber-500">
              {incomingAmbassadorApplications.length} ta
            </span>
          </div>

          {incomingAmbassadorApplications.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 border-t border-slate-100 dark:border-emerald-500/15">
              Hozircha maktabingizga yangi Eko-Elchi arizalari kelib tushmagan.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-500/15">
              {incomingAmbassadorApplications.map(app => (
                <div key={app.id} className="py-3.5 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {app.fullName}
                        {app.telegramUsername ? (
                          <span className="text-xs font-mono text-sky-500 ml-2">{app.telegramUsername}</span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-emerald-100/60">
                        {app.officialSchoolName} · Aloqa: <span className="font-mono">{app.contactInfo}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold uppercase text-amber-500 shrink-0">
                      {app.status === 'needs_info' ? "Ma'lumot kutilmoqda" : 'Kutilmoqda'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-emerald-100/80 bg-slate-50 dark:bg-[#040D0A] p-2.5 rounded-xl border border-slate-200 dark:border-emerald-500/15">
                    {app.verificationDetails}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Izoh (ixtiyoriy)..."
                      value={appNotes[app.id] || ''}
                      onChange={e => setAppNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReviewApp(app.id, 'approve')}
                        className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-xs font-black border-b-[2px] border-emerald-700 flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Tasdiqlash
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewApp(app.id, 'request_info')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> So‘rash
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewApp(app.id, 'reject')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Rad etish
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Assign Task to Eco Ambassadors + Track Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-500" />
            <span>Eko-Elchiga yangi vazifa biriktirish</span>
          </h3>
          <form onSubmit={handleCreateTask} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">Maktab Eko-Elchisi</label>
              <select
                value={selectedAmbUid || schoolAmbassadors[0]?.id || ''}
                onChange={e => setSelectedAmbUid(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
              >
                {schoolAmbassadors.length === 0 ? (
                  <option value="">Tasdiqlangan Eko-Elchi yo‘q</option>
                ) : (
                  schoolAmbassadors.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">Vazifa nomi</label>
              <input
                type="text"
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                placeholder="Masalan: Maktab bog‘idagi ko‘chatlarni sug‘orish"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">Ko‘rsatmalar</label>
              <textarea
                rows={3}
                value={taskInstructions}
                onChange={e => setTaskInstructions(e.target.value)}
                placeholder="Bajarish tartibi va xavfsizlik talablari..."
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs resize-none outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="submit"
              disabled={schoolAmbassadors.length === 0}
              className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 disabled:opacity-40 text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 active:translate-y-[1px] cursor-pointer"
            >
              Vazifani yuborish
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-emerald-500" />
            <span>Maktab vazifalari nazorati ({schoolTasks.length})</span>
          </h3>
          {schoolTasks.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Hozircha vazifalar yaratilmagan.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-500/15">
              {schoolTasks.map(t => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white">{t.title}</div>
                    <div className="text-[11px] text-slate-500 dark:text-emerald-100/60">
                      Ijrochi: {t.assigneeName} · Holat: <b>{t.status}</b>
                      {t.completionNote ? ` · Hisobot: ${t.completionNote}` : ''}
                    </div>
                  </div>
                  {t.status === 'submitted' ? (
                    <button
                      onClick={() => updateEcoTask(t.id, { status: 'verified' })}
                      className="min-h-[38px] px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black shrink-0 cursor-pointer"
                    >
                      Tasdiqlash (+{t.rewardCoins} ECO)
                    </button>
                  ) : t.status === 'verified' ? (
                    <span className="text-emerald-500 font-bold flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-4 h-4" /> Bajarildi
                    </span>
                  ) : (
                    <span className="text-slate-400 shrink-0">{t.status}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
        </div>
      )}

      {sectionTab === 'reviews' && (
        <div className="space-y-4">
      <div
        className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border space-y-4 ${
          finalReviewQueue.length > 0
            ? 'border-violet-500/50 shadow-lg shadow-violet-500/10'
            : 'border-slate-200 dark:border-emerald-500/20'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-violet-500" />
              <span>Yakuniy Tekshiruvda (Avval / Keyin Solishtirish)</span>
              {finalReviewQueue.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-violet-600 text-white text-[11px] font-black font-mono tabular-nums">
                  {finalReviewQueue.length} ta kutilmoqda
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500 dark:text-emerald-100/65">
              O‘quvchining original (o‘zgarmas) Avval surati bilan Eco-Elchi yuklagan Keyingi natijani solishtiring. Tasdiqlanganda o‘quvchiga +100 ECO va Eco-Elchiga +200 ECO beriladi.
            </p>
          </div>
        </div>

        {finalReviewQueue.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500 dark:text-emerald-100/60 border border-dashed border-slate-200 dark:border-emerald-500/20 rounded-2xl">
            Hozircha yakuniy Avval/Keyin tekshiruvini kutayotgan hisobotlar yo‘q.
          </div>
        ) : (
          <div className="space-y-4">
            {finalReviewQueue.map(rep => {
              const beforeUrl = resolveMediaUrl(rep.beforeVideoUrl || rep.beforeImageUrl || rep.videoUrl || rep.imageUrl || '');
              const beforeIsVideo = Boolean(rep.beforeVideoUrl || (rep.videoUrl && !rep.beforeImageUrl && !rep.imageUrl));
              const afterUrl = resolveMediaUrl(rep.afterImageUrl || rep.resolvedImageUrl || rep.afterVideoUrl || '');
              const afterIsVideo = Boolean(rep.afterVideoUrl && !rep.afterImageUrl && !rep.resolvedImageUrl);
              const isBusy = actingFinalReportId === rep.id;

              return (
                <div
                  key={rep.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-violet-500/35 space-y-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-extrabold text-slate-900 dark:text-white text-sm">{rep.title}</span>
                        <span className="px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-400 font-bold text-[11px]">
                          {getProblemCategoryLabel(rep.category)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span>O‘quvchi: <b>{rep.reporterName}</b></span>
                        <span>Eco-Elchi: <b>{rep.assignedAmbassadorName || 'Biriktirilgan'}</b></span>
                        <span>Manzil: {rep.address || `${rep.region}, ${rep.district}`}</span>
                        {rep.lat && rep.lng ? <span className="font-mono">GPS: {rep.lat.toFixed(4)}, {rep.lng.toFixed(4)}</span> : null}
                        <span>Yuborilgan: {new Date(rep.submittedForFinalReviewAt || rep.updatedAt || rep.createdAt).toLocaleString('uz-UZ')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Side-by-side BEFORE (Immutable) vs AFTER */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        <span>1. AVVAL (O‘quvchi originali)</span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <Lock className="w-3 h-3" /> O‘zgarmas
                        </span>
                      </div>
                      {beforeUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setEvidenceLightbox({
                              url: beforeUrl,
                              type: beforeIsVideo ? 'video' : 'image',
                              caption: `${rep.title} — AVVAL (O'quvchi originali)`,
                            })
                          }
                          className="relative block w-full h-44 rounded-xl overflow-hidden border border-amber-500/40 bg-black cursor-zoom-in group"
                        >
                          {beforeIsVideo ? (
                            <video src={beforeUrl} muted playsInline className="w-full h-full object-cover" />
                          ) : (
                            <img src={beforeUrl} alt="Avval" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          )}
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-bold inline-flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Kattalashtirish
                          </span>
                        </button>
                      ) : (
                        <div className="h-44 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs text-slate-400">
                          Avvalgi media topilmadi
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <span>2. KEYIN (Eco-Elchi natijasi)</span>
                        {rep.reuploadRequestCount ? (
                          <span className="text-[10px] text-orange-400">Qayta yuklash #{rep.reuploadRequestCount}</span>
                        ) : null}
                      </div>
                      {afterUrl ? (
                        <button
                          type="button"
                          onClick={() =>
                            setEvidenceLightbox({
                              url: afterUrl,
                              type: afterIsVideo ? 'video' : 'image',
                              caption: `${rep.title} — KEYIN (Eco-Elchi natijasi)`,
                            })
                          }
                          className="relative block w-full h-44 rounded-xl overflow-hidden border border-emerald-500/45 bg-black cursor-zoom-in group"
                        >
                          {afterIsVideo ? (
                            <video src={afterUrl} muted playsInline className="w-full h-full object-cover" />
                          ) : (
                            <img src={afterUrl} alt="Keyin" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                          )}
                          <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[10px] font-bold inline-flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Kattalashtirish
                          </span>
                        </button>
                      ) : (
                        <div className="h-44 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs text-slate-400">
                          Keyingi media yuklanmagan
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
                      <span className="font-bold text-slate-500">Muammo tavsifi: </span>
                      <span className="text-slate-800 dark:text-slate-200">{rep.description}</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
                      <span className="font-bold text-emerald-500">Eco-Elchi izohi: </span>
                      <span className="text-slate-800 dark:text-slate-200">{rep.resolutionDescription || rep.ambassadorSolutions || '—'}</span>
                    </div>
                  </div>

                  {rep.aiAuthenticityCheck && (
                    <div className="text-[11px] font-semibold text-emerald-500">
                      AI Solishtiruv Xulosasi: {rep.aiAuthenticityCheck.verdictUz}
                    </div>
                  )}

                  <input
                    type="text"
                    value={finalReviewNoteMap[rep.id] || ''}
                    onChange={e => setFinalReviewNoteMap(prev => ({ ...prev, [rep.id]: e.target.value }))}
                    placeholder="Admin izohi (tasdiqlash, qayta yuklash sababi yoki rad etish izohi)..."
                    className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                  />

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setActingFinalReportId(rep.id);
                        try {
                          await schoolReportAction(rep.id, 'final_approve', {
                            note: finalReviewNoteMap[rep.id]?.trim() || "Avval/Keyin dalillari tasdiqlandi",
                          });
                        } finally {
                          setActingFinalReportId(null);
                        }
                      }}
                      className="flex-1 min-w-[170px] min-h-[44px] py-2 px-3 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 disabled:opacity-50 text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 active:translate-y-[1px] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Tasdiqlash (+100 / +200 ECO)</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setActingFinalReportId(rep.id);
                        try {
                          await schoolReportAction(rep.id, 'final_request_reupload', {
                            note: finalReviewNoteMap[rep.id]?.trim() || "Iltimos, aniqroq Keyingi holat rasmini qayta yuklang",
                          });
                        } finally {
                          setActingFinalReportId(null);
                        }
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500 hover:text-white text-orange-500 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Qayta rasm yuklashni so‘rash</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={async () => {
                        setActingFinalReportId(rep.id);
                        try {
                          await schoolReportAction(rep.id, 'final_reject', {
                            note: finalReviewNoteMap[rep.id]?.trim() || "Yakuniy tekshiruvda rad etildi",
                          });
                        } finally {
                          setActingFinalReportId(null);
                        }
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-500 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Rad etish</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Queue B: Incoming Reports & Ambassador Assignment */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
              Maktabga kelgan ekologik muammolar ({generalReportsQueue.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-emerald-100/65">
              Yangi murojaatlarni tekshiring: maktab Eco-Elchisiga biriktiring, o‘quvchi o‘zi hal qilgan bo‘lsa tasdiqlang yoki rad eting.
            </p>
          </div>
        </div>

        {generalReportsQueue.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500 border-t border-slate-100 dark:border-emerald-500/15">
            Hozircha maktabingizga kelgan ekologik muammolar yo‘q.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-emerald-500/15">
            {generalReportsQueue.map(rep => {
              const badge = getReportStatusBadge(rep.status);
              const thumbUrl = resolveMediaUrl(rep.beforeImageUrl || rep.imageUrl || '');
              return (
                <div key={rep.id} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    {thumbUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setEvidenceLightbox({
                            url: thumbUrl,
                            type: 'image',
                            caption: `${rep.title} — Avval (O'quvchi)`,
                          })
                        }
                        className="shrink-0 cursor-zoom-in"
                      >
                        <img
                          src={thumbUrl}
                          alt={rep.title}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                        />
                      </button>
                    )}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-bold text-slate-900 dark:text-white">{rep.title}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badge.badgeClass}`}>
                          {badge.label}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{getProblemCategoryLabel(rep.category)}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{rep.reporterName}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">{rep.description}</p>
                      <div className="text-[11px] text-slate-400 flex flex-wrap gap-2">
                        <span>{rep.address || `${rep.region}, ${rep.district}`}</span>
                        <span>· {new Date(rep.createdAt).toLocaleDateString('uz-UZ')}</span>
                      </div>
                      {rep.assignedAmbassadorName && (
                        <div className="text-[11px] font-semibold text-indigo-400">
                          Biriktirilgan Eko-Elchi: {rep.assignedAmbassadorName}
                        </div>
                      )}
                      {rep.aiAuthenticityCheck && (
                        <div className="text-[11px] font-semibold text-emerald-500">
                          AI Tekshiruvi: {rep.aiAuthenticityCheck.verdictUz}
                        </div>
                      )}
                      {rep.isHazardous && (
                        <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-semibold flex items-center gap-2">
                          <ShieldAlert className="w-4 h-4 shrink-0" />
                          <span>
                            XAVF OGOHLANTIRISHI: O‘quvchilar va Eko-Elchilarni jalb qilish TAQIQLANADI! ({rep.escalationTarget || 'Maktab ma’muriyati / mutaxassislar'})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {!['resolved', 'RESOLVED', 'ESCALATED', 'rejected', 'REJECTED'].includes(rep.status) && (
                    <div className="flex flex-col gap-2 shrink-0 lg:w-[360px]">
                      <input
                        type="text"
                        value={assignNoteMap[rep.id] || ''}
                        onChange={e => setAssignNoteMap(prev => ({ ...prev, [rep.id]: e.target.value }))}
                        placeholder="Ko‘rsatma yoki rad etish izohi..."
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            schoolReportAction(rep.id, 'confirm_student_resolved', {
                              note: assignNoteMap[rep.id] || "O'quvchi bajarganligi maktab admini tomonidan tasdiqlandi",
                            })
                          }
                          className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-xs font-black border-b-[2px] border-emerald-700 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>O‘quvchi bajargan</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            schoolReportAction(rep.id, 'reject', {
                              note: assignNoteMap[rep.id] || "Maktab administratori tomonidan rad etildi",
                            })
                          }
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500 hover:text-white text-rose-500 text-xs font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Rad etish</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            advanceReportWorkflow(rep.id, 'escalate', {
                              escalationTarget: rep.escalationTarget || "Maktab ma'muriyati / Mutaxassislar",
                              note: "Maktab ma'muriyati va vakolatli tashkilotga oshirildi",
                            })
                          }
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Eskalatsiya</span>
                        </button>
                      </div>

                      {!rep.isHazardous && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          {schoolAmbassadors.length > 0 && (
                            <select
                              value={assignAmbMap[rep.id] || schoolAmbassadors[0]?.id || ''}
                              onChange={e => setAssignAmbMap(prev => ({ ...prev, [rep.id]: e.target.value }))}
                              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                            >
                              {schoolAmbassadors.map(a => (
                                <option key={a.id} value={a.id}>
                                  {a.fullName}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              schoolReportAction(rep.id, 'assign_ambassador', {
                                assignedAmbassadorUid: assignAmbMap[rep.id] || schoolAmbassadors[0]?.id,
                                note: assignNoteMap[rep.id] || "O'quvchi bilan birga muammoni hal qilib keyingi rasmni yuklang",
                              })
                            }
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                          >
                            Eko-Elchiga yuborish
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {evidenceLightbox && (
        <div
          onClick={() => setEvidenceLightbox(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4 cursor-zoom-out"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="max-w-3xl w-full bg-[#061812] border border-emerald-500/30 rounded-2xl p-3 space-y-2"
          >
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-slate-200">{evidenceLightbox.caption}</span>
              <button
                type="button"
                onClick={() => setEvidenceLightbox(null)}
                className="p-1.5 rounded-lg bg-[#040D0A] text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {evidenceLightbox.type === 'video' ? (
              <video src={evidenceLightbox.url} controls autoPlay className="w-full max-h-[78vh] rounded-xl object-contain bg-black" />
            ) : (
              <img src={evidenceLightbox.url} alt={evidenceLightbox.caption} className="w-full max-h-[78vh] rounded-xl object-contain bg-black" />
            )}
          </div>
        </div>
      )}
        </div>
      )}

      {sectionTab === 'students_chat' && (
        <div className="space-y-4">

      {/* School Bot-Using Students & Ambassadors Roster (via @Ecoheros_bot) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <span>Maktabimdan Botdan Foydalanayotgan O‘quvchilar ({filteredBotStudents.length})</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-emerald-100/60">
                Telegram bot va ilova orqali ro‘yxatdan o‘tgan maktabingiz o‘quvchilari
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setStudentSourceFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    studentSourceFilter === 'all'
                      ? 'bg-white dark:bg-[#061812] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Barchasi
                </button>
                <button
                  type="button"
                  onClick={() => setStudentSourceFilter('bot')}
                  className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    studentSourceFilter === 'bot'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Bot ulangan
                </button>
              </div>
              <div className="relative w-full sm:w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Ism, sinf yoki @username..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {filteredBotStudents.length === 0 ? (
            <p className="text-xs text-slate-500 py-8 text-center">Maktab o‘quvchilari topilmadi.</p>
          ) : (
            <>
              {/* Mobile Cards */}
              <div className="md:hidden space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {filteredBotStudents.map(st => (
                  <div
                    key={st.uid}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{st.fullName}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {st.grade || "O'quvchi"} ·{' '}
                        <span className="font-mono text-sky-500">{st.telegramUsername || '—'}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono tabular-nums font-bold text-emerald-500">
                        {(st.ecoCoins || 0).toLocaleString()} ECO
                      </div>
                      <div className={`text-[10px] font-semibold ${st.telegramLinked ? 'text-emerald-500' : 'text-slate-400'}`}>
                        {st.telegramLinked ? 'Bot ulangan' : 'Web'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto max-h-[360px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-emerald-500/20 text-slate-500 sticky top-0 bg-white dark:bg-[#061812]">
                    <tr>
                      <th className="py-2 pr-3">O‘quvchi</th>
                      <th className="py-2 px-3">Telegram / Aloqa</th>
                      <th className="py-2 px-3">Holat</th>
                      <th className="py-2 pl-3 text-right">EcoCoin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                    {filteredBotStudents.map(st => (
                      <tr key={st.uid}>
                        <td className="py-2.5 pr-3">
                          <div className="font-bold text-slate-900 dark:text-white">{st.fullName}</div>
                          <div className="text-[11px] text-slate-500">
                            {st.grade || "O'quvchi"} · {st.badge || 'Eko-Qahramon'}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] font-mono">
                          <div className="text-sky-500">{st.telegramUsername || '—'}</div>
                          <div className="text-slate-400">{st.phoneNumber || ''}</div>
                        </td>
                        <td className="py-2.5 px-3 text-[11px] font-semibold">
                          <span className={st.telegramLinked ? 'text-emerald-500' : 'text-slate-400'}>
                            {st.telegramLinked ? 'Bot ulangan' : 'Web hisob'}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-right font-mono tabular-nums font-bold text-emerald-500">
                          {(st.ecoCoins || 0).toLocaleString()} ECO
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Maktab Eko-Elchilari ({rosterAmbassadors.length || schoolAmbassadors.length})</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-emerald-100/60">
                Xabarlar @Ecoheros_bot nomidan Eko-Elchining Telegramiga boradi
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBotChat()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Barchaga botdan yozish</span>
            </button>
          </div>

          {(rosterAmbassadors.length === 0 && schoolAmbassadors.length === 0) ? (
            <p className="text-xs text-slate-500 py-6 text-center">Maktabingizda tasdiqlangan Eko-Elchi hali yo‘q.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-500/15 max-h-[360px] overflow-y-auto pr-1">
              {(rosterAmbassadors.length > 0
                ? rosterAmbassadors
                : schoolAmbassadors.map(a => ({
                    id: a.id,
                    uid: a.id,
                    fullName: a.fullName,
                    schoolId: a.schoolId,
                    schoolName: a.schoolName,
                    region: '',
                    district: a.district || '',
                    grade: a.grade || '',
                    phone: a.phone || '',
                    telegramUsername: a.telegramUsername || '',
                    telegramLinked: Boolean(a.telegramUsername),
                    ecoCoins: a.ecoCoins || 0,
                    verifiedActivitiesCount: a.verifiedActivitiesCount || 0,
                    tasksCompletedCount: a.tasksCompletedCount || 0,
                    status: a.status,
                  }))
              ).map(amb => (
                <div key={amb.uid || amb.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{amb.fullName}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {amb.grade ? `${amb.grade} · ` : ''}
                      {amb.telegramUsername ? <span className="font-mono text-sky-500">{amb.telegramUsername}</span> : null}
                      {amb.phone ? ` · ${amb.phone}` : ''}
                    </div>
                    <div className="text-[11px] text-emerald-500 font-mono tabular-nums">
                      {amb.verifiedActivitiesCount || 0} faoliyat · {(amb.ecoCoins || 0).toLocaleString()} ECO
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openBotChat(amb.uid || amb.id)}
                    className="min-h-[36px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-[11px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>Botdan yozish</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Real-time @Ecoheros_bot & District Coordinator Chat */}
      <div ref={chatSectionRef}>
        <EcoTelegramChatPanel
          defaultChannelId={selectedChatChannelId}
          allowedScopes={['school_ambassadors', 'district_captains']}
          title="@Ecoheros_bot · Eko-Elchilar & Tuman Koordinatori bilan Suhbat"
        />
      </div>
        </div>
      )}
    </div>
  );
};
