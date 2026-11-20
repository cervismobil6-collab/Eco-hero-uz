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
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { VoucherVerifierPanel } from '../shop/VoucherVerifierPanel';
import { HomePostsManagerPanel } from './HomePostsManagerPanel';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';
import { resolveMediaUrl } from '../../utils/api';
import {
  DistrictLeaderboardDetailsResponse,
  RosterAmbassadorEntry,
  RosterStudentEntry,
} from '../../types/eco';

export const SchoolCaptainDashboardView: React.FC = () => {
  const {
    user,
    schools,
    reports,
    ambassadors,
    studentsLeaderboard,
    ecoTasks,
    registrationApplications,
    liveSyncVersion,
    createEcoTask,
    updateEcoTask,
    advanceReportWorkflow,
    schoolReportAction,
    appointAmbassadorHierarchical,
    reviewApplication,
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
  const chatSectionRef = React.useRef<HTMLDivElement | null>(null);

  // Direct Ambassador Onboarding Form state
  const [ambFullName, setAmbFullName] = useState('');
  const [ambPhone, setAmbPhone] = useState('');
  const [ambTelegram, setAmbTelegram] = useState('');
  const [ambEmail, setAmbEmail] = useState('');
  const [ambGrade, setAmbGrade] = useState('');
  const [addingAmb, setAddingAmb] = useState(false);

  // Application review note state
  const [appNotes, setAppNotes] = useState<Record<string, string>>({});

  // Task assignment state
  const [selectedAmbUid, setSelectedAmbUid] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskInstructions, setTaskInstructions] = useState('');
  const [assignNoteMap, setAssignNoteMap] = useState<Record<string, string>>({});
  const [assignAmbMap, setAssignAmbMap] = useState<Record<string, string>>({});

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
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  const exactRegisteredStudentsCount =
    rosterStudents.length > 0
      ? rosterStudents.length
      : mySchool?.registeredStudentsCount ?? schoolStudents.length;

  const schoolTasks = useMemo(
    () => ecoTasks.filter(t => t.schoolId === (mySchool?.id || user.schoolId)),
    [ecoTasks, mySchool?.id, user.schoolId]
  );

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

  return (
    <div className="space-y-6">
      {/* School Header with Real District Rating */}
      <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <SchoolIcon className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
              Maktab Sardori Kabineti · {mySchool?.district || user.district}
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              {mySchool?.name || user.schoolName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mySchool?.region || user.region} · Mas’ul sardor: {user.fullName}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 shrink-0">
          <div className="text-left sm:text-right">
            <div className="text-2xl font-black font-mono tabular-nums text-emerald-500">
              {(mySchoolRating?.realScore ?? mySchool?.totalCoins ?? 0).toLocaleString()} ball
            </div>
            <div className="text-[11px] text-slate-500">Maktab real reyting bali</div>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-2xl font-black font-mono tabular-nums text-amber-500">
              #{mySchoolRating?.rank || mySchool?.ratingRank || 1}
              {districtDetails?.totalSchoolsInDistrict ? ` / ${districtDetails.totalSchoolsInDistrict}` : ''}
            </div>
            <div className="text-[11px] text-slate-500">Tuman reytingidagi o‘rni</div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">Ro‘yxatdan o‘tgan o‘quvchilar (Jonli)</div>
          <div className="text-2xl font-black font-mono tabular-nums">
            {exactRegisteredStudentsCount} ta
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">Maktab Eko-Elchilari</div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-500">{schoolAmbassadors.length}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">Kelgan elchi arizalari</div>
          <div className="text-2xl font-black font-mono tabular-nums text-indigo-500">{incomingAmbassadorApplications.length}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500">Oy oxirigacha qoldi</div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-500">
            {districtDetails?.daysRemainingInMonth ?? 15} kun
          </div>
        </div>
      </div>

      {/* Real District School Rating & Month-End TOP-3 Tracker */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Tuman Maktablari Haqiqiy Reytingi · Oy Oxiri TOP-3 Rag‘batlantirish</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
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
          <div className="space-y-4">
            {/* Gold / Silver / Bronze TOP-3 Podium */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {districtDetails.schoolRatings.slice(0, 3).map((sr, idx) => (
                <div
                  key={sr.id}
                  className={`p-3 rounded-2xl border text-xs space-y-1 ${
                    idx === 0
                      ? 'bg-amber-500/10 border-amber-400/50'
                      : idx === 1
                      ? 'bg-slate-200/60 dark:bg-slate-800/70 border-slate-300 dark:border-slate-700'
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
                  <div className="text-[11px] text-slate-500 truncate">
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
                        ? 'bg-indigo-500/10 border-indigo-500/40'
                        : sr.isTop3
                        ? 'bg-amber-500/5 border-amber-500/30'
                        : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
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
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[11px] font-mono tabular-nums">
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
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
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
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {districtDetails.schoolRatings.map(sr => {
                    const isMine = sr.isMySchool || sr.id === mySchool?.id;
                    return (
                      <tr
                        key={sr.id}
                        className={isMine ? 'bg-indigo-500/5 dark:bg-indigo-500/10 font-semibold' : ''}
                      >
                        <td className="py-3 pr-3 font-mono tabular-nums font-bold">
                          <span className={sr.isTop3 ? 'text-amber-500' : 'text-slate-400'}>#{sr.rank}</span>
                        </td>
                        <td className="py-3 px-3 min-w-[180px]">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{sr.name}</span>
                            {isMine && <span className="text-[11px] text-indigo-500 font-bold">(Sizning maktabingiz)</span>}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {sr.isTop3 ? 'Oy oxiri TOP-3 zonasi' : `Eko-Elchi: ${sr.ambassadorName}`}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{sr.totalCoins.toLocaleString()}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{sr.resolvedReportsCount}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">{sr.approvedMediaCount}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-500">{sr.treesPlanted}</td>
                        <td className="py-3 pl-3 text-right font-mono tabular-nums font-black text-emerald-500">
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
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-500">
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

      {/* Add Eco-Ambassador Directly + Review Incoming Applications for This School */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-emerald-500" />
              <span>Eko-Elchi Qo‘shish</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Maktabingiz o‘quvchisi ma’lumotlarini kiriting va darhol Eko-Elchi sifatida biriktiring.
            </p>
          </div>
          <form onSubmit={handleDirectAddAmbassador} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">To‘liq ism-familiya *</label>
              <input
                type="text"
                required
                value={ambFullName}
                onChange={e => setAmbFullName(e.target.value)}
                placeholder="Masalan: Dilshod Raximov"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Telefon raqam</label>
                <input
                  type="text"
                  value={ambPhone}
                  onChange={e => setAmbPhone(e.target.value)}
                  placeholder="+99890..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Sinf</label>
                <input
                  type="text"
                  value={ambGrade}
                  onChange={e => setAmbGrade(e.target.value)}
                  placeholder="10-A"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Telegram username</label>
                <input
                  type="text"
                  value={ambTelegram}
                  onChange={e => setAmbTelegram(e.target.value)}
                  placeholder="@username"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Email (ixtiyoriy)</label>
                <input
                  type="email"
                  value={ambEmail}
                  onChange={e => setAmbEmail(e.target.value)}
                  placeholder="email@mail.uz"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={addingAmb}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer transition-colors"
            >
              {addingAmb ? 'Biriktirilmoqda...' : 'Maktab Eko-Elchisi etib qo‘shish'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" />
                <span>Eko-Elchi Bo‘lish Uchun Kelgan Arizalar</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Maktabingizni ko‘rsatib Eko-Elchi bo‘lishga ariza yuborgan o‘quvchilarni tasdiqlang yoki rad eting.
              </p>
            </div>
            <span className="font-mono tabular-nums text-xs font-bold text-amber-500">
              {incomingAmbassadorApplications.length} ta
            </span>
          </div>

          {incomingAmbassadorApplications.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800">
              Hozircha maktabingizga yangi Eko-Elchi arizalari kelib tushmagan.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {incomingAmbassadorApplications.map(app => (
                <div key={app.id} className="py-4 space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {app.fullName}
                        {app.telegramUsername ? (
                          <span className="text-xs font-mono text-sky-500 ml-2">{app.telegramUsername}</span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {app.officialSchoolName} · Aloqa: <span className="font-mono">{app.contactInfo}</span>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold uppercase text-amber-500 shrink-0">
                      {app.status === 'needs_info' ? "Ma'lumot kutilmoqda" : 'Kutilmoqda'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl">
                    {app.verificationDetails}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Izoh (ixtiyoriy)..."
                      value={appNotes[app.id] || ''}
                      onChange={e => setAppNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                      className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReviewApp(app.id, 'approve')}
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Tasdiqlash
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewApp(app.id, 'request_info')}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> So‘rash
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewApp(app.id, 'reject')}
                        className="px-3 py-1.5 rounded-xl bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-1 cursor-pointer"
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

      {/* HomePage Posts CMS Managed by School Captain */}
      <HomePostsManagerPanel />

      {/* Voucher & Promo Code Verifier for School Admin */}
      <VoucherVerifierPanel />

      {/* Incoming AI-Verified Reports & Dual Resolution Workflow */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Maktabga kelgan ekologik muammolar ({incomingApprovedReports.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              AI tekshiruvidan o‘tgan rasmlar: o‘quvchi o‘zi ish bajargan bo‘lsa tasdiqlang (coin beriladi), faqat xabar bergan bo‘lsa Eko-Elchiga yuboring.
            </p>
          </div>
        </div>

        {incomingApprovedReports.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800">
            Hozircha maktabingizga kelgan ekologik muammolar yo‘q.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {incomingApprovedReports.map(rep => (
              <div key={rep.id} className="py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                  {rep.imageUrl && (
                    <img
                      src={resolveMediaUrl(rep.imageUrl)}
                      alt={rep.title}
                      className="w-20 h-20 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                    />
                  )}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">{rep.title}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-emerald-500">{rep.status}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{rep.reporterName}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{rep.description}</p>
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

                {!['resolved', 'RESOLVED', 'ESCALATED'].includes(rep.status) && (
                  <div className="flex flex-col gap-2 shrink-0 lg:w-[340px]">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          schoolReportAction(rep.id, 'confirm_student_resolved', {
                            note: assignNoteMap[rep.id] || "O'quvchi bajarganligi maktab admini tomonidan tasdiqlandi",
                          })
                        }
                        className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>O‘quvchi bajargan (Tasdiqlash)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          advanceReportWorkflow(rep.id, 'escalate', {
                            escalationTarget: rep.escalationTarget || "Maktab ma'muriyati / Mutaxassislar",
                            note: "Maktab ma'muriyati va vakolatli tashkilotga oshirildi",
                          })
                        }
                        className="px-3 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
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
                            className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
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
                              note: assignNoteMap[rep.id] || "O'quvchi bilan birga muammoni hal qilib avval/keyin rasm yuklang",
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
            ))}
          </div>
        )}
      </div>

      {/* Assign Task to Eco Ambassadors + Track Tasks */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-500" />
            <span>Eko-Elchiga yangi vazifa biriktirish</span>
          </h3>
          <form onSubmit={handleCreateTask} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Maktab Eko-Elchisi</label>
              <select
                value={selectedAmbUid || schoolAmbassadors[0]?.id || ''}
                onChange={e => setSelectedAmbUid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
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
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Vazifa nomi</label>
              <input
                type="text"
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
                placeholder="Masalan: Maktab bog‘idagi ko‘chatlarni sug‘orish"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Ko‘rsatmalar</label>
              <textarea
                rows={3}
                value={taskInstructions}
                onChange={e => setTaskInstructions(e.target.value)}
                placeholder="Bajarish tartibi va xavfsizlik talablari..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={schoolAmbassadors.length === 0}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
            >
              Vazifani yuborish
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-indigo-500" />
            <span>Maktab vazifalari nazorati ({schoolTasks.length})</span>
          </h3>
          {schoolTasks.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Hozircha vazifalar yaratilmagan.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {schoolTasks.map(t => (
                <div key={t.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white">{t.title}</div>
                    <div className="text-[11px] text-slate-500">
                      Ijrochi: {t.assigneeName} · Holat: <b>{t.status}</b>
                      {t.completionNote ? ` · Hisobot: ${t.completionNote}` : ''}
                    </div>
                  </div>
                  {t.status === 'submitted' ? (
                    <button
                      onClick={() => updateEcoTask(t.id, { status: 'verified' })}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold shrink-0 cursor-pointer"
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

      {/* School Bot-Using Students & Ambassadors Roster (via @Ecoheros_bot) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                <span>Maktabimdan Botdan Foydalanayotgan O‘quvchilar ({filteredBotStudents.length})</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Telegram bot va ilova orqali ro‘yxatdan o‘tgan maktabingiz o‘quvchilari
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setStudentSourceFilter('all')}
                  className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
                    studentSourceFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Barchasi
                </button>
                <button
                  type="button"
                  onClick={() => setStudentSourceFilter('bot')}
                  className={`px-2.5 py-1 rounded-lg cursor-pointer transition-colors ${
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
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-emerald-500"
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
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 text-xs"
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
                  <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 sticky top-0 bg-white dark:bg-slate-900">
                    <tr>
                      <th className="py-2 pr-3">O‘quvchi</th>
                      <th className="py-2 px-3">Telegram / Aloqa</th>
                      <th className="py-2 px-3">Holat</th>
                      <th className="py-2 pl-3 text-right">EcoCoin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
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

        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Maktab Eko-Elchilari ({rosterAmbassadors.length || schoolAmbassadors.length})</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Xabarlar @Ecoheros_bot nomidan Eko-Elchining Telegramiga boradi
              </p>
            </div>
            <button
              type="button"
              onClick={() => openBotChat()}
              className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Bot className="w-3.5 h-3.5" />
              <span>Barchaga botdan yozish</span>
            </button>
          </div>

          {(rosterAmbassadors.length === 0 && schoolAmbassadors.length === 0) ? (
            <p className="text-xs text-slate-500 py-6 text-center">Maktabingizda tasdiqlangan Eko-Elchi hali yo‘q.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[360px] overflow-y-auto pr-1">
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
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
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
  );
};
