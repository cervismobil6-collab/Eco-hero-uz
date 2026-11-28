import React, { useMemo, useState } from 'react';
import { Inbox, Search, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { RegistrationApplication } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';
import { ROLE_LABELS_UZ } from './districtTypes';

interface DistrictApplicationsSectionProps {
  applications: RegistrationApplication[];
  globalSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

export const DistrictApplicationsSection: React.FC<DistrictApplicationsSectionProps> = ({
  applications,
  globalSearchQuery = '',
  onRefresh,
}) => {
  const { reviewApplication } = useEco();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'queue' | 'approved' | 'rejected' | 'all'>('queue');
  const [roleFilter, setRoleFilter] = useState<'all' | 'school_admin' | 'ambassador'>('all');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const effectiveQuery = (search || globalSearchQuery).trim().toLowerCase();

  const filtered = useMemo(() => {
    return applications
      .filter(a => {
        if (roleFilter !== 'all' && a.requestedRole !== roleFilter) return false;
        if (statusFilter === 'queue' && !['pending', 'needs_info'].includes(a.status)) return false;
        if (statusFilter === 'approved' && a.status !== 'approved') return false;
        if (statusFilter === 'rejected' && a.status !== 'rejected') return false;
        if (!effectiveQuery) return true;
        return `${a.fullName} ${a.officialSchoolName} ${a.contactInfo} ${a.verificationDetails}`
          .toLowerCase()
          .includes(effectiveQuery);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [applications, roleFilter, statusFilter, effectiveQuery]);

  const queueCount = applications.filter(a => ['pending', 'needs_info'].includes(a.status)).length;

  const handleReview = async (id: string, action: 'approve' | 'reject' | 'request_info') => {
    setBusyId(id);
    try {
      const res = await reviewApplication(id, action, reviewNotes[id]?.trim() || undefined);
      if (res.success) {
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-400" />
              <span>Arizalar va tasdiqlash ({filtered.length})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tumandagi Maktab Sardori va Eco Elchi lavozimlariga kelgan arizalar
            </p>
          </div>
          {queueCount > 0 && (
            <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 text-xs font-black tabular-nums self-start sm:self-center">
              {queueCount} ta navbatda
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nomzod ismi yoki maktab..."
              className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="queue">Kutilayotganlar ({queueCount})</option>
            <option value="approved">Tasdiqlanganlar</option>
            <option value="rejected">Rad etilganlar</option>
            <option value="all">Barchasi</option>
          </select>
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="all">Lavozim: Barchasi</option>
            <option value="school_admin">Maktab sardori</option>
            <option value="ambassador">Eco Elchi</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-400">
          Tanlangan filtr bo‘yicha arizalar topilmadi.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(app => {
            const isQueue = ['pending', 'needs_info'].includes(app.status);
            return (
              <div
                key={app.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-900 dark:text-white">{app.fullName}</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 text-[10px] font-bold">
                        {ROLE_LABELS_UZ[app.requestedRole] || app.requestedRoleName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          app.status === 'approved'
                            ? 'bg-emerald-500/15 text-emerald-500'
                            : app.status === 'rejected'
                            ? 'bg-rose-500/15 text-rose-500'
                            : 'bg-amber-500/15 text-amber-500'
                        }`}
                      >
                        {app.status === 'approved'
                          ? 'Tasdiqlangan'
                          : app.status === 'rejected'
                          ? 'Rad etilgan'
                          : app.status === 'needs_info'
                          ? "Ma'lumot so'ralgan"
                          : 'Kutilmoqda'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {app.officialSchoolName} · Aloqa: {app.contactInfo} ·{' '}
                      {new Date(app.createdAt).toLocaleDateString('uz-UZ')}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 text-slate-600 dark:text-slate-300 leading-relaxed">
                  {app.verificationDetails}
                </div>

                {app.adminNote && !isQueue && (
                  <div className="text-[11px] text-amber-500 font-semibold">Izoh: {app.adminNote}</div>
                )}

                {isQueue && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <input
                      type="text"
                      value={reviewNotes[app.id] || ''}
                      onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                      placeholder="Izoh (ixtiyoriy, rad etishda tavsiya etiladi)..."
                      className="flex-1 px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === app.id}
                        onClick={() => handleReview(app.id, 'approve')}
                        className="px-4 py-2 min-h-[40px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tasdiqlash</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === app.id}
                        onClick={() => handleReview(app.id, 'request_info')}
                        className="px-3.5 py-2 min-h-[40px] bg-amber-500/15 text-amber-500 border border-amber-500/30 rounded-xl font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>Aniqlashtirish</span>
                      </button>
                      <button
                        type="button"
                        disabled={busyId === app.id}
                        onClick={() => handleReview(app.id, 'reject')}
                        className="px-3.5 py-2 min-h-[40px] bg-rose-500/15 text-rose-500 border border-rose-500/30 rounded-xl font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rad etish</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
