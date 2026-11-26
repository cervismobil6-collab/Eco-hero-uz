import React, { useMemo } from 'react';
import {
  Camera,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  QrCode,
  MessageSquare,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import cabinetModeratorShieldImg from '../../assets/images/cabinet_moderator_shield_1795687841760.jpg';

interface ModeratorDashboardViewProps {
  onNavigateTab: (tab: string) => void;
}

export const ModeratorDashboardView: React.FC<ModeratorDashboardViewProps> = ({ onNavigateTab }) => {
  const { user, mediaSubmissions, reports, shopOrders } = useEco();

  const stats = useMemo(() => {
    const pendingMedia = mediaSubmissions.filter(m => m.status === 'PENDING' || m.status === 'NEEDS_REVISION').length;
    const approvedMedia = mediaSubmissions.filter(m => m.status === 'APPROVED').length;
    const pendingReports = reports.filter(r =>
      ['pending', 'PENDING_REVIEW', 'NEEDS_INFO'].includes(r.status)
    ).length;
    const hazardousReports = reports.filter(
      r => r.isHazardous && !['resolved', 'RESOLVED', 'rejected', 'REJECTED'].includes(r.status)
    ).length;
    const resolvedReports = reports.filter(r => ['resolved', 'RESOLVED'].includes(r.status)).length;
    const pendingVouchers = shopOrders.filter(o => o.status === 'pending' || o.status === 'approved').length;

    return {
      pendingMedia,
      approvedMedia,
      pendingReports,
      hazardousReports,
      resolvedReports,
      pendingVouchers,
    };
  }, [mediaSubmissions, reports, shopOrders]);

  return (
    <div className="space-y-4">
      {/* Moderator Header */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src={cabinetModeratorShieldImg}
            alt="Moderator Markazi"
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl object-cover border border-emerald-400/35 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-[11px] font-black text-emerald-400 uppercase tracking-wider">
              Moderator Kabineti · Respublika Nazorat Markazi
            </div>
            <h2 className="text-lg sm:text-2xl font-extrabold tracking-tight truncate">
              {user.fullName} — Media va Muammo Nazorati
            </h2>
            <p className="text-xs text-slate-300/80 line-clamp-2">
              Foto/video hisobotlarni tekshirish, muammo jarayonini boshqarish va xavfli holatlarni eskalatsiya qilish.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('media_moderation')}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] border-b-[3px] border-emerald-700 active:translate-y-[1px] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span className="tabular-nums">Media Navbati ({stats.pendingMedia})</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('problem_workflow')}
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-[#04110B] border-b-[3px] border-amber-700 active:translate-y-[1px] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            <span className="tabular-nums">Muammolar ({stats.pendingReports})</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Kutilayotgan medialar</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-500">{stats.pendingMedia}</div>
          <div className="text-[11px] text-slate-500 tabular-nums">Tasdiqlangan: {stats.approvedMedia}</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Yangi muammolar</span>
            <AlertTriangle className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-sky-400">{stats.pendingReports}</div>
          <div className="text-[11px] text-slate-500 tabular-nums">Hal etilgan: {stats.resolvedReports}</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Xavfli holatlar</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-rose-500">{stats.hazardousReports}</div>
          <div className="text-[11px] text-slate-500">Mutaxassislarga yo‘naltiriladi</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
            <span>Faol vaucherlar</span>
            <QrCode className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-500">{stats.pendingVouchers}</div>
          <div className="text-[11px] text-slate-500">Tekshiruv uchun ochiq</div>
        </div>
      </div>

      {/* Quick Workspaces */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onNavigateTab('media_moderation')}
          className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400 text-left space-y-1.5 transition-colors cursor-pointer min-h-[44px]"
        >
          <div className="flex items-center justify-between text-sky-400">
            <Camera className="w-5 h-5" />
            <ArrowRight className="w-4 h-4" />
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-white">Eko-Media Tekshiruvi</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">O‘quvchilar va Eko-Elchilar yuborgan foto/videolarni ko‘rib EcoCoin bering.</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('problem_workflow')}
          className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400 text-left space-y-1.5 transition-colors cursor-pointer min-h-[44px]"
        >
          <div className="flex items-center justify-between text-amber-500">
            <CheckCircle2 className="w-5 h-5" />
            <ArrowRight className="w-4 h-4" />
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-white">6-Bosqich Muammo Nazorati</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Muammolarni tasdiqlang, maktab sardorlariga yuboring yoki xavfli holatlarni ajrating.</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('team_chat')}
          className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400 text-left space-y-1.5 transition-colors cursor-pointer min-h-[44px]"
        >
          <div className="flex items-center justify-between text-emerald-400">
            <MessageSquare className="w-5 h-5" />
            <ArrowRight className="w-4 h-4" />
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-white">Suhbat & Topshiriqlar</div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Jamoa va foydalanuvchilar bilan real vaqtda muloqot qiling.</p>
        </button>
      </div>
    </div>
  );
};
