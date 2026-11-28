import React from 'react';
import {
  Building2,
  GraduationCap,
  Inbox,
  FileWarning,
  Users,
  AlertTriangle,
  Trophy,
  ArrowRight,
  Clock,
  CheckCircle2,
  ShieldCheck,
  Bell,
  Sparkles,
} from 'lucide-react';
import {
  AuditLog,
  DistrictLeaderboardDetailsResponse,
  DistrictSectionId,
  DistrictUserGrowthResponse,
  EcoReport,
  MediaSubmission,
  Notification,
  RegistrationApplication,
  RosterCaptainEntry,
  School,
} from '../../../types/eco';

interface DistrictOverviewSectionProps {
  region: string;
  district: string;
  schools: School[];
  totalStudents: number;
  captains: RosterCaptainEntry[];
  ambassadorsCount: number;
  applications: RegistrationApplication[];
  reports: EcoReport[];
  mediaSubmissions: MediaSubmission[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  districtDetails: DistrictLeaderboardDetailsResponse | null;
  userGrowth: DistrictUserGrowthResponse | null;
  onNavigate: (section: DistrictSectionId) => void;
  onMarkNotificationRead: (id: string) => void;
}

export const DistrictOverviewSection: React.FC<DistrictOverviewSectionProps> = ({
  region,
  district,
  schools,
  totalStudents,
  captains,
  ambassadorsCount,
  applications,
  reports,
  mediaSubmissions,
  notifications,
  auditLogs,
  districtDetails,
  userGrowth,
  onNavigate,
  onMarkNotificationRead,
}) => {
  const pendingApps = applications.filter(a => ['pending', 'needs_info'].includes(a.status));
  const pendingReports = reports.filter(r =>
    ['pending', 'PENDING_REVIEW', 'NEEDS_INFO', 'in_progress', 'ASSIGNED', 'ESCALATED'].includes(r.status)
  );
  const hazardousPending = pendingReports.filter(r => r.isHazardous || r.status === 'ESCALATED');
  const pendingMedia = mediaSubmissions.filter(m => m.status === 'PENDING');
  const resolvedReports = reports.filter(r => ['resolved', 'RESOLVED'].includes(r.status));
  const totalDistrictCoins = schools.reduce((sum, s) => sum + (s.totalCoins || 0), 0);
  const unreadNotifs = notifications.filter(n => !n.read);

  const urgentItems = [
    pendingApps.length > 0 && {
      id: 'apps',
      title: `${pendingApps.length} ta yangi ariza ko‘rib chiqilmoqda`,
      desc: "Maktab sardori va Eco Elchi nomzodlarini tasdiqlash kutilmoqda",
      section: 'district_applications' as DistrictSectionId,
      tone: 'amber',
    },
    hazardousPending.length > 0 && {
      id: 'hazard',
      title: `${hazardousPending.length} ta shoshilinch / xavfli muammo`,
      desc: "Tezkor chora yoki mutasaddilarga eskalatsiya talab etiladi",
      section: 'district_reports' as DistrictSectionId,
      tone: 'rose',
    },
    pendingReports.length > 0 && {
      id: 'reports',
      title: `${pendingReports.length} ta faol ekologik hisobot`,
      desc: pendingMedia.length > 0 ? `+ ${pendingMedia.length} ta eko-media tekshiruvi kutilmoqda` : "Tekshirish va maktab sardoriga yo‘naltirish mumkin",
      section: 'district_reports' as DistrictSectionId,
      tone: 'sky',
    },
  ].filter(Boolean) as { id: string; title: string; desc: string; section: DistrictSectionId; tone: 'amber' | 'rose' | 'sky' }[];

  const quickNavCards: { id: DistrictSectionId; label: string; count: string | number; icon: typeof Building2; accent: string }[] = [
    { id: 'district_schools', label: 'Maktablar', count: schools.length, icon: Building2, accent: 'text-emerald-400' },
    { id: 'district_students', label: 'O‘quvchilar', count: totalStudents.toLocaleString(), icon: GraduationCap, accent: 'text-sky-400' },
    { id: 'district_captains', label: 'Sardorlar', count: captains.length, icon: ShieldCheck, accent: 'text-indigo-400' },
    { id: 'district_ambassadors', label: 'Eco Elchilar', count: ambassadorsCount, icon: Users, accent: 'text-teal-400' },
  ];

  const myGrowth = userGrowth?.myDistrictRank;

  return (
    <div className="space-y-4">
      {/* Compact Header Strip */}
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
            Tuman Boshqaruv Markazi · {region}
          </div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight truncate">{district}</h2>
          <p className="text-xs text-slate-300">
            Maktablar, kadrlar, ekologik hisobotlar va reytinglar yagona tizimda.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {myGrowth && (
            <button
              type="button"
              onClick={() => onNavigate('district_ratings')}
              className="px-3.5 py-2 min-h-[40px] rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center gap-1.5 hover:bg-amber-500/25 transition-colors cursor-pointer tabular-nums"
            >
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Tumanlar reytingi: #{myGrowth.rank}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('district_announcements')}
            className="px-4 py-2 min-h-[40px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 text-xs font-black flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>E'lon yuborish</span>
          </button>
        </div>
      </div>

      {/* Prominent Urgent Alerts */}
      {urgentItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {urgentItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.section)}
              className={`p-3.5 rounded-2xl border text-left transition-all flex items-start justify-between gap-2.5 cursor-pointer ${
                item.tone === 'rose'
                  ? 'bg-rose-500/10 border-rose-500/35 hover:bg-rose-500/15'
                  : item.tone === 'amber'
                  ? 'bg-amber-500/10 border-amber-500/35 hover:bg-amber-500/15'
                  : 'bg-sky-500/10 border-sky-500/35 hover:bg-sky-500/15'
              }`}
            >
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                  <AlertTriangle
                    className={`w-3.5 h-3.5 shrink-0 ${
                      item.tone === 'rose'
                        ? 'text-rose-500'
                        : item.tone === 'amber'
                        ? 'text-amber-500'
                        : 'text-sky-500'
                    }`}
                  />
                  <span className="truncate">{item.title}</span>
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2">{item.desc}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            </button>
          ))}
        </div>
      )}

      {/* Compact KPI Grid (4 primary cards + 4 quick-jump mini tiles) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Jami EcoCoin</span>
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {totalDistrictCoins.toLocaleString()}
          </div>
          <div className="text-[10px] text-slate-400 tabular-nums">
            {schools.length} ta maktab jamg‘armasi
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Hal etilgan muammo</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
            {resolvedReports.length}{' '}
            <span className="text-xs font-semibold text-slate-400">/ {reports.length}</span>
          </div>
          <div className="text-[10px] text-slate-400 tabular-nums">
            Kutilmoqda: {pendingReports.length}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Arizalar navbati</span>
            <Inbox className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-amber-500">
            {pendingApps.length}
          </div>
          <div className="text-[10px] text-slate-400 tabular-nums">
            Media kutilmoqda: {pendingMedia.length}
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Oy yakunigacha</span>
            <Clock className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
            {districtDetails?.daysRemainingInMonth ?? 0} kun
          </div>
          <div className="text-[10px] text-slate-400 truncate">
            {districtDetails?.alreadyAwardedThisMonth ? 'Mukofot berilgan ✓' : 'TOP-3 taqdirlash'}
          </div>
        </div>
      </div>

      {/* Quick Section Access */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {quickNavCards.map(card => (
          <button
            key={card.id}
            type="button"
            onClick={() => onNavigate(card.id)}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400/60 transition-all text-left flex items-center justify-between gap-2 cursor-pointer min-h-[64px]"
          >
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{card.label}</div>
              <div className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white">{card.count}</div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex items-center justify-center shrink-0">
              <card.icon className={`w-4 h-4 ${card.accent}`} />
            </div>
          </button>
        ))}
      </div>

      {/* Unread Notifications + Recent District Audit Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Notifications */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black">Bildirishnomalar</h3>
              {unreadNotifs.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 text-[10px] font-black tabular-nums">
                  {unreadNotifs.length} yangi
                </span>
              )}
            </div>
            {unreadNotifs.length > 0 && (
              <button
                type="button"
                onClick={() => onMarkNotificationRead('__all__')}
                className="text-[11px] font-bold text-emerald-500 hover:underline cursor-pointer"
              >
                Barchasini o‘qish
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">Hozircha bildirishnomalar yo‘q.</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {notifications.slice(0, 6).map(n => (
                <div
                  key={n.id}
                  onClick={() => !n.read && onMarkNotificationRead(n.id)}
                  className={`p-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                    n.read
                      ? 'bg-slate-50 dark:bg-[#040D0A] border-slate-200/70 dark:border-emerald-500/10 opacity-75'
                      : 'bg-emerald-500/10 border-emerald-500/35'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 dark:text-white truncate">{n.title}</span>
                    <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                      {new Date(n.createdAt).toLocaleDateString('uz-UZ')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{n.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-black">So‘nggi tuman amallari</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('district_settings')}
              className="text-[11px] font-bold text-emerald-500 hover:underline cursor-pointer"
            >
              Audit jurnali →
            </button>
          </div>
          {auditLogs.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">Hozircha audit yozuvlari mavjud emas.</div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {auditLogs.slice(0, 6).map((log, idx) => (
                <div
                  key={log.id || idx}
                  className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">{log.action}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {log.actorName} · {log.targetCollection}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0 tabular-nums">
                    {new Date(log.timestamp).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
