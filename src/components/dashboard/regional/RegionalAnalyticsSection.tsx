import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  RefreshCw,
  TreePine,
  CheckCircle2,
  Coins,
  Building2,
  Users,
} from 'lucide-react';
import {
  RegionalAnalyticsPeriodResponse,
  RegionalDistrictSummary,
} from '../../../types/eco';

interface RegionalAnalyticsSectionProps {
  region: string;
  districts: RegionalDistrictSummary[];
  onFetchAnalytics: (params?: {
    period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    district?: string;
    region?: string;
  }) => Promise<RegionalAnalyticsPeriodResponse | null>;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const PERIOD_LABELS: Record<'daily' | 'weekly' | 'monthly' | 'yearly', string> = {
  daily: 'Kunlik',
  weekly: 'Haftalik',
  monthly: 'Oylik',
  yearly: 'Yillik',
};

export const RegionalAnalyticsSection: React.FC<RegionalAnalyticsSectionProps> = ({
  region,
  districts,
  onFetchAnalytics,
  apiFetch,
}) => {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [data, setData] = useState<RegionalAnalyticsPeriodResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await onFetchAnalytics({
        period,
        district: districtFilter === 'all' ? undefined : districtFilter,
        region,
      });
      if (res) setData(res);
    } finally {
      setLoading(false);
    }
  }, [onFetchAnalytics, period, districtFilter, region]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleExportCsv = () => {
    if (!data) return;
    const rows = [
      ['Tuman', 'Maktablar', "O'quvchilar", 'Muammolar', 'Hal etilgan', 'Samaradorlik (%)', 'EcoCoin', 'Daraxtlar'],
      ...data.districtComparison.map(d => [
        d.district,
        String(d.schools),
        String(d.students),
        String(d.reports),
        String(d.resolved),
        String(d.resolutionRate),
        String(d.coins),
        String(d.treesPlanted),
      ]),
    ];
    const csv = rows
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecohero-viloyat-hisobot-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = async () => {
    try {
      const res = await apiFetch(
        `/api/analytics/export?region=${encodeURIComponent(region)}${
          districtFilter !== 'all' ? `&district=${encodeURIComponent(districtFilter)}` : ''
        }`
      );
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecohero-viloyat-tahlil-${period}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  const series = data?.timeSeries || [];
  const maxSeriesVal = Math.max(1, ...series.map(s => Math.max(s.reports, s.resolved, 1)));
  const maxDistrictCoins = Math.max(1, ...(data?.districtComparison || []).map(d => d.coins || 0));

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['daily', 'weekly', 'monthly', 'yearly'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-2 min-h-[42px] rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                period === p
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                  : 'bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}

          <select
            value={districtFilter}
            onChange={e => setDistrictFilter(e.target.value)}
            className="px-3.5 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
          >
            <option value="all">Barcha tumanlar ({region})</option>
            {districts.map(d => (
              <option key={d.district} value={d.district}>
                {d.district}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadAnalytics}
            disabled={loading}
            className="px-3.5 py-2 min-h-[42px] rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Yangilash</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={!data}
            className="px-3.5 py-2 min-h-[42px] rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-[#00F5A0] text-xs font-black inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV Eksport</span>
          </button>
          <button
            type="button"
            onClick={handleExportJson}
            className="px-3.5 py-2 min-h-[42px] rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 text-xs font-black inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON Eksport</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Maktablar', val: data?.totals.schools ?? 0, icon: Building2, cls: 'text-emerald-500' },
          { label: 'O‘quvchilar', val: data?.totals.students ?? 0, icon: Users, cls: 'text-sky-500' },
          {
            label: 'Hal etilgan / Jami',
            val: `${data?.totals.reportsResolved ?? 0} / ${data?.totals.reportsTotal ?? 0}`,
            icon: CheckCircle2,
            cls: 'text-[#00F5A0]',
          },
          { label: 'Daraxtlar', val: data?.totals.treesPlanted ?? 0, icon: TreePine, cls: 'text-emerald-400' },
          { label: 'EcoCoin', val: (data?.totals.totalEcoCoins ?? 0).toLocaleString(), icon: Coins, cls: 'text-amber-500' },
        ].map(k => (
          <div
            key={k.label}
            className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>{k.label}</span>
              <k.icon className={`w-4 h-4 ${k.cls}`} />
            </div>
            <div className={`text-lg font-black font-mono tabular-nums ${k.cls}`}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Time-Series Bar Chart + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-black">
                {PERIOD_LABELS[period]} Dinamika: Kelib tushgan va Hal etilgan muammolar
              </h3>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-bold">
              <span className="inline-flex items-center gap-1 text-sky-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" /> Muammolar
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-500">
                <span className="w-2.5 h-2.5 rounded-sm bg-[#00F5A0]" /> Hal etilgan
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 items-end h-44 pt-4">
            {series.map(pt => (
              <div key={pt.label} className="flex flex-col items-center justify-end h-full gap-1.5">
                <div className="w-full flex items-end justify-center gap-1 flex-1">
                  <div
                    className="w-3 sm:w-4 rounded-t-md bg-sky-500/80 transition-all"
                    style={{ height: `${Math.max(8, Math.round((pt.reports / maxSeriesVal) * 100))}%` }}
                    title={`${pt.label}: ${pt.reports} ta muammo`}
                  />
                  <div
                    className="w-3 sm:w-4 rounded-t-md bg-gradient-to-t from-emerald-600 to-[#00F5A0] transition-all"
                    style={{ height: `${Math.max(8, Math.round((pt.resolved / maxSeriesVal) * 100))}%` }}
                    title={`${pt.label}: ${pt.resolved} ta hal etilgan`}
                  />
                </div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-full">
                  {pt.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <h3 className="text-sm font-black">Muammo Yo‘nalishlari</h3>
          <div className="space-y-2.5">
            {(data?.categoryBreakdown || []).map(cat => {
              const total = Math.max(1, data?.totals.reportsTotal || 1);
              const pct = Math.round((cat.count / total) * 100);
              return (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{cat.label}</span>
                    <span className="font-mono tabular-nums font-bold text-emerald-500">
                      {cat.count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-[#040D0A] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#00F5A0] to-emerald-500"
                      style={{ width: `${Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {(data?.categoryBreakdown || []).length === 0 && (
              <div className="py-10 text-center text-xs text-slate-400">
                Ushbu davr uchun kategoriya ma&apos;lumotlari yo‘q
              </div>
            )}
          </div>
        </div>
      </div>

      {/* District Comparison Table */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
        <h3 className="text-sm font-black">Tumanlar Kesimida Taqqoslash</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-emerald-500/20 text-[11px] font-bold text-slate-400 uppercase">
                <th className="py-2 pr-3">Tuman / Shahar</th>
                <th className="py-2 px-3 text-right">Maktab</th>
                <th className="py-2 px-3 text-right">O‘quvchi</th>
                <th className="py-2 px-3 text-right">Hal etilgan</th>
                <th className="py-2 px-3 text-right">Samaradorlik</th>
                <th className="py-2 pl-3">EcoCoin Taqqoslama</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/10 text-xs">
              {(data?.districtComparison || []).map(row => (
                <tr key={row.district}>
                  <td className="py-2.5 pr-3 font-bold text-slate-900 dark:text-white">{row.district}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.schools}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">{row.students}</td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                    {row.resolved} / {row.reports}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-500">
                    {row.resolutionRate}%
                  </td>
                  <td className="py-2.5 pl-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-[#040D0A] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#00F5A0] to-emerald-500"
                          style={{ width: `${Math.max(4, Math.round((row.coins / maxDistrictCoins) * 100))}%` }}
                        />
                      </div>
                      <span className="font-mono tabular-nums font-bold text-amber-500 w-20 text-right">
                        {row.coins.toLocaleString()}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
