import React, { useMemo, useState } from 'react';
import {
  FileWarning,
  Camera,
  Search,
  CheckCircle2,
  AlertTriangle,
  Send,
  XCircle,
  MessageSquareWarning,
  X,
  MapPin,
} from 'lucide-react';
import { EcoReport, MediaSubmission, School } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';
import { resolveMediaUrl } from '../../../utils/api';
import { REPORT_CATEGORY_LABELS, getReportStatusBadge } from './districtTypes';

interface DistrictReportsSectionProps {
  reports: EcoReport[];
  mediaSubmissions: MediaSubmission[];
  schools: School[];
  globalSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

export const DistrictReportsSection: React.FC<DistrictReportsSectionProps> = ({
  reports,
  mediaSubmissions,
  schools,
  globalSearchQuery = '',
  onRefresh,
}) => {
  const { performDistrictReportAction, reviewDistrictMedia } = useEco();

  const [viewMode, setViewMode] = useState<'reports' | 'media'>('reports');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'upvotes' | 'hazard'>('newest');

  // Report Action Modal
  const [selectedReport, setSelectedReport] = useState<EcoReport | null>(null);
  const [actionNote, setActionNote] = useState('');
  const [escalationTarget, setEscalationTarget] = useState('Tuman Ekologiya bo‘limi va Hokimiyat');
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  // Media notes
  const [mediaNotes, setMediaNotes] = useState<Record<string, string>>({});
  const [mediaCoins, setMediaCoins] = useState<Record<string, string>>({});
  const [busyMediaId, setBusyMediaId] = useState<string | null>(null);

  const effectiveQuery = (search || globalSearchQuery).trim().toLowerCase();

  const filteredReports = useMemo(() => {
    const list = reports.filter(r => {
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      if (schoolFilter !== 'all' && r.schoolId !== schoolFilter && r.schoolName !== schoolFilter) return false;
      const st = String(r.status || '').toLowerCase();
      if (statusFilter === 'pending' && !['pending', 'pending_review', 'needs_info'].includes(st)) return false;
      if (statusFilter === 'active' && !['verified', 'approved', 'in_progress', 'assigned', 'escalated'].includes(st)) return false;
      if (statusFilter === 'resolved' && st !== 'resolved') return false;
      if (statusFilter === 'rejected' && st !== 'rejected') return false;
      if (!effectiveQuery) return true;
      return `${r.title} ${r.description} ${r.schoolName || ''} ${r.address || ''} ${r.reporterName || ''}`
        .toLowerCase()
        .includes(effectiveQuery);
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'upvotes') return (b.upvotes || 0) - (a.upvotes || 0);
      if (sortBy === 'hazard') return Number(Boolean(b.isHazardous)) - Number(Boolean(a.isHazardous));
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [reports, categoryFilter, schoolFilter, statusFilter, effectiveQuery, sortBy]);

  const filteredMedia = useMemo(() => {
    return mediaSubmissions
      .filter(m => {
        if (statusFilter === 'pending' && m.status !== 'PENDING') return false;
        if (statusFilter === 'resolved' && m.status !== 'APPROVED') return false;
        if (statusFilter === 'rejected' && m.status !== 'REJECTED') return false;
        if (schoolFilter !== 'all' && m.schoolId !== schoolFilter && m.schoolName !== schoolFilter) return false;
        if (!effectiveQuery) return true;
        return `${m.userName} ${m.schoolName} ${m.description} ${m.activityCategory}`
          .toLowerCase()
          .includes(effectiveQuery);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [mediaSubmissions, statusFilter, schoolFilter, effectiveQuery]);

  const pendingReportsCount = reports.filter(r =>
    ['pending', 'pending_review', 'needs_info'].includes(String(r.status).toLowerCase())
  ).length;
  const pendingMediaCount = mediaSubmissions.filter(m => m.status === 'PENDING').length;

  const handleReportAction = async (
    report: EcoReport,
    action: 'verify' | 'assign_captain' | 'escalate' | 'request_info' | 'reject' | 'resolve'
  ) => {
    setBusyReportId(report.id);
    try {
      const res = await performDistrictReportAction(report.id, action, {
        note: actionNote.trim() || undefined,
        escalationTarget: action === 'escalate' ? escalationTarget : undefined,
      });
      if (res.success) {
        setSelectedReport(null);
        setActionNote('');
        await onRefresh();
      }
    } finally {
      setBusyReportId(null);
    }
  };

  const handleMediaAction = async (
    sub: MediaSubmission,
    decision: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION'
  ) => {
    setBusyMediaId(sub.id);
    try {
      const customRaw = mediaCoins[sub.id];
      const customVal = customRaw && !Number.isNaN(Number(customRaw)) ? Number(customRaw) : undefined;
      const res = await reviewDistrictMedia(sub.id, decision, mediaNotes[sub.id]?.trim() || undefined, customVal);
      if (res.success) {
        await onRefresh();
      }
    } finally {
      setBusyMediaId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Ekologik hisobotlar va Media</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Muammolarni tasdiqlash, maktab sardoriga yo‘naltirish, eskalatsiya va eko-media ko‘rigi
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-[#040D0A] p-1 rounded-xl border border-slate-200 dark:border-emerald-500/20 self-start">
            <button
              type="button"
              onClick={() => setViewMode('reports')}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                viewMode === 'reports'
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B]'
                  : 'text-slate-500 dark:text-slate-300'
              }`}
            >
              <FileWarning className="w-3.5 h-3.5" />
              <span>Hisobotlar ({reports.length})</span>
              {pendingReportsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] tabular-nums">{pendingReportsCount}</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setViewMode('media')}
              className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-black flex items-center gap-1.5 cursor-pointer transition-all ${
                viewMode === 'media'
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B]'
                  : 'text-slate-500 dark:text-slate-300'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Eko-Media ({mediaSubmissions.length})</span>
              {pendingMediaCount > 0 && (
                <span className="px-1.5 py-0.2 rounded bg-black/20 text-[10px] tabular-nums">{pendingMediaCount}</span>
              )}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Muammo, manzil yoki maktab..."
              className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="all">Holat: Barchasi</option>
            <option value="pending">Kutilayotganlar</option>
            {viewMode === 'reports' && <option value="active">Jarayonda / Eskalatsiya</option>}
            <option value="resolved">Hal etilgan / Tasdiqlangan</option>
            <option value="rejected">Rad etilgan</option>
          </select>

          <select
            value={schoolFilter}
            onChange={e => setSchoolFilter(e.target.value)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="all">Maktab: Barchasi</option>
            {schools.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {viewMode === 'reports' ? (
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
            >
              <option value="newest">Saralash: Eng yangi</option>
              <option value="hazard">Xavfli holatlar birinchi</option>
              <option value="upvotes">Ovozlar soni bo‘yicha</option>
            </select>
          ) : (
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
            >
              <option value="all">Toifa: Barchasi</option>
              {Object.entries(REPORT_CATEGORY_LABELS).map(([k, lbl]) => (
                <option key={k} value={k}>
                  {lbl}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {viewMode === 'reports' ? (
        filteredReports.length === 0 ? (
          <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-400">
            Tumanda ekologik hisobotlar topilmadi.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {filteredReports.map(rep => {
              const badge = getReportStatusBadge(rep.status);
              const isFinal = ['resolved', 'rejected'].includes(String(rep.status).toLowerCase());
              return (
                <div
                  key={rep.id}
                  className="rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden flex flex-col text-xs"
                >
                  <div className="relative aspect-video bg-slate-100 dark:bg-[#040D0A]">
                    {rep.videoUrl ? (
                      <video src={resolveMediaUrl(rep.videoUrl)} controls className="w-full h-full object-cover" />
                    ) : (
                      <img src={resolveMediaUrl(rep.imageUrl)} alt={rep.title} className="w-full h-full object-cover" />
                    )}
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 text-white text-[10px] font-bold">
                      {REPORT_CATEGORY_LABELS[rep.category] || rep.category}
                    </span>
                    <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md border text-[10px] font-black ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="p-4 space-y-2.5 flex-1 flex flex-col">
                    {rep.isHazardous && (
                      <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[11px] font-bold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Xavfli holat: mutasaddilar nazorati zarur</span>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-black line-clamp-1 text-slate-900 dark:text-white">{rep.title}</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-300 line-clamp-2 mt-0.5">
                        {rep.description}
                      </p>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-0.5 mt-auto pt-2 border-t border-slate-100 dark:border-emerald-500/15">
                      <div className="font-semibold text-slate-600 dark:text-slate-300 truncate">
                        {rep.schoolName || 'Maktab ko‘rsatilmagan'} · {rep.reporterName}
                      </div>
                      {rep.address && (
                        <div className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span className="truncate">{rep.address}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedReport(rep);
                        setActionNote('');
                      }}
                      className={`w-full py-2.5 min-h-[40px] rounded-xl font-black cursor-pointer transition-all ${
                        isFinal
                          ? 'bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
                          : 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                      }`}
                    >
                      {isFinal ? 'Tafsilotlar' : 'Ko‘rib chiqish va chora'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : filteredMedia.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-400">
          Tumanda eko-media loyihalar topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredMedia.map(sub => {
            const isPending = sub.status === 'PENDING' || sub.status === 'NEEDS_REVISION';
            return (
              <div
                key={sub.id}
                className="rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden flex flex-col text-xs"
              >
                <div className="relative aspect-video bg-slate-100 dark:bg-[#040D0A]">
                  {sub.mediaType === 'video' ? (
                    <video src={resolveMediaUrl(sub.mediaUrl)} controls className="w-full h-full object-cover" />
                  ) : (
                    <img src={resolveMediaUrl(sub.mediaUrl)} alt={sub.description} className="w-full h-full object-cover" />
                  )}
                  <span
                    className={`absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-md text-[10px] font-black ${
                      sub.status === 'APPROVED'
                        ? 'bg-emerald-500 text-white'
                        : sub.status === 'REJECTED'
                        ? 'bg-rose-500 text-white'
                        : 'bg-amber-500 text-[#04110B]'
                    }`}
                  >
                    {sub.status}
                  </span>
                </div>
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  <div>
                    <div className="font-black text-sm text-slate-900 dark:text-white">{sub.userName}</div>
                    <div className="text-[11px] text-slate-500">{sub.schoolName} · {sub.activityCategory}</div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 line-clamp-2">{sub.description}</p>
                  {isPending && (
                    <div className="space-y-2 mt-auto pt-2 border-t border-slate-100 dark:border-emerald-500/15">
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          value={mediaNotes[sub.id] || ''}
                          onChange={e => setMediaNotes(prev => ({ ...prev, [sub.id]: e.target.value }))}
                          placeholder="Izoh..."
                          className="col-span-2 px-3 py-2 min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
                        />
                        <input
                          type="number"
                          value={mediaCoins[sub.id] || ''}
                          onChange={e => setMediaCoins(prev => ({ ...prev, [sub.id]: e.target.value }))}
                          placeholder="EcoCoin"
                          className="px-2.5 py-2 min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none font-mono"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busyMediaId === sub.id}
                          onClick={() => handleMediaAction(sub, 'APPROVED')}
                          className="flex-1 py-2 min-h-[38px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black cursor-pointer disabled:opacity-50"
                        >
                          Tasdiqlash
                        </button>
                        <button
                          type="button"
                          disabled={busyMediaId === sub.id}
                          onClick={() => handleMediaAction(sub, 'NEEDS_REVISION')}
                          className="px-3 py-2 min-h-[38px] bg-amber-500/15 text-amber-500 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                        >
                          Qayta
                        </button>
                        <button
                          type="button"
                          disabled={busyMediaId === sub.id}
                          onClick={() => handleMediaAction(sub, 'REJECTED')}
                          className="px-3 py-2 min-h-[38px] bg-rose-500/15 text-rose-500 rounded-xl font-bold cursor-pointer disabled:opacity-50"
                        >
                          Rad
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Report Coordinator Action Modal */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/30 p-5 space-y-4 text-xs my-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">{selectedReport.title}</h3>
                <p className="text-[11px] text-slate-500">
                  {selectedReport.schoolName} · {selectedReport.reporterName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-emerald-500/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="aspect-video rounded-2xl overflow-hidden bg-slate-100 dark:bg-[#040D0A]">
              {selectedReport.videoUrl ? (
                <video src={resolveMediaUrl(selectedReport.videoUrl)} controls className="w-full h-full object-cover" />
              ) : (
                <img src={resolveMediaUrl(selectedReport.imageUrl)} alt={selectedReport.title} className="w-full h-full object-cover" />
              )}
            </div>

            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{selectedReport.description}</p>

            {selectedReport.statusHistory && selectedReport.statusHistory.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 space-y-1 max-h-32 overflow-y-auto">
                <div className="text-[10px] font-black uppercase text-slate-400">Jarayon tarixi</div>
                {selectedReport.statusHistory.map((h, i) => (
                  <div key={i} className="text-[11px] flex justify-between gap-2">
                    <span className="font-bold text-emerald-500">{h.status} · {h.actorName}</span>
                    <span className="text-slate-400 tabular-nums">
                      {new Date(h.timestamp).toLocaleDateString('uz-UZ')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-emerald-500/15">
              <textarea
                rows={2}
                value={actionNote}
                onChange={e => setActionNote(e.target.value)}
                placeholder="Ko‘rsatma yoki qaror izohi (sardorga topshiriq / rad etish sababi)..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
              />
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Eskalatsiya manzili (zarur bo‘lganda)
                </label>
                <input
                  type="text"
                  value={escalationTarget}
                  onChange={e => setEscalationTarget(e.target.value)}
                  className="w-full px-3 py-2 min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={busyReportId === selectedReport.id}
                  onClick={() => handleReportAction(selectedReport, 'verify')}
                  className="py-2.5 min-h-[40px] rounded-xl bg-sky-500/15 text-sky-500 border border-sky-500/30 font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Tasdiqlash</span>
                </button>
                <button
                  type="button"
                  disabled={busyReportId === selectedReport.id}
                  onClick={() => handleReportAction(selectedReport, 'assign_captain')}
                  className="py-2.5 min-h-[40px] rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Sardorga</span>
                </button>
                <button
                  type="button"
                  disabled={busyReportId === selectedReport.id}
                  onClick={() => handleReportAction(selectedReport, 'resolve')}
                  className="py-2.5 min-h-[40px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 font-black flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Hal etildi</span>
                </button>
                <button
                  type="button"
                  disabled={busyReportId === selectedReport.id}
                  onClick={() => handleReportAction(selectedReport, 'escalate')}
                  className="py-2.5 min-h-[40px] rounded-xl bg-rose-500/15 text-rose-500 border border-rose-500/30 font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Eskalatsiya</span>
                </button>
                <button
                  type="button"
                  disabled={busyReportId === selectedReport.id}
                  onClick={() => handleReportAction(selectedReport, 'request_info')}
                  className="py-2.5 min-h-[40px] rounded-xl bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <MessageSquareWarning className="w-3.5 h-3.5" />
                  <span>Aniqlash</span>
                </button>
                <button
                  type="button"
                  disabled={busyReportId === selectedReport.id}
                  onClick={() => handleReportAction(selectedReport, 'reject')}
                  className="py-2.5 min-h-[40px] rounded-xl bg-slate-200 dark:bg-[#040D0A] text-rose-500 border border-slate-300 dark:border-rose-500/25 font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Rad etish</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
