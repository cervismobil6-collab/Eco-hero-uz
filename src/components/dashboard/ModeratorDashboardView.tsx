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
    <div className="space-y-6">
      {/* Moderator Header */}
      <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-sky-600 dark:text-sky-400">
              Moderator Kabineti · Respublika Nazorat Markazi
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              {user.fullName} — Media va Muammolar Moderatsiyasi
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Foto/video hisobotlarni tekshirish, 6-bosqichli ekologik muammo jarayonini boshqarish va xavfli holatlarni eskalatsiya qilish.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('media_moderation')}
            className="px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Media Navbati ({stats.pendingMedia})</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('problem_workflow')}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Muammo 6-Bosqich ({stats.pendingReports})</span>
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Kutilayotgan medialar</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-amber-500">{stats.pendingMedia}</div>
          <div className="text-[11px] text-slate-500">Tasdiqlangan: {stats.approvedMedia}</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Yangi muammolar</span>
            <AlertTriangle className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-sky-500">{stats.pendingReports}</div>
          <div className="text-[11px] text-slate-500">Hal etilgan: {stats.resolvedReports}</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Xavfli holatlar</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-rose-500">{stats.hazardousReports}</div>
          <div className="text-[11px] text-slate-500">Mutaxassislarga yo‘naltiriladi</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
          <div className="text-xs text-slate-500 flex items-center justify-between">
            <span>Faol vaucherlar</span>
            <QrCode className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-500">{stats.pendingVouchers}</div>
          <div className="text-[11px] text-slate-500">Tekshiruv uchun ochiq</div>
        </div>
      </div>

      {/* Quick Workspaces */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('media_moderation')}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-sky-500 text-left space-y-2 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-sky-500">
            <Camera className="w-5 h-5" />
            <ArrowRight className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">Eko-Media Tekshiruvi</div>
          <p className="text-xs text-slate-500">O‘quvchilar va Eko-Elchilar yuborgan foto/videolarni ko‘rib EcoCoin bering.</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('problem_workflow')}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500 text-left space-y-2 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-amber-500">
            <CheckCircle2 className="w-5 h-5" />
            <ArrowRight className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">6-Bosqich Muammo Nazorati</div>
          <p className="text-xs text-slate-500">Muammolarni tasdiqlang, maktab sardorlariga yuboring yoki xavfli holatlarni ajrating.</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('team_chat')}
          className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500 text-left space-y-2 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-emerald-500">
            <MessageSquare className="w-5 h-5" />
            <ArrowRight className="w-4 h-4" />
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white">Suhbat & Topshiriqlar</div>
          <p className="text-xs text-slate-500">Jamoa va foydalanuvchilar bilan real vaqtda muloqot qiling.</p>
        </button>
      </div>
    </div>
  );
};
