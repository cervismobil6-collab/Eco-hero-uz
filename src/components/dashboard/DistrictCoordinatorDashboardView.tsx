import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  School as SchoolIcon,
  Award,
  Trophy,
  Lock,
  CheckCircle2,
  Clock,
  Camera,
  UserPlus,
  Inbox,
  Gift,
  AlertCircle,
  XCircle,
  MessageSquare,
  Send,
  Users,
  TrendingUp,
  Crown,
  Calendar,
  Copy,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import {
  DistrictLeaderboardDetailsResponse,
  DistrictUserGrowthResponse,
  RosterCaptainEntry,
} from '../../types/eco';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';
import { StudentRatingManagerCard } from './StudentRatingManagerCard';
import cabinetDistrictCommandImg from '../../assets/images/cabinet_district_command_1795687842689.jpg';

function slugifyChatKey(val?: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const ROLE_LABELS_UZ: Record<string, string> = {
  ambassador: 'Eko-Elchi',
  school_admin: 'Maktab Sardori',
  district_coordinator: 'Tuman Koordinatori',
};

export const DistrictCoordinatorDashboardView: React.FC = () => {
  const {
    user,
    schools,
    ambassadors,
    reports,
    mediaSubmissions,
    registrationApplications,
    monthlyAwards,
    liveSyncVersion,
    fetchLeaderboard,
    fetchDistrictLeaderboardDetails,
    fetchDistrictUserGrowth,
    fetchRosterDirectory,
    appointSchoolCaptain,
    reviewApplication,
    awardMonthlyTop3,
    showNotification,
  } = useEco();

  const [leaders, setLeaders] = useState<any[]>([]);
  const [lbForbidden, setLbForbidden] = useState(false);
  const [lbLoading, setLbLoading] = useState(false);

  const [districtDetails, setDistrictDetails] = useState<DistrictLeaderboardDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [awardingLoading, setAwardingLoading] = useState(false);

  const [userGrowth, setUserGrowth] = useState<DistrictUserGrowthResponse | null>(null);
  const [userGrowthForbidden, setUserGrowthForbidden] = useState(false);
  const [districtCaptains, setDistrictCaptains] = useState<RosterCaptainEntry[]>([]);
  const [selectedChatChannelId, setSelectedChatChannelId] = useState<string>('');
  const [sectionTab, setSectionTab] = useState<'overview' | 'cadres' | 'captains_chat'>('overview');
  const chatSectionRef = React.useRef<HTMLDivElement | null>(null);

  // Appoint School Captain form state
  const [captainFullName, setCaptainFullName] = useState('');
  const [captainPhone, setCaptainPhone] = useState('');
  const [captainTelegram, setCaptainTelegram] = useState('');
  const [captainEmail, setCaptainEmail] = useState('');
  const [captainGrade, setCaptainGrade] = useState('10-A');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [newSchoolNumber, setNewSchoolNumber] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [captainSubmitting, setCaptainSubmitting] = useState(false);

  // Application review state
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLbLoading(true);
    setDetailsLoading(true);
    try {
      const [lbRes, detailsRes, growthRes, rosterRes] = await Promise.all([
        fetchLeaderboard('district_leaders', { period: 'monthly', limit: 20 }),
        fetchDistrictLeaderboardDetails({ region: user.region, district: user.district }),
        fetchDistrictUserGrowth(),
        fetchRosterDirectory({ region: user.region, district: user.district }),
      ]);
      if (lbRes.forbidden) setLbForbidden(true);
      else setLeaders(lbRes.items || []);
      if (detailsRes) setDistrictDetails(detailsRes);
      if (growthRes.forbidden) setUserGrowthForbidden(true);
      else if (growthRes.success && growthRes.data) setUserGrowth(growthRes.data);
      if (rosterRes?.districtCaptains) setDistrictCaptains(rosterRes.districtCaptains);
    } finally {
      setLbLoading(false);
      setDetailsLoading(false);
    }
  }, [fetchLeaderboard, fetchDistrictLeaderboardDetails, fetchDistrictUserGrowth, fetchRosterDirectory, user.region, user.district]);

  useEffect(() => {
    loadAll();
  }, [loadAll, liveSyncVersion]);

  const openCaptainChat = (captainUid?: string, captainDistrict?: string) => {
    const distSlug = slugifyChatKey(captainDistrict || user.district || 'shayxontohur_tumani');
    const ch = captainUid ? `dist_dm:${distSlug}:${captainUid}` : `dist_group:${distSlug}`;
    setSelectedChatChannelId(ch);
    setSectionTab('captains_chat');
    window.setTimeout(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const districtSchools = useMemo(() => {
    const list =
      user.role === 'super_admin'
        ? schools
        : schools.filter(s => s.district === user.district && s.region === user.region);
    return [...list].sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
  }, [schools, user.role, user.district, user.region]);

  useEffect(() => {
    if (!selectedSchoolId && districtSchools.length > 0) {
      setSelectedSchoolId(districtSchools[0].id);
    } else if (districtSchools.length === 0 && !selectedSchoolId) {
      setSelectedSchoolId('__new__');
    }
  }, [districtSchools, selectedSchoolId]);

  const districtReports = useMemo(
    () =>
      user.role === 'super_admin'
        ? reports
        : reports.filter(r => r.district === user.district && r.region === user.region),
    [reports, user.role, user.district, user.region]
  );

  const districtMedia = useMemo(
    () =>
      user.role === 'super_admin'
        ? mediaSubmissions
        : mediaSubmissions.filter(m => m.district === user.district && m.region === user.region),
    [mediaSubmissions, user.role, user.district, user.region]
  );

  const districtAmbassadors = useMemo(
    () =>
      ambassadors.filter(
        a =>
          a.status !== 'revoked' &&
          (user.role === 'super_admin' ||
            districtSchools.some(s => s.id === a.schoolId) ||
            a.district === user.district)
      ),
    [ambassadors, districtSchools, user.role, user.district]
  );

  const incomingApplications = useMemo(
    () =>
      registrationApplications.filter(
        a =>
          ['pending', 'needs_info'].includes(a.status) &&
          ['school_admin', 'ambassador'].includes(a.requestedRole) &&
          (user.role === 'super_admin' || (a.district === user.district && a.region === user.region))
      ),
    [registrationApplications, user.role, user.district, user.region]
  );

  const districtAwardHistory = useMemo(
    () =>
      (districtDetails?.monthlyAwards?.length ? districtDetails.monthlyAwards : monthlyAwards).filter(
        aw => user.role === 'super_admin' || (aw.district === user.district && aw.region === user.region)
      ),
    [districtDetails, monthlyAwards, user.role, user.district, user.region]
  );

  const totalStudents = useMemo(
    () => districtSchools.reduce((sum, s) => sum + (s.registeredStudentsCount || s.studentsCount || 0), 0),
    [districtSchools]
  );

  const resolvedReports = districtReports.filter(r => r.status === 'resolved' || r.status === 'RESOLVED');
  const unresolvedReports = districtReports.filter(
    r => !['resolved', 'RESOLVED', 'rejected', 'REJECTED'].includes(r.status)
  );

  const handleAppointCaptain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captainFullName.trim()) return;
    setCaptainSubmitting(true);
    try {
      const isNewSchool = selectedSchoolId === '__new__' || !selectedSchoolId;
      const res = await appointSchoolCaptain({
        fullName: captainFullName.trim(),
        phoneNumber: captainPhone.trim() || undefined,
        telegramUsername: captainTelegram.trim() || undefined,
        email: captainEmail.trim() || undefined,
        grade: captainGrade.trim() || undefined,
        schoolId: isNewSchool ? undefined : selectedSchoolId,
        schoolNumber: isNewSchool ? newSchoolNumber.trim() : undefined,
        schoolName: isNewSchool ? newSchoolName.trim() : undefined,
        region: user.region,
        district: user.district,
      });
      if (res.success) {
        setCaptainFullName('');
        setCaptainPhone('');
        setCaptainTelegram('');
        setCaptainEmail('');
        setNewSchoolNumber('');
        setNewSchoolName('');
        await loadAll();
      }
    } finally {
      setCaptainSubmitting(false);
    }
  };

  const handleReviewApp = async (appId: string, action: 'approve' | 'reject' | 'request_info') => {
    setReviewBusyId(appId);
    try {
      const res = await reviewApplication(appId, action, reviewNotes[appId] || undefined);
      if (res.success) {
        await loadAll();
      }
    } finally {
      setReviewBusyId(null);
    }
  };

  const handleAwardTop3 = async () => {
    setAwardingLoading(true);
    try {
      const res = await awardMonthlyTop3({ region: user.region, district: user.district });
      if (res.details) {
        setDistrictDetails(res.details);
      } else if (res.success) {
        await loadAll();
      }
    } finally {
      setAwardingLoading(false);
    }
  };

  const realSchoolRatings = districtDetails?.schoolRatings || [];
  const realAmbassadorRatings = districtDetails?.ambassadorRatings || [];

  return (
    <div className="space-y-4">
      {/* Compact Duolingo Dark-Emerald District Hero Header */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 text-white shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src={cabinetDistrictCommandImg}
            alt="Tuman Eko-Koordinatori"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-emerald-400/40 shrink-0 shadow-md"
          />
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-[#00F5A0] uppercase tracking-wider truncate">
              Tuman Eko-Koordinatori · {user.region}
            </div>
            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight text-white truncate">
              {user.district} Tumani Boshqaruvi
            </h2>
            <p className="text-xs text-emerald-100/70 truncate">
              Maktab sardorlarini tayinlash, arizalar, jonli reyting va oy oxiri TOP-3 taqdirlash.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
          <button
            onClick={handleAwardTop3}
            disabled={
              awardingLoading ||
              !districtDetails?.isLastDayOfMonth ||
              Boolean(districtDetails?.alreadyAwardedThisMonth)
            }
            className={`min-h-[44px] px-4 py-2.5 rounded-xl font-black text-xs inline-flex items-center justify-center gap-2 transition-all ${
              districtDetails?.isLastDayOfMonth && !districtDetails?.alreadyAwardedThisMonth
                ? 'bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-105 text-[#04110B] border-b-[3px] border-amber-700 active:translate-y-[1px] cursor-pointer shadow-lg shadow-amber-500/20'
                : 'bg-[#040D0A]/80 text-emerald-100/60 border border-emerald-500/25 cursor-not-allowed'
            }`}
          >
            {districtDetails?.alreadyAwardedThisMonth ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : districtDetails?.isLastDayOfMonth ? (
              <Gift className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            <span>
              {awardingLoading
                ? 'Hisoblanmoqda...'
                : districtDetails?.alreadyAwardedThisMonth
                ? 'Bu oy TOP-3 mukofot topshirilgan'
                : districtDetails?.isLastDayOfMonth
                ? 'Oy oxiri TOP-3 mukofotini topshirish'
                : 'Sovg‘a topshirish (Oy oxirgi kuni ochiladi)'}
            </span>
          </button>
          <div className="text-[11px] font-medium text-emerald-100/65 flex items-center sm:justify-end gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            {districtDetails?.alreadyAwardedThisMonth ? (
              <span className="text-[#00F5A0]">
                {districtDetails.periodLabel} g‘oliblariga promokod yuborildi
              </span>
            ) : districtDetails?.isLastDayOfMonth ? (
              <span className="text-[#00F5A0] font-semibold">
                Bugun oyning oxirgi kuni! TOP-3 maktab va elchilarga promokod yuborish ochiq
              </span>
            ) : (
              <span className="font-mono tabular-nums">
                Ochilish: {districtDetails?.lastDayDateLabel || 'Oy oxirgi kuni'} ·{' '}
                {districtDetails?.daysRemainingInMonth ?? '—'} kun qoldi
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Compact KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 flex items-center justify-between">
            <span>Vakolatli maktablar</span>
            <SchoolIcon className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">{districtSchools.length}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 flex items-center justify-between">
            <span>Jami o‘quvchilar</span>
            <Award className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">{totalStudents.toLocaleString()}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 flex items-center justify-between">
            <span>Hal etilgan hisobotlar</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-500">{resolvedReports.length}</div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-0.5">
          <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 flex items-center justify-between">
            <span>Oy yakuniga qoldi</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-amber-500">
            {districtDetails?.daysRemainingInMonth ?? '—'} kun
          </div>
        </div>
      </div>

      {/* Role-Specific Compact Top Sub-Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
        {[
          { id: 'overview' as const, label: 'Boshqaruv & Reyting', badge: 0 },
          { id: 'cadres' as const, label: 'Arizalar & Kadrlar', badge: incomingApplications.length },
          { id: 'captains_chat' as const, label: 'Sardorlar & Suhbat', badge: 0 },
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

      {sectionTab === 'overview' && (
        <div className="space-y-4">
      {/* EXCLUSIVE TOP-3 District User-Growth Race (Visible ONLY to District Coordinators & Super Admin) */}
      {!userGrowthForbidden && userGrowth && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-amber-500/35 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                <Lock className="w-3.5 h-3.5" />
                <span>Faqat Tuman Koordinatorlari uchun maxfiy musobaqa</span>
              </div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span>Eng Ko‘p Foydalanuvchi Yig‘gan TOP-3 Tuman (Qimmatbaho Sovg‘alar)</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/65">{userGrowth.prizeNote}</p>
            </div>
            {userGrowth.myDistrictRank && (
              <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs shrink-0">
                <div className="text-slate-500">Sizning tumaningiz o‘rni:</div>
                <div className="font-mono tabular-nums font-black text-lg text-amber-500">
                  #{userGrowth.myDistrictRank.rank} / {userGrowth.totalDistricts}{' '}
                  <span className="text-xs font-semibold text-emerald-500">
                    ({userGrowth.myDistrictRank.totalJoinedUsers} foydalanuvchi)
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Mobile Cards for District User Growth */}
          <div className="md:hidden space-y-2.5">
            {userGrowth.items.map(row => (
              <div
                key={row.id}
                className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                  row.isMyDistrict
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : row.isTop3
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/20'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`font-mono tabular-nums font-black ${
                          row.isTop3 ? 'text-amber-500' : 'text-slate-400'
                        }`}
                      >
                        #{row.rank} {row.isTop3 ? '★' : ''}
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white truncate">{row.district}</span>
                      {row.isMyDistrict && <span className="text-[11px] text-emerald-500 font-bold">(Sizning tuman)</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {row.region} · {row.coordinatorName}
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-black text-emerald-500">{row.totalJoinedUsers.toLocaleString()} kishi</div>
                    {row.isTop3 && <div className="text-[10px] font-bold text-amber-500">TOP-3 Sovrin</div>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-emerald-500/20 text-[11px] font-mono tabular-nums">
                  <div>
                    <div className="text-slate-400 font-sans">Maktablar</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{row.schoolsCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 font-sans">O‘quvchilar</div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">
                      {row.totalSchoolStudents.toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-slate-400 font-sans">Botdan kirgan</div>
                    <div className="font-bold text-sky-500">{row.botUsersCount.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table for District User Growth */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-emerald-500/20 text-slate-500 dark:text-emerald-100/60">
                <tr>
                  <th className="py-2.5 pr-3">O‘rin</th>
                  <th className="py-2.5 px-3">Tuman / Koordinator</th>
                  <th className="py-2.5 px-3 text-right">Maktablar</th>
                  <th className="py-2.5 px-3 text-right">Maktab o‘quvchilari</th>
                  <th className="py-2.5 px-3 text-right">Botdan kirganlar</th>
                  <th className="py-2.5 pl-3 text-right">Jami foydalanuvchi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                {userGrowth.items.map(row => (
                  <tr
                    key={row.id}
                    className={
                      row.isMyDistrict
                        ? 'bg-emerald-500/10 font-semibold'
                        : row.isTop3
                        ? 'bg-amber-500/5'
                        : ''
                    }
                  >
                    <td className="py-3 pr-3 font-mono tabular-nums font-black">
                      <span className={row.isTop3 ? 'text-amber-500' : 'text-slate-400'}>
                        #{row.rank} {row.isTop3 ? '★' : ''}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{row.district}</span>
                        {row.isMyDistrict && <span className="text-[11px] text-emerald-500">(Sizning tuman)</span>}
                        {row.isTop3 && (
                          <span className="text-[11px] text-amber-500 font-bold">· Qimmatbaho sovg‘a zonasi</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {row.region} · {row.coordinatorName}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{row.schoolsCount}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {row.totalSchoolStudents.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-500 font-bold">
                      {row.botUsersCount.toLocaleString()}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums font-black text-emerald-500">
                      {row.totalJoinedUsers.toLocaleString()} kishi
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* District Student Monthly Rating (500+ threshold & TOP-3 Student Prizes) */}
      <StudentRatingManagerCard
        mode="district"
        region={user.region}
        district={user.district}
      />

        </div>
      )}

      {sectionTab === 'captains_chat' && (
        <div className="space-y-4">
      {/* District School Captains Directory + Quick Command/Chat Buttons */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-500" />
              <span>Tumandagi Maktab Sardorlari Ro‘yxati ({districtCaptains.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-emerald-100/60">
              Istalgan maktab sardoriga yakka tartibda yoki barchaga umumiy buyruq/xabar va rasm yuboring
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCaptainChat()}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Barcha Sardorlarga Umumiy Yozish</span>
          </button>
        </div>

        {districtCaptains.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Hozircha tumanda tayinlangan maktab sardorlari ro‘yxati bo‘sh. Arizalar & Kadrlar bo‘limida qo‘shishingiz mumkin.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {districtCaptains.map(cap => (
              <div
                key={cap.uid}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{cap.fullName}</div>
                  <div className="text-[11px] text-emerald-500 font-semibold truncate">{cap.schoolName}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {cap.telegramUsername ? <span className="font-mono text-sky-500">{cap.telegramUsername}</span> : null}
                    {cap.phoneNumber ? ` · ${cap.phoneNumber}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openCaptainChat(cap.uid, cap.district)}
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-[11px] font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Yozish</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Telegram-style Real-Time Chat with School Captains & Regional Coordinator */}
      <div ref={chatSectionRef}>
        <EcoTelegramChatPanel
          defaultChannelId={selectedChatChannelId}
          allowedScopes={['district_captains', 'regional_coordinators']}
          title="Tuman Maktab Sardorlari & Viloyat Chati (Oddiy xabar, Buyruq & Rasm)"
        />
      </div>
        </div>
      )}

      {sectionTab === 'cadres' && (
        <div className="space-y-4">
      {/* Appoint School Captain + Incoming District Applications */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <form
          onSubmit={handleAppointCaptain}
          className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Maktab Sardori qo‘shish va biriktirish
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-emerald-100/60">
                O‘quvchi ma’lumotlarini kiriting va tumaningizdagi maktabga biriktiring
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">
                O‘quvchi F.I.Sh. *
              </label>
              <input
                type="text"
                required
                value={captainFullName}
                onChange={e => setCaptainFullName(e.target.value)}
                placeholder="Masalan: Jasur Karimov"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">Telefon raqam</label>
              <input
                type="text"
                value={captainPhone}
                onChange={e => setCaptainPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">Telegram username</label>
              <input
                type="text"
                value={captainTelegram}
                onChange={e => setCaptainTelegram(e.target.value)}
                placeholder="@sardor_uz"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">Email</label>
              <input
                type="email"
                value={captainEmail}
                onChange={e => setCaptainEmail(e.target.value)}
                placeholder="sardor@ecohero.uz"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">Sinf</label>
              <input
                type="text"
                value={captainGrade}
                onChange={e => setCaptainGrade(e.target.value)}
                placeholder="10-A"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">
                Qaysi maktabga biriktiriladi *
              </label>
              <select
                value={selectedSchoolId}
                onChange={e => setSelectedSchoolId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              >
                {districtSchools.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.number}-maktab)
                  </option>
                ))}
                <option value="__new__">+ Yangi maktab qo‘shish va biriktirish</option>
              </select>
            </div>

            {selectedSchoolId === '__new__' && (
              <>
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">
                    Maktab raqami *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSchoolNumber}
                    onChange={e => setNewSchoolNumber(e.target.value)}
                    placeholder="Masalan: 34"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 dark:text-emerald-100/75 mb-1">
                    Rasmiy maktab nomi *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSchoolName}
                    onChange={e => setNewSchoolName(e.target.value)}
                    placeholder="34-sonli maktab"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
                  />
                </div>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={captainSubmitting}
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 disabled:opacity-60 text-[#04110B] font-black text-xs border-b-[3px] border-emerald-700 active:translate-y-[1px] cursor-pointer"
          >
            {captainSubmitting ? 'Biriktirilmoqda...' : 'Maktab Sardorini tayinlash'}
          </button>
        </form>

        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Inbox className="w-5 h-5 text-sky-500" />
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  Kelgan Arizalar Navbati ({incomingApplications.length})
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-emerald-100/60">
                  Tumaningizdagi Maktab Sardori va Eko-Elchi nomzodlarining arizalari
                </p>
              </div>
            </div>
          </div>

          {incomingApplications.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Hozircha tumaningiz bo‘yicha ko‘rib chiqilishi kutilayotgan arizalar yo‘q.
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {incomingApplications.map(app => (
                <div
                  key={app.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{app.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {ROLE_LABELS_UZ[app.requestedRole] || app.requestedRole} · {app.officialSchoolName} (
                        {app.schoolNumber}-maktab)
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Aloqa: {app.contactInfo} {app.telegramUsername ? `· ${app.telegramUsername}` : ''}
                      </div>
                    </div>
                    <span className="font-semibold text-[11px] text-amber-500 shrink-0">
                      {app.status === 'needs_info' ? 'Qo‘shimcha ma’lumot kutilmoqda' : 'Kutilmoqda'}
                    </span>
                  </div>

                  <p className="text-slate-600 dark:text-emerald-100/80 leading-relaxed">{app.verificationDetails}</p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={reviewNotes[app.id] || ''}
                      onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                      placeholder="Izoh (ixtiyoriy)"
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReviewApp(app.id, 'approve')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[2px] border-emerald-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tasdiqlash</span>
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReviewApp(app.id, 'request_info')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>So‘rash</span>
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReviewApp(app.id, 'reject')}
                        className="min-h-[40px] px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rad</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
        </div>
      )}

      {sectionTab === 'overview' && (
        <div className="space-y-4">
      {/* Real District School Ratings + Restricted District Leaders Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Tumandagi maktablarning haqiqiy reytingi
              </h3>
              <p className="text-[11px] text-slate-500">
                Oy oxirida tuman bo‘yicha eng faol TOP-3 maktab (+1000 / +700 / +500 ECO) rag‘batlantiriladi
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums font-bold text-amber-500">
              TOP-3 · {districtDetails?.periodKey || 'Joriy oy'}
            </span>
          </div>

          {detailsLoading && realSchoolRatings.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Real reyting hisoblanmoqda...</p>
          ) : realSchoolRatings.length === 0 && districtSchools.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Ushbu tumanda maktablar topilmadi.</p>
          ) : (() => {
            const schoolRows =
              realSchoolRatings.length > 0
                ? realSchoolRatings
                : districtSchools.map((s, idx) => ({
                    id: s.id,
                    name: s.name,
                    captainName: undefined as string | undefined,
                    ambassadorName: s.ambassadorName,
                    registeredStudentsCount: s.registeredStudentsCount || s.studentsCount || 0,
                    treesPlanted: s.treesPlanted || 0,
                    resolvedReportsCount: 0,
                    approvedMediaCount: 0,
                    realScore: s.totalCoins || 0,
                    rank: idx + 1,
                    isTop3: idx < 3,
                  }));
            const top3Schools = schoolRows.slice(0, 3);
            const totalStudentsRow =
              realSchoolRatings.length > 0
                ? realSchoolRatings.reduce((acc, s) => acc + (s.registeredStudentsCount || 0), 0)
                : totalStudents;

            return (
              <div className="space-y-4">
                {/* Gold / Silver / Bronze TOP-3 School Podium */}
                {top3Schools.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {top3Schools.map((s, i) => (
                      <div
                        key={s.id}
                        className={`p-3 rounded-2xl border text-xs space-y-1 ${
                          i === 0
                            ? 'bg-amber-500/10 border-amber-400/50'
                            : i === 1
                            ? 'bg-slate-200/60 dark:bg-[#040D0A] border-slate-300 dark:border-emerald-500/20'
                            : 'bg-orange-500/10 border-orange-500/30'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-black text-amber-500 inline-flex items-center gap-1">
                            <Crown className="w-3.5 h-3.5" /> #{s.rank}
                          </span>
                          <span className="font-mono tabular-nums font-black text-emerald-500">
                            {s.realScore.toLocaleString()} ball
                          </span>
                        </div>
                        <div className="font-bold text-slate-900 dark:text-white truncate">{s.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          Sardor: {s.captainName || 'Tayinlanmagan'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mobile Cards */}
                <div className="md:hidden space-y-2.5">
                  {schoolRows.map(s => (
                    <div
                      key={s.id}
                      className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                        s.isTop3
                          ? 'bg-amber-500/5 border-amber-500/30'
                          : 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 dark:text-white truncate">
                            <span className={`font-mono mr-1.5 ${s.isTop3 ? 'text-amber-500' : 'text-slate-400'}`}>
                              #{s.rank}
                            </span>
                            {s.name}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            Elchi: {s.ambassadorName || 'Tayinlanmagan'}
                          </div>
                        </div>
                        <div className="font-mono tabular-nums font-black text-amber-500 shrink-0">
                          {s.realScore.toLocaleString()} ball
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-emerald-500/20 text-[11px] font-mono tabular-nums">
                        <div>
                          <div className="text-slate-400 font-sans">O‘quvchilar</div>
                          <div className="font-bold text-sky-500">{(s.registeredStudentsCount || 0).toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-slate-400 font-sans">Daraxt</div>
                          <div className="font-bold text-emerald-500">{s.treesPlanted}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-slate-400 font-sans">Hisobot/Media</div>
                          <div className="font-bold text-slate-700 dark:text-slate-300">
                            {s.resolvedReportsCount} / {s.approvedMediaCount}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-[#040D0A] flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
                    <span>Jami: {schoolRows.length} ta maktab</span>
                    <span className="font-mono tabular-nums text-sky-500">{totalStudentsRow.toLocaleString()} o‘quvchi</span>
                  </div>
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-emerald-500/20 text-slate-500">
                      <tr>
                        <th className="py-3 pr-3">#</th>
                        <th className="py-3 px-3">Maktab</th>
                        <th className="py-3 px-3 text-right">O‘quvchilar</th>
                        <th className="py-3 px-3 text-right">Daraxt</th>
                        <th className="py-3 px-3 text-right">Hisobot / Media</th>
                        <th className="py-3 pl-3 text-right">Real Ball</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                      {schoolRows.map(s => (
                        <tr key={s.id} className={s.isTop3 ? 'bg-amber-500/5' : ''}>
                          <td className="py-3 pr-3 font-mono tabular-nums font-bold text-slate-500">
                            #{s.rank} {s.isTop3 ? '★' : ''}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900 dark:text-white">{s.name}</div>
                            <div className="text-[11px] text-slate-500">
                              Sardor: {s.captainName || 'Tayinlanmagan'} · Elchi: {s.ambassadorName || 'Tayinlanmagan'}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-600 dark:text-sky-400 font-semibold">
                            {(s.registeredStudentsCount || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-500">
                            {s.treesPlanted}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-500">
                            {s.resolvedReportsCount} / {s.approvedMediaCount}
                          </td>
                          <td className="py-3 pl-3 text-right font-mono tabular-nums font-bold text-amber-500">
                            {s.realScore.toLocaleString()} ball
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-slate-200 dark:border-emerald-500/20 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                      <tr>
                        <td colSpan={2} className="py-2.5 pr-3">
                          Tumandagi jami: {schoolRows.length} ta maktab
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-sky-600 dark:text-sky-400">
                          {totalStudentsRow.toLocaleString()} o‘quvchi
                        </td>
                        <td colSpan={3} className="py-2.5 pl-3 text-right text-slate-500 font-normal">
                          Real vaqtda hisoblangan
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Restricted District Leaders Leaderboard */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div>
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Tuman Koordinatorlari Reytingi</span>
            </h3>
            <p className="text-[11px] text-slate-500">Faqat tuman/viloyat koordinatorlari va Super Admin uchun</p>
          </div>

          {lbLoading ? (
            <div className="py-8 text-center text-xs text-slate-500">Yuklanmoqda...</div>
          ) : lbForbidden ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 flex items-center gap-2">
              <Lock className="w-4 h-4 shrink-0" />
              <span>Tuman koordinatorlari reytingini ko‘rish taqiqlangan.</span>
            </div>
          ) : leaders.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Ma’lumotlar yo‘q.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-500/15">
              {leaders.slice(0, 8).map((l, idx) => (
                <div key={l.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 font-mono tabular-nums text-slate-400 font-bold">#{l.rank || idx + 1}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{l.district}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {l.coordinatorName} · {l.schoolsCount} maktab
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-bold text-emerald-500">{(l.points || 0).toLocaleString()} ECO</div>
                    <div className="text-[11px] text-slate-400">{l.resolvedCount || 0} hal etilgan</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Full District Ambassadors Ranking & Monthly Winners */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Tumandagi Barcha Eko-Elchilar Reytingi ({realAmbassadorRatings.length || districtAmbassadors.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                1-o‘rindan oxirgi o‘ringacha real faollik reytingi · Oy oxirida TOP-3 taqdirlanadi
              </p>
            </div>
          </div>

          {realAmbassadorRatings.length === 0 && districtAmbassadors.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">Eko-Elchilar ro‘yxati bo‘sh.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-emerald-500/15 max-h-[360px] overflow-y-auto pr-1">
              {(realAmbassadorRatings.length > 0
                ? realAmbassadorRatings
                : districtAmbassadors.map((a, idx) => ({
                    id: a.id,
                    fullName: a.fullName,
                    schoolName: a.schoolName,
                    verifiedActivitiesCount: a.verifiedActivitiesCount || 0,
                    tasksCompletedCount: a.tasksCompletedCount || 0,
                    realScore: (a.verifiedActivitiesCount || 0) * 60 + (a.ecoCoins || 0),
                    rank: idx + 1,
                    isTop3: idx < 3,
                    isLast: idx === districtAmbassadors.length - 1,
                  }))
              ).map(a => (
                <div
                  key={a.id}
                  className={`py-2.5 px-2 rounded-lg flex items-center justify-between gap-3 text-xs ${
                    a.isTop3 ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 font-mono tabular-nums font-bold text-slate-500 shrink-0">#{a.rank}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {a.fullName}{' '}
                        {a.isTop3 && <span className="text-amber-500">· TOP-3</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {a.schoolName} · {a.verifiedActivitiesCount} tasdiqlangan ish
                      </div>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums font-bold text-emerald-500 shrink-0">
                    {a.realScore.toLocaleString()} ball
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          {/* Monthly Awards History */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Gift className="w-4 h-4 text-amber-500" />
              <span>Oy oxiri g‘oliblari tarixi</span>
            </h3>
            {districtAwardHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-4">Hozircha oy oxiri taqdirlash yozuvlari yo‘q.</p>
            ) : (
              <div className="space-y-3">
                {districtAwardHistory.slice(0, 2).map(aw => (
                  <div
                    key={aw.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2 text-xs"
                  >
                    <div className="font-bold text-amber-500">
                      {aw.periodLabel} · {aw.district}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 space-y-1.5">
                      <div className="font-semibold">TOP-3 Maktablar (Sardorlarga promokod):</div>
                      {aw.topSchools.map(s => (
                        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate">
                            #{s.rank} {s.name}
                            {s.captainName ? ` · ${s.captainName}` : ''}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {s.promoCode && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(s.promoCode || '').catch(() => {});
                                  showNotification(`Promokod nusxalandi: ${s.promoCode}`, 'success');
                                }}
                                className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500 font-mono text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>{s.promoCode}</span>
                                <Copy className="w-2.5 h-2.5" />
                              </button>
                            )}
                            <span className="font-mono text-emerald-500">+{s.bonusCoins} ECO</span>
                          </div>
                        </div>
                      ))}
                      <div className="font-semibold pt-1.5">TOP-3 Eko-Elchilar (Promokodlar):</div>
                      {aw.topAmbassadors.map(a => (
                        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="truncate">
                            #{a.rank} {a.fullName}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {a.promoCode && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard?.writeText(a.promoCode || '').catch(() => {});
                                  showNotification(`Promokod nusxalandi: ${a.promoCode}`, 'success');
                                }}
                                className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-400 font-mono text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>{a.promoCode}</span>
                                <Copy className="w-2.5 h-2.5" />
                              </button>
                            )}
                            <span className="font-mono text-emerald-500">+{a.bonusCoins} ECO</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* District Media Projects */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Camera className="w-4 h-4 text-sky-500" />
              <span>
                Tumandagi eko-loyihalar ({districtMedia.length}) · Kutilayotgan muammo: {unresolvedReports.length}
              </span>
            </h3>
            {districtMedia.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">Tumanda yuborilgan media loyihalar yo‘q.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                {districtMedia.slice(0, 4).map(m => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{m.description}</div>
                      <div className="text-[11px] text-slate-500">
                        {m.schoolName} · {m.userName}
                      </div>
                    </div>
                    <span className="font-semibold text-emerald-500 shrink-0">{m.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
