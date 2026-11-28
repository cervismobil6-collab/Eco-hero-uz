import React, { useMemo, useState } from 'react';
import {
  ShieldAlert,
  Search,
  CheckCircle2,
  Send,
  AlertTriangle,
  XCircle,
  Eye,
  Clock,
  MapPin,
} from 'lucide-react';
import { EcoReport, RegionalDistrictSummary } from '../../../types/eco';
import { REPORT_CATEGORY_LABELS } from '../district/districtTypes';
import { getRegionalStatusLabel } from './regionalTypes';
import { resolveMediaUrl } from '../../../utils/api';

interface RegionalEcoControlSectionProps {
  region: string;
  districts: RegionalDistrictSummary[];
  reports: EcoReport[];
  globalSearchQuery: string;
  initialDistrictFilter?: string;
  onDispatchReport: (
    reportId: string,
    action: 'dispatch_to_district' | 'verify' | 'resolve' | 'escalate' | 'request_info' | 'reject',
    payload?: { note?: string; targetDistrict?: string }
  ) => Promise<{ success: boolean }>;
}

export const RegionalEcoControlSection: React.FC<RegionalEcoControlSectionProps> = ({
  districts,
  reports,
  globalSearchQuery,
  initialDistrictFilter = 'all',
  onDispatchReport,
}) => {
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string>(initialDistrictFilter || 'all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [inspectReport, setInspectReport] = useState<EcoReport | null>(null);
  const [dispatchNote, setDispatchNote] = useState('');
  const [dispatchDistrict, setDispatchDistrict] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const q = (search || globalSearchQuery).trim().toLowerCase();

  const filteredReports = useMemo(() => {
    return [...reports]
      .filter(r => {
        if (districtFilter !== 'all' && r.district?.toLowerCase() !== districtFilter.toLowerCase()) return false;
        if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
        if (statusFilter !== 'all') {
          const s = String(r.status || '').toLowerCase();
          if (statusFilter === 'pending' && !['pending', 'pending_review', 'needs_info'].includes(s)) return false;
          if (statusFilter === 'in_progress' && !['in_progress', 'assigned', 'verified', 'approved'].includes(s)) return false;
          if (statusFilter === 'escalated' && s !== 'escalated' && !r.isHazardous) return false;
          if (statusFilter === 'resolved' && s !== 'resolved') return false;
          if (statusFilter === 'rejected' && s !== 'rejected') return false;
        }
        if (!q) return true;
        return (
          r.title.toLowerCase().includes(q) ||
          (r.district || '').toLowerCase().includes(q) ||
          (r.schoolName || '').toLowerCase().includes(q) ||
          (r.reporterName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [reports, districtFilter, categoryFilter, statusFilter, q]);

  const districtStats = useMemo(() => {
    return [...districts]
      .filter(d => d.totalReports > 0 || d.coordinator)
      .slice(0, 6);
  }, [districts]);

  const openInspector = (rep: EcoReport) => {
    setInspectReport(rep);
    setDispatchNote('');
    setDispatchDistrict(rep.district || districts[0]?.district || '');
  };

  const runAction = async (
    repId: string,
    action: 'dispatch_to_district' | 'verify' | 'resolve' | 'escalate' | 'request_info' | 'reject',
    noteOverride?: string
  ) => {
    setActionBusyId(repId);
    try {
      const res = await onDispatchReport(repId, action, {
        note: noteOverride !== undefined ? noteOverride : dispatchNote.trim() || undefined,
        targetDistrict: action === 'dispatch_to_district' ? dispatchDistrict || undefined : undefined,
      });
      if (res.success && inspectReport?.id === repId) {
        setInspectReport(null);
      }
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact District Resolution Performance Strip */}
      {districtStats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
          {districtStats.map(d => {
            const pct = d.totalReports > 0 ? Math.round((d.resolvedReports / d.totalReports) * 100) : 0;
            return (
              <button
                key={d.district}
                type="button"
                onClick={() => setDistrictFilter(districtFilter === d.district ? 'all' : d.district)}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer space-y-1 ${
                  districtFilter === d.district
                    ? 'bg-emerald-500/15 border-emerald-500'
                    : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 hover:border-emerald-400/50'
                }`}
              >
                <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{d.district}</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {d.coordinator ? d.coordinator.fullName : 'Koordinator yo‘q'}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono tabular-nums pt-0.5">
                  <span className="text-emerald-500 font-black">
                    {d.resolvedReports}/{d.totalReports}
                  </span>
                  <span className="text-slate-400">{pct}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Search & Multi-filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Muammo sarlavhasi, tuman yoki maktab..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
          />
        </div>
        <select
          value={districtFilter}
          onChange={e => setDistrictFilter(e.target.value)}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
        >
          <option value="all">Barcha tumanlar</option>
          {districts.map(d => (
            <option key={d.district} value={d.district}>
              {d.district}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
        >
          <option value="all">Barcha holatlar</option>
          <option value="pending">Kutilmoqda</option>
          <option value="in_progress">Jarayonda</option>
          <option value="escalated">Eskalatsiya / Xavfli</option>
          <option value="resolved">Hal etilgan</option>
          <option value="rejected">Rad etilgan</option>
        </select>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
        >
          <option value="all">Barcha toifalar</option>
          {Object.entries(REPORT_CATEGORY_LABELS).map(([k, lbl]) => (
            <option key={k} value={k}>
              {lbl}
            </option>
          ))}
        </select>
      </div>

      {/* Reports Grid with Before & After Preview */}
      {filteredReports.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-500">
          Tanlangan mezonlar bo‘yicha ekologik hisobotlar topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {filteredReports.map(rep => {
            const st = getRegionalStatusLabel(rep.status);
            const beforeSrc = resolveMediaUrl(rep.imageUrl);
            const afterSrc = resolveMediaUrl(rep.resolvedImageUrl);
            return (
              <div
                key={rep.id}
                className="rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Before / After visual strip */}
                  <div className={`grid ${afterSrc ? 'grid-cols-2' : 'grid-cols-1'} h-40 bg-[#040D0A] relative`}>
                    <div className="relative overflow-hidden border-r border-emerald-500/15">
                      {beforeSrc ? (
                        <img src={beforeSrc} alt={rep.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[11px] text-slate-500">
                          Oldingi rasm yo‘q
                        </div>
                      )}
                      <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded bg-black/70 text-[10px] font-bold text-white">
                        Oldingi
                      </span>
                    </div>
                    {afterSrc && (
                      <div className="relative overflow-hidden">
                        <img src={afterSrc} alt={`${rep.title} natija`} className="w-full h-full object-cover" />
                        <span className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-emerald-600/90 text-[10px] font-bold text-white">
                          Keyingi
                        </span>
                      </div>
                    )}
                    {rep.isHazardous && (
                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-rose-600 text-[10px] font-black text-white inline-flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>XAVFLI</span>
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold">
                        <span className={`w-2 h-2 rounded-full ${st.dotCls}`} />
                        <span className={st.textCls}>{st.label}</span>
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {new Date(rep.createdAt).toLocaleDateString('uz-UZ')}
                      </span>
                    </div>

                    <h4 className="text-sm font-extrabold text-slate-900 dark:text-white line-clamp-1">
                      {rep.title}
                    </h4>

                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>
                        {rep.district} · {rep.schoolName || 'Maktab ko‘rsatilmagan'}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {rep.description}
                    </p>
                  </div>
                </div>

                <div className="p-3 pt-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openInspector(rep)}
                    className="flex-1 min-h-[40px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-xs font-black border-b-[2px] border-emerald-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Ko‘rish &amp; Nazorat</span>
                  </button>
                  {!['resolved', 'RESOLVED'].includes(rep.status) && (
                    <button
                      type="button"
                      disabled={actionBusyId === rep.id}
                      onClick={() => runAction(rep.id, 'resolve', 'Viloyat koordinatori tomonidan yakunlandi')}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 text-xs font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Hal qilindi deb belgilash"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Inspection & Re-dispatch Modal */}
      {inspectReport && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl p-5 rounded-3xl bg-white dark:bg-[#061812] border border-emerald-500/30 space-y-4 shadow-2xl my-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-500">
                  Ekologik Nazorat Tafsiloti · {inspectReport.district}
                </div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">{inspectReport.title}</h3>
                <p className="text-xs text-slate-500">
                  {inspectReport.schoolName || 'Maktab ko‘rsatilmagan'} · Xabar beruvchi: {inspectReport.reporterName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectReport(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-[#040D0A] cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Side-by-side Before & After Photos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-slate-500">Oldingi holat (Muammo rasmi)</div>
                <div className="h-48 rounded-2xl overflow-hidden bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20">
                  {inspectReport.imageUrl ? (
                    <img
                      src={resolveMediaUrl(inspectReport.imageUrl)}
                      alt="Oldingi holat"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">
                      Rasm yuklanmagan
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] font-bold text-emerald-500">Keyingi holat (Natija rasmi)</div>
                <div className="h-48 rounded-2xl overflow-hidden bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20">
                  {inspectReport.resolvedImageUrl ? (
                    <img
                      src={resolveMediaUrl(inspectReport.resolvedImageUrl)}
                      alt="Keyingi holat"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 px-4 text-center">
                      Hozircha bartaraf etilgan keyingi rasm yuklanmagan
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15">
              {inspectReport.description}
            </p>

            {/* Status history */}
            {Array.isArray(inspectReport.statusHistory) && inspectReport.statusHistory.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Ko‘rib chiqish tarixi</span>
                </div>
                <div className="space-y-1 max-h-28 overflow-y-auto pr-1 text-[11px]">
                  {inspectReport.statusHistory.map((ev, i) => (
                    <div
                      key={i}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#040D0A] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">
                        <b className="text-emerald-500">{ev.actorName}</b>: {ev.note || ev.status}
                      </span>
                      <span className="font-mono text-[10px] text-slate-400 shrink-0">
                        {new Date(ev.timestamp).toLocaleDateString('uz-UZ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Dispatch to district coordinator */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-emerald-500/25 space-y-2.5 text-xs">
              <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                <span>Tuman koordinatoriga qayta ishlash uchun yuborish yoki qaror qabul qilish</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={dispatchDistrict}
                  onChange={e => setDispatchDistrict(e.target.value)}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 outline-none"
                >
                  {districts.map(d => (
                    <option key={d.district} value={d.district}>
                      {d.district}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={dispatchNote}
                  onChange={e => setDispatchNote(e.target.value)}
                  placeholder="Ko‘rsatma yoki izoh yozing..."
                  className="sm:col-span-2 min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 outline-none"
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  disabled={actionBusyId === inspectReport.id}
                  onClick={() => runAction(inspectReport.id, 'dispatch_to_district')}
                  className="min-h-[42px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Tuman koordinatoriga yuborish</span>
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === inspectReport.id}
                  onClick={() => runAction(inspectReport.id, 'resolve')}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-500 font-bold cursor-pointer disabled:opacity-50"
                >
                  Hal qilindi
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === inspectReport.id}
                  onClick={() => runAction(inspectReport.id, 'escalate')}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 font-bold cursor-pointer disabled:opacity-50"
                >
                  Ustuvor nazorat
                </button>
                <button
                  type="button"
                  disabled={actionBusyId === inspectReport.id}
                  onClick={() => runAction(inspectReport.id, 'reject')}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-200 dark:bg-[#061812] text-slate-600 dark:text-slate-300 font-bold cursor-pointer disabled:opacity-50"
                >
                  Rad etish
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
