import React from 'react';
import { BarChart3, Download, CheckCircle2, Trees, Coins, Users } from 'lucide-react';
import { AnalyticsResponse, School } from '../../../types/eco';

interface DistrictAnalyticsSectionProps {
  region: string;
  district: string;
  analytics: AnalyticsResponse | null;
  schools: School[];
}

export const DistrictAnalyticsSection: React.FC<DistrictAnalyticsSectionProps> = ({
  region,
  district,
  analytics,
  schools,
}) => {
  const totals = analytics?.totals;
  const monthlySeries = analytics?.monthlySeries || [];
  const categoryBreakdown = analytics?.categoryBreakdown || [];

  const maxMonthlyVal = Math.max(
    1,
    ...monthlySeries.map(m => Math.max(m.reports, m.resolved, m.mediaApproved))
  );
  const maxCategoryVal = Math.max(1, ...categoryBreakdown.map(c => c.count));

  const handleExportCsv = () => {
    const headers = ['Maktab', 'Tuman', 'Oquvchilar', 'EcoCoin', 'Daraxtlar', 'Aksiyalar'];
    const rows = schools.map(s => [
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${(s.district || district).replace(/"/g, '""')}"`,
      s.registeredStudentsCount || s.studentsCount || 0,
      s.totalCoins || 0,
      s.treesPlanted || 0,
      s.cleanupsCompleted || 0,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecohero_${district.replace(/\s+/g, '_').toLowerCase()}_statistika.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>Tuman statistikasi va tahlil</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {analytics?.scopeLabel || `${region}, ${district}`} bo‘yicha real ko‘rsatkichlar
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="px-4 py-2.5 min-h-[42px] bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer hover:border-emerald-400 self-start sm:self-center"
        >
          <Download className="w-4 h-4 text-emerald-500" />
          <span>CSV Yuklab olish</span>
        </button>
      </div>

      {/* Compact Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Faol o‘quvchilar</span>
            <Users className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums">
            {(totals?.students ?? schools.reduce((s, sc) => s + (sc.registeredStudentsCount || sc.studentsCount || 0), 0)).toLocaleString()}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Hal etilgan hisobot</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-emerald-500">
            {totals?.reportsResolved ?? 0}{' '}
            <span className="text-xs text-slate-400">/ {totals?.reportsTotal ?? 0}</span>
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Ekilgan daraxtlar</span>
            <Trees className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums">
            {(totals?.treesPlanted ?? schools.reduce((s, sc) => s + (sc.treesPlanted || 0), 0)).toLocaleString()}
          </div>
        </div>
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Tuman EcoCoin</span>
            <Coins className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-black font-mono tabular-nums text-amber-500">
            {(totals?.totalEcoCoins ?? schools.reduce((s, sc) => s + (sc.totalCoins || 0), 0)).toLocaleString()}
          </div>
        </div>
      </div>

      {/* 6-Month Series + Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <h3 className="text-sm font-black">So‘nggi 6 oylik dinamika</h3>
          {monthlySeries.length === 0 ? (
            <div className="py-6 text-center text-slate-400">Ma'lumotlar yuklanmoqda...</div>
          ) : (
            <div className="space-y-2.5">
              {monthlySeries.map(m => (
                <div key={m.label} className="space-y-1">
                  <div className="flex justify-between font-mono tabular-nums text-[11px]">
                    <span className="font-bold">{m.label}</span>
                    <span className="text-slate-400">
                      Hisobot: <b className="text-white">{m.reports}</b> · Hal: <b className="text-emerald-400">{m.resolved}</b> · Media: <b className="text-sky-400">{m.mediaApproved}</b>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-[#040D0A] overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${Math.min(100, (m.resolved / maxMonthlyVal) * 100)}%` }}
                    />
                    <div
                      className="h-full bg-sky-500/70"
                      style={{ width: `${Math.min(100, (m.mediaApproved / maxMonthlyVal) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <h3 className="text-sm font-black">Muammo toifalari kesimi</h3>
          {categoryBreakdown.length === 0 ? (
            <div className="py-6 text-center text-slate-400">Toifalar bo‘yicha hisobotlar yo‘q.</div>
          ) : (
            <div className="space-y-2.5">
              {categoryBreakdown.map(c => (
                <div key={c.category} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-bold">{c.label}</span>
                    <span className="font-mono font-black text-emerald-500 tabular-nums">{c.count} ta</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-[#040D0A] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#00F5A0] to-[#10B981]"
                      style={{ width: `${Math.min(100, (c.count / maxCategoryVal) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* School Comparison Table */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs">
        <h3 className="text-sm font-black">Maktablar samaradorligi taqqoslanishi ({schools.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-[#040D0A] text-[10px] font-black uppercase text-slate-400">
              <tr>
                <th className="px-3 py-2.5">Maktab</th>
                <th className="px-3 py-2.5 text-right">O‘quvchi</th>
                <th className="px-3 py-2.5 text-right">Daraxt</th>
                <th className="px-3 py-2.5 text-right">Tozalash</th>
                <th className="px-3 py-2.5 text-right">EcoCoin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
              {schools.map(s => (
                <tr key={s.id}>
                  <td className="px-3 py-2.5 font-bold">{s.name}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {s.registeredStudentsCount || s.studentsCount || 0}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{s.treesPlanted || 0}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{s.cleanupsCompleted || 0}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-black text-emerald-500 tabular-nums">
                    {(s.totalCoins || 0).toLocaleString()}
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
