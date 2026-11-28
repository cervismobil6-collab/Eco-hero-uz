import React from 'react';
import {
  Globe,
  Building2,
  GraduationCap,
  Users,
  CheckCircle2,
  Inbox,
  AlertTriangle,
  ArrowRight,
  Bell,
  Clock,
  Sparkles,
  Trophy,
  Award,
} from 'lucide-react';
import {
  AuditLog,
  Notification,
  RegionalCommandSummaryResponse,
  RegionalSectionId,
} from '../../../types/eco';
import regionalCommandHeroImg from '../../../assets/images/regional_command_hero_1795859012840.jpg';
import realisticAvatarImg from '../../../assets/images/profile_avatar_realistic_1795605008121.jpg';

interface RegionalOverviewSectionProps {
  region: string;
  summary: RegionalCommandSummaryResponse | null;
  notifications: Notification[];
  auditLogs: AuditLog[];
  onNavigate: (section: RegionalSectionId) => void;
  onMarkNotificationRead: (id: string) => void;
}

export const RegionalOverviewSection: React.FC<RegionalOverviewSectionProps> = ({
  region,
  summary,
  notifications,
  auditLogs,
  onNavigate,
  onMarkNotificationRead,
}) => {
  const totals = summary?.totals || {
    districtsTotal: 0,
    districtsWithCoordinator: 0,
    coordinatorsCount: 0,
    schoolsCount: 0,
    studentsCount: 0,
    captainsCount: 0,
    ambassadorsCount: 0,
    totalReports: 0,
    resolvedReports: 0,
    pendingReports: 0,
    escalatedReports: 0,
    pendingApplications: 0,
    totalCoins: 0,
    treesPlanted: 0,
  };

  const districts = summary?.districts || [];
  const topDistricts = [...districts].slice(0, 6);
  const maxDistrictCoins = Math.max(1, ...topDistricts.map(d => d.totalCoins || 0));
  const unreadNotifs = notifications.filter(n => !n.read);

  const urgentItems = [
    totals.pendingApplications > 0 && {
      id: 'apps',
      title: `${totals.pendingApplications} ta yangi ariza kutmoqda`,
      desc: "Tuman koordinatori, maktab sardori va Eco Elchi arizalari ko‘rib chiqilishini kutmoqda",
      section: 'regional_coordinators' as RegionalSectionId,
      tone: 'amber' as const,
    },
    totals.escalatedReports > 0 && {
      id: 'escalated',
      title: `${totals.escalatedReports} ta shoshilinch ekologik holat`,
      desc: "Xavfli yoki viloyat darajasida eskalatsiya qilingan muammolarni zudlik bilan nazorat qiling",
      section: 'regional_eco_control' as RegionalSectionId,
      tone: 'rose' as const,
    },
    totals.pendingReports > 0 && {
      id: 'pending_reports',
      title: `${totals.pendingReports} ta ko‘rib chiqilayotgan muammo`,
      desc: "Oldingi va keyingi natijalarni tekshiring yoki tuman koordinatoriga qayta yo‘naltiring",
      section: 'regional_eco_control' as RegionalSectionId,
      tone: 'sky' as const,
    },
  ].filter(Boolean) as {
    id: string;
    title: string;
    desc: string;
    section: RegionalSectionId;
    tone: 'amber' | 'rose' | 'sky';
  }[];

  const kpiCards = [
    {
      label: 'Tuman va shaharlar',
      value: totals.districtsTotal.toLocaleString(),
      sub: `${totals.districtsWithCoordinator} tasida koordinator bor`,
      icon: Globe,
      color: 'text-emerald-500',
      target: 'regional_map' as RegionalSectionId,
    },
    {
      label: 'Maktablar',
      value: totals.schoolsCount.toLocaleString(),
      sub: `${totals.captainsCount} ta sardor faol`,
      icon: Building2,
      color: 'text-sky-500',
      target: 'regional_schools_students' as RegionalSectionId,
    },
    {
      label: 'O‘quvchilar',
      value: totals.studentsCount.toLocaleString(),
      sub: `${totals.ambassadorsCount} nafar Eco Elchi`,
      icon: GraduationCap,
      color: 'text-indigo-400',
      target: 'regional_schools_students' as RegionalSectionId,
    },
    {
      label: 'Faol koordinatorlar',
      value: totals.coordinatorsCount.toLocaleString(),
      sub: `${totals.pendingApplications} ta ariza navbatda`,
      icon: Users,
      color: 'text-teal-400',
      target: 'regional_coordinators' as RegionalSectionId,
    },
    {
      label: 'Hal qilingan muammo',
      value: `${totals.resolvedReports} / ${totals.totalReports}`,
      sub: `${totals.pendingReports} ta jarayonda`,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      target: 'regional_eco_control' as RegionalSectionId,
    },
    {
      label: 'Viloyat EcoCoin',
      value: totals.totalCoins.toLocaleString(),
      sub: `${totals.treesPlanted.toLocaleString()} ta ko‘chat ekilgan`,
      icon: Award,
      color: 'text-amber-500',
      target: 'regional_championship' as RegionalSectionId,
    },
  ];

  const logsToDisplay = auditLogs.length > 0 ? auditLogs : summary?.recentAuditLogs || [];

  return (
    <div className="space-y-4">
      {/* Real-Photography Command Hero Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#051811] text-white shadow-xl">
        <img
          src={regionalCommandHeroImg}
          alt={region}
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#04110B]/95 via-[#061812]/85 to-[#061812]/65" />
        <div className="relative p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="text-[11px] font-black uppercase tracking-widest text-[#00F5A0]">
              Regional Command Center · Viloyat Boshqaruvi
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">{region}</h2>
            <p className="text-xs sm:text-sm text-emerald-100/80 leading-relaxed">
              Tuman koordinatorlari, maktablar, ekologik nazorat, viloyat xaritasi va AI strategik tahlil yagona boshqaruv markazida.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('regional_ai_analyst')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#072419]/90 hover:bg-[#0a3022] border border-emerald-400/40 text-emerald-200 text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Sparkles className="w-4 h-4 text-[#00F5A0]" />
              <span>AI Tahlilchidan so‘rash</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('regional_announcements')}
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] border-b-[3px] border-emerald-700 active:translate-y-[1px] text-xs font-black inline-flex items-center gap-2 cursor-pointer"
            >
              <Inbox className="w-4 h-4" />
              <span>Tumanlarga e&apos;lon yuborish</span>
            </button>
          </div>
        </div>
      </div>

      {/* Compact 6-Card KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {kpiCards.map(card => (
          <button
            key={card.label}
            type="button"
            onClick={() => onNavigate(card.target)}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400/60 transition-all text-left space-y-1 cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span className="truncate">{card.label}</span>
              <card.icon className={`w-4 h-4 shrink-0 ${card.color}`} />
            </div>
            <div className="text-lg sm:text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
              {card.value}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-emerald-100/60 truncate tabular-nums">
              {card.sub}
            </div>
          </button>
        ))}
      </div>

      {/* Urgent Action Strips */}
      {urgentItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {urgentItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.section)}
              className={`p-3.5 rounded-2xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
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

      {/* Most Active Districts + Unread Notifications & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Eng faol tumanlar</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('regional_map')}
              className="text-xs font-bold text-emerald-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Xaritada ko‘rish</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {topDistricts.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">Tumanlar bo‘yicha ma’lumotlar yuklanmoqda...</p>
          ) : (
            <div className="space-y-3">
              {topDistricts.map((d, idx) => {
                const pct = Math.max(8, Math.round(((d.totalCoins || 0) / maxDistrictCoins) * 100));
                return (
                  <div key={d.district} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono tabular-nums font-black text-slate-400">#{idx + 1}</span>
                        <img
                          src={d.coordinator?.avatarUrl || realisticAvatarImg}
                          alt={d.coordinator?.fullName || d.district}
                          className="w-6 h-6 rounded-full object-cover border border-emerald-500/30 shrink-0"
                        />
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 dark:text-white truncate">{d.district}</span>
                          <span className="text-[11px] text-slate-500 ml-1.5 hidden sm:inline">
                            · {d.coordinator ? d.coordinator.fullName : 'Koordinator tayinlanmagan'}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                        {d.schoolsCount} maktab · {d.resolvedReports} hal ·{' '}
                        <b className="text-emerald-500">{d.totalCoins.toLocaleString()} ECO</b>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-[#040D0A] overflow-hidden border border-emerald-500/15">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#00F5A0] to-[#10B981]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 space-y-4">
          {/* Unread Notifications */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-500" />
                <span>Muhim bildirishnomalar ({unreadNotifs.length})</span>
              </h3>
            </div>
            {unreadNotifs.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">Yangi bildirishnomalar yo‘q.</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {unreadNotifs.slice(0, 5).map(n => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex items-start justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{n.title}</div>
                      <p className="text-[11px] text-slate-500 line-clamp-2">{n.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onMarkNotificationRead(n.id)}
                      className="text-[11px] font-bold text-emerald-500 hover:underline shrink-0 cursor-pointer"
                    >
                      O‘qildi
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Regional Audit / Activity */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-500" />
              <span>So‘nggi viloyat faoliyatlari</span>
            </h3>
            {logsToDisplay.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-500">So‘nggi amallar qayd etilmagan.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {logsToDisplay.slice(0, 8).map(log => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/80 dark:border-emerald-500/15 text-xs flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">
                        {log.actorName} · <span className="text-emerald-500">{log.action}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {log.details?.district || log.details?.region || log.targetCollection}
                        {log.details?.title ? ` · ${log.details.title}` : ''}
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
    </div>
  );
};
