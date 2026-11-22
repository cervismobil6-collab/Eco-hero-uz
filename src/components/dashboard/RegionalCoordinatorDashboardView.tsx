import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Globe,
  School as SchoolIcon,
  Award,
  CheckCircle2,
  Trophy,
  UserPlus,
  Inbox,
  AlertCircle,
  XCircle,
  Users,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { AnalyticsResponse, RosterCoordinatorEntry } from '../../types/eco';
import { UZBEKISTAN_DISTRICTS, UZBEKISTAN_REGIONS } from '../../data/mockData';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';

function slugifyChatKey(val?: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

const ROLE_LABELS_UZ: Record<string, string> = {
  district_coordinator: 'Tuman Koordinatori',
  school_admin: 'Maktab Sardori',
  ambassador: 'Eko-Elchi',
};

export const RegionalCoordinatorDashboardView: React.FC = () => {
  const {
    user,
    schools,
    reports,
    registrationApplications,
    liveSyncVersion,
    fetchAnalytics,
    fetchLeaderboard,
    fetchRosterDirectory,
    appointDistrictCoordinator,
    reviewApplication,
  } = useEco();

  const [regionAnalytics, setRegionAnalytics] = useState<AnalyticsResponse | null>(null);
  const [distLeaders, setDistLeaders] = useState<any[]>([]);
  const [districtCoordinators, setDistrictCoordinators] = useState<RosterCoordinatorEntry[]>([]);
  const [selectedChatChannelId, setSelectedChatChannelId] = useState<string>('');
  const chatSectionRef = React.useRef<HTMLDivElement | null>(null);

  // Elect District Coordinator form state
  const [targetRegion, setTargetRegion] = useState(user.region || UZBEKISTAN_REGIONS[0]);
  const [selectedDistrict, setSelectedDistrict] = useState(
    (UZBEKISTAN_DISTRICTS[user.region || UZBEKISTAN_REGIONS[0]] || [])[0] || ''
  );
  const [coordFullName, setCoordFullName] = useState('');
  const [coordPhone, setCoordPhone] = useState('');
  const [coordTelegram, setCoordTelegram] = useState('');
  const [coordEmail, setCoordEmail] = useState('');
  const [coordSubmitting, setCoordSubmitting] = useState(false);

  // Incoming applications state
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  const availableDistricts = useMemo(
    () => UZBEKISTAN_DISTRICTS[targetRegion] || UZBEKISTAN_DISTRICTS[user.region] || [],
    [targetRegion, user.region]
  );

  useEffect(() => {
    if (availableDistricts.length > 0 && !availableDistricts.includes(selectedDistrict)) {
      setSelectedDistrict(availableDistricts[0]);
    }
  }, [availableDistricts, selectedDistrict]);

  const reloadData = useCallback(async () => {
    const regionParam = user.role === 'super_admin' ? undefined : user.region;
    const [analyticsRes, lbRes, rosterRes] = await Promise.all([
      fetchAnalytics({ region: regionParam }),
      fetchLeaderboard('district_leaders', { period: 'monthly', region: regionParam, limit: 20 }),
      fetchRosterDirectory({ region: regionParam }),
    ]);
    if (analyticsRes) setRegionAnalytics(analyticsRes);
    if (lbRes.success) setDistLeaders(lbRes.items || []);
    if (rosterRes?.districtCoordinators) setDistrictCoordinators(rosterRes.districtCoordinators);
  }, [fetchAnalytics, fetchLeaderboard, fetchRosterDirectory, user.role, user.region]);

  useEffect(() => {
    reloadData();
  }, [reloadData, liveSyncVersion]);

  const openCoordinatorChat = (coordUid?: string, regName?: string) => {
    const regSlug = slugifyChatKey(regName || user.region || 'toshkent_shahri');
    const ch = coordUid ? `reg_dm:${regSlug}:${coordUid}` : `reg_group:${regSlug}`;
    setSelectedChatChannelId(ch);
    chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const regionalSchools = useMemo(() => {
    const list = user.role === 'super_admin' ? schools : schools.filter(s => s.region === user.region);
    return [...list].sort((a, b) => (b.totalCoins || 0) - (a.totalCoins || 0));
  }, [schools, user.role, user.region]);

  const regionalReports = useMemo(
    () => (user.role === 'super_admin' ? reports : reports.filter(r => r.region === user.region)),
    [reports, user.role, user.region]
  );

  const incomingApplications = useMemo(
    () =>
      registrationApplications.filter(
        a =>
          ['pending', 'needs_info'].includes(a.status) &&
          ['district_coordinator', 'school_admin', 'ambassador'].includes(a.requestedRole) &&
          (user.role === 'super_admin' || a.region === user.region)
      ),
    [registrationApplications, user.role, user.region]
  );

  const distPerf = regionAnalytics?.districtPerformance || [];
  const maxDistCoins = Math.max(1, ...distPerf.map(d => d.coins || 0));

  const handleAppointCoordinator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordFullName.trim() || !selectedDistrict) return;
    setCoordSubmitting(true);
    try {
      const res = await appointDistrictCoordinator({
        fullName: coordFullName.trim(),
        phoneNumber: coordPhone.trim() || undefined,
        telegramUsername: coordTelegram.trim() || undefined,
        email: coordEmail.trim() || undefined,
        district: selectedDistrict,
        region: user.role === 'super_admin' ? targetRegion : user.region,
      });
      if (res.success) {
        setCoordFullName('');
        setCoordPhone('');
        setCoordTelegram('');
        setCoordEmail('');
        await reloadData();
      }
    } finally {
      setCoordSubmitting(false);
    }
  };

  const handleReviewApp = async (appId: string, action: 'approve' | 'reject' | 'request_info') => {
    setReviewBusyId(appId);
    try {
      const res = await reviewApplication(appId, action, reviewNotes[appId] || undefined);
      if (res.success) {
        await reloadData();
      }
    } finally {
      setReviewBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
            <Globe className="w-7 h-7" />
          </div>
          <div>
            <div className="text-xs font-semibold text-rose-500">Viloyat Eko-Koordinatori Kabineti</div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {user.role === 'super_admin' ? "O'zbekiston Viloyatlari" : user.region}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tuman koordinatorlarini saylash, hududiy arizalarni tasdiqlash va tumanlar reytingini kuzatish
            </p>
          </div>
        </div>
      </div>

      {/* Regional KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Tumanlar soni</span>
            <Globe className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums">{distPerf.length}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Maktablar</span>
            <SchoolIcon className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums">{regionalSchools.length}</div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Hal etilgan muammolar</span>
            <CheckCircle2 className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-500">
            {regionalReports.filter(r => r.status === 'resolved' || r.status === 'RESOLVED').length} / {regionalReports.length}
          </div>
        </div>
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Hududiy EcoCoin</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-500">
            {(regionAnalytics?.totals.totalEcoCoins ?? regionalSchools.reduce((s, sc) => s + (sc.totalCoins || 0), 0)).toLocaleString()} ECO
          </div>
        </div>
      </div>

      {/* Elect District Coordinator + Regional Application Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleAppointCoordinator}
          className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-rose-500" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Tuman Koordinatorini saylash</h3>
              <p className="text-[11px] text-slate-500">
                Viloyatingizdagi istalgan tuman uchun mas’ul koordinator tayinlang
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Nomzod F.I.Sh. *</label>
              <input
                type="text"
                required
                value={coordFullName}
                onChange={e => setCoordFullName(e.target.value)}
                placeholder="Masalan: Azizbek Rahimov"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            {user.role === 'super_admin' && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Viloyat *</label>
                <select
                  value={targetRegion}
                  onChange={e => setTargetRegion(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-emerald-500"
                >
                  {UZBEKISTAN_REGIONS.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Qaysi tuman uchun *
              </label>
              <select
                value={selectedDistrict}
                onChange={e => setSelectedDistrict(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-emerald-500"
              >
                {availableDistricts.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Telefon raqam</label>
              <input
                type="text"
                value={coordPhone}
                onChange={e => setCoordPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Telegram username</label>
              <input
                type="text"
                value={coordTelegram}
                onChange={e => setCoordTelegram(e.target.value)}
                placeholder="@koordinator_uz"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-emerald-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={coordEmail}
                onChange={e => setCoordEmail(e.target.value)}
                placeholder="koordinator@ecohero.uz"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={coordSubmitting}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs cursor-pointer"
          >
            {coordSubmitting ? 'Tayinlanmoqda...' : 'Tuman Koordinatorini saylash'}
          </button>
        </form>

        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-sky-500" />
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Viloyat Arizalari Navbati ({incomingApplications.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Tuman koordinatori, maktab sardori va eko-elchi bo‘lish uchun kelgan arizalar
              </p>
            </div>
          </div>

          {incomingApplications.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Hozircha hududingiz bo‘yicha kutilayotgan arizalar mavjud emas.
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {incomingApplications.map(app => (
                <div
                  key={app.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{app.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {ROLE_LABELS_UZ[app.requestedRole] || app.requestedRole} · {app.district} ·{' '}
                        {app.officialSchoolName}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Aloqa: {app.contactInfo} {app.telegramUsername ? `· ${app.telegramUsername}` : ''}
                      </div>
                    </div>
                    <span className="font-semibold text-[11px] text-amber-500 shrink-0">
                      {app.status === 'needs_info' ? 'Qo‘shimcha ma’lumot kutilmoqda' : 'Kutilmoqda'}
                    </span>
                  </div>

                  <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{app.verificationDetails}</p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={reviewNotes[app.id] || ''}
                      onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                      placeholder="Izoh (ixtiyoriy)"
                      className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs outline-none"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReviewApp(app.id, 'approve')}
                        className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tasdiqlash</span>
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReviewApp(app.id, 'request_info')}
                        className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>So‘rash</span>
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReviewApp(app.id, 'reject')}
                        className="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
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

      {/* District Performance Comparison & Coordinator Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Tumanlar bo‘yicha taqqoslama</h3>
          {distPerf.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Tumanlar ma’lumotlari yuklanmoqda...</p>
          ) : (
            <div className="space-y-4">
              {distPerf.map((d, i) => {
                const pct = Math.max(6, Math.round(((d.coins || 0) / maxDistCoins) * 100));
                return (
                  <div key={`${d.region}_${d.district}`} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900 dark:text-white">
                        #{i + 1} · {d.district}
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        {d.schools} maktab · {d.resolved} hal etilgan ·{' '}
                        <b className="text-emerald-500">{(d.coins || 0).toLocaleString()} ECO</b>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>Tuman Koordinatorlari Faolligi</span>
          </h3>
          {distLeaders.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Tuman koordinatorlari ma’lumotlari topilmadi.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {distLeaders.map((dl, idx) => (
                <div key={dl.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white">
                      #{idx + 1} {dl.coordinatorName}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {dl.district} · {dl.schoolsCount} maktab · {dl.studentsCount} o‘quvchi
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums font-bold text-emerald-500">
                    {(dl.points || 0).toLocaleString()} ECO
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Regional School Rankings */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Viloyat maktablari reytingi</h3>
        {regionalSchools.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">Hozircha viloyatda ro‘yxatga olingan maktablar yo‘q.</p>
        ) : (
          <>
            <div className="md:hidden space-y-2.5">
              {regionalSchools.slice(0, 15).map((s, idx) => (
                <div
                  key={s.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      <span className="font-mono text-slate-400 mr-1.5">#{idx + 1}</span>
                      {s.name}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {s.district} · {s.treesPlanted || 0} daraxt
                    </div>
                  </div>
                  <div className="font-mono tabular-nums font-bold text-amber-500 shrink-0">
                    {(s.totalCoins || 0).toLocaleString()} ECO
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-3 pr-3">#</th>
                    <th className="py-3 px-3">Maktab</th>
                    <th className="py-3 px-3">Tuman</th>
                    <th className="py-3 px-3 text-right">Daraxtlar</th>
                    <th className="py-3 pl-3 text-right">Jami EcoCoin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {regionalSchools.slice(0, 15).map((s, idx) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-3 font-mono tabular-nums text-slate-400">#{idx + 1}</td>
                      <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{s.name}</td>
                      <td className="py-3 px-3 text-slate-500">{s.district}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-500">{s.treesPlanted || 0}</td>
                      <td className="py-3 pl-3 text-right font-mono tabular-nums font-bold text-amber-500">
                        {(s.totalCoins || 0).toLocaleString()} ECO
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* District Coordinators Directory (Chat, Tasks & Ideas) */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-rose-500" />
              <span>Viloyat Tuman Koordinatorlari ({districtCoordinators.length})</span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Tuman koordinatorlariga topshiriq yuboring, g‘oya almashing yoki Telegram-chatda suhbatlashing
            </p>
          </div>
          <button
            type="button"
            onClick={() => openCoordinatorChat()}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <MessageSquare className="w-4 h-4" />
            <span>Umumiy Viloyat Kengashiga Yozish</span>
          </button>
        </div>

        {districtCoordinators.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Hozircha viloyatda tayinlangan tuman koordinatorlari topilmadi.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {districtCoordinators.map(dc => (
              <div
                key={dc.uid}
                className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-bold text-slate-900 dark:text-white truncate">{dc.fullName}</div>
                  <div className="text-[11px] text-rose-500 font-semibold truncate">{dc.district}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {dc.schoolsCount} maktab · {dc.telegramUsername || dc.phoneNumber || 'Aloqa'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openCoordinatorChat(dc.uid, dc.region)}
                  className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Send className="w-3 h-3" />
                  <span>Topshiriq / G‘oya</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real-Time Telegram Chat for Regional <-> District Coordinators */}
      <div ref={chatSectionRef}>
        <EcoTelegramChatPanel
          defaultChannelId={selectedChatChannelId}
          allowedScopes={['regional_coordinators']}
          title="Viloyat va Tuman Koordinatorlari Chati (Topshiriq, G‘oya & Rasm)"
        />
      </div>
    </div>
  );
};
