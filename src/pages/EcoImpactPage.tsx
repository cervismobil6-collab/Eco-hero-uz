import React, { useEffect, useState, useMemo } from 'react';
import {
  TreePine,
  Trash2,
  Coins,
  Users,
  Globe,
  BarChart3,
  School as SchoolIcon,
  CheckCircle2,
  Camera,
  ShieldCheck,
} from 'lucide-react';
import { useEco } from '../context/EcoContext';
import { AnalyticsResponse } from '../types/eco';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../data/mockData';

export const EcoImpactPage: React.FC = () => {
  const { user, fetchAnalytics } = useEco();

  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [districtFilter, setDistrictFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  const canChangeGeoFilter = user.role === 'super_admin' || user.role === 'moderator' || user.role === 'student' || user.role === 'sponsor';

  const availableDistricts = useMemo(() => {
    if (regionFilter === 'all' || !UZBEKISTAN_DISTRICTS[regionFilter]) return [];
    return UZBEKISTAN_DISTRICTS[regionFilter];
  }, [regionFilter]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchAnalytics({
      region: regionFilter !== 'all' ? regionFilter : undefined,
      district: districtFilter !== 'all' ? districtFilter : undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
    })
      .then(res => {
        if (mounted && res) setData(res);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [regionFilter, districtFilter, categoryFilter, fetchAnalytics]);

  const totals = data?.totals;
  const monthlySeries = data?.monthlySeries || [];
  const maxSeriesVal = Math.max(
    1,
    ...monthlySeries.map(m => Math.max(m.reports || 0, m.resolved || 0, m.mediaApproved || 0))
  );

  const categoryBreakdown = data?.categoryBreakdown || [];
  const maxCatVal = Math.max(1, ...categoryBreakdown.map(c => c.count || 0));

  const statCards = [
    {
      label: 'Ekilgan Daraxtlar',
      value: (totals?.treesPlanted ?? 0).toLocaleString(),
      icon: TreePine,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
    },
    {
      label: 'Hal Etilgan Muammolar',
      value: `${totals?.reportsResolved ?? 0} / ${totals?.reportsTotal ?? 0}`,
      icon: CheckCircle2,
      color: 'text-sky-500',
      bg: 'bg-sky-500/10',
    },
    {
      label: 'Tasdiqlangan Medialar',
      value: (totals?.mediaApproved ?? 0).toLocaleString(),
      icon: Camera,
      color: 'text-indigo-500',
      bg: 'bg-indigo-500/10',
    },
    {
      label: 'Jami EcoCoin Aylanma',
      value: `${(totals?.totalEcoCoins ?? 0).toLocaleString()} ECO`,
      icon: Coins,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white pb-24">
      {/* Header */}
      <div className="bg-gradient-to-b from-emerald-950/30 to-transparent border-b border-slate-200 dark:border-slate-800/60 py-12 px-4">
        <div className="max-w-7xl mx-auto space-y-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
            <Globe className="w-3.5 h-3.5" /> {data?.scopeLabel || 'Haqiqiy Ekologik Statistika'}
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tight">
            Eco <span className="text-emerald-500">Impact</span> Analitika
          </h1>
          <p className="text-xs md:text-sm text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
            Barcha ko‘rsatkichlar foydalanuvchi rolingiz va vakolat doirangizga mos ravishda yagona bazadan real vaqtda hisoblanadi.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-8 space-y-8">
        {/* Filters */}
        <div className="p-4 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Ko‘rish doirasi: <b className="text-slate-900 dark:text-white">{data?.scopeLabel || user.region}</b></span>
          </div>
          <div className="flex flex-wrap gap-2">
            {canChangeGeoFilter && (
              <>
                <select
                  value={regionFilter}
                  onChange={e => {
                    setRegionFilter(e.target.value);
                    setDistrictFilter('all');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                >
                  <option value="all">Barcha viloyatlar</option>
                  {UZBEKISTAN_REGIONS.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {availableDistricts.length > 0 && (
                  <select
                    value={districtFilter}
                    onChange={e => setDistrictFilter(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  >
                    <option value="all">Barcha tumanlar</option>
                    {availableDistricts.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}
              </>
            )}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
            >
              <option value="all">Barcha muammo toifalari</option>
              <option value="waste">Chiqindilar</option>
              <option value="water">Suv ifloslanishi</option>
              <option value="deforestation">Daraxt kesilishi</option>
              <option value="air">Havo ifloslanishi</option>
              <option value="greening_needed">Ko'kalamzorlashtirish</option>
              <option value="electrical_hazard">Elektr xavfi</option>
              <option value="chemical_hazard">Kimyoviy xavf</option>
            </select>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {statCards.map((stat, idx) => (
            <div
              key={idx}
              className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3"
            >
              <div className={`w-11 h-11 rounded-2xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</div>
                <div className="text-2xl font-black font-mono tabular-nums mt-1">
                  {loading ? '...' : stat.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Main Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Monthly Trend */}
          <div className="lg:col-span-7 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black uppercase tracking-tight">Oylik Faollik Dinamikasi</h3>
                <p className="text-xs text-slate-500">Yuborilgan vs Hal etilgan hisobotlar</p>
              </div>
              <BarChart3 className="w-5 h-5 text-emerald-500" />
            </div>

            {monthlySeries.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                Oylik dinamika uchun ma'lumotlar shakllanmoqda
              </div>
            ) : (
              <div className="h-56 flex items-end gap-3 px-2 pt-4">
                {monthlySeries.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full h-44 flex items-end justify-center gap-1">
                      <div
                        title={`Jami hisobotlar: ${m.reports}`}
                        style={{ height: `${Math.max(8, Math.round((m.reports / maxSeriesVal) * 100))}%` }}
                        className="w-3 bg-slate-300 dark:bg-slate-700 rounded-t-md"
                      />
                      <div
                        title={`Hal etilgan: ${m.resolved}`}
                        style={{ height: `${Math.max(8, Math.round((m.resolved / maxSeriesVal) * 100))}%` }}
                        className="w-3 bg-emerald-500 rounded-t-md"
                      />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">{m.label}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs tabular-nums">
              <div>
                <div className="text-slate-400">Maktablar</div>
                <div className="font-black text-base flex items-center gap-1.5">
                  <SchoolIcon className="w-4 h-4 text-emerald-500" /> {totals?.schools ?? 0}
                </div>
              </div>
              <div>
                <div className="text-slate-400">O'quvchilar</div>
                <div className="font-black text-base flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-sky-500" /> {totals?.students ?? 0}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Eko-Elchilar</div>
                <div className="font-black text-base flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4 text-amber-500" /> {totals?.ambassadors ?? 0}
                </div>
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="lg:col-span-5 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <h3 className="text-lg font-black uppercase tracking-tight">Muammo Toifalari Kesimi</h3>
            <div className="space-y-3">
              {categoryBreakdown.length === 0 ? (
                <div className="text-xs text-slate-400 py-8 text-center">Ma'lumot topilmadi</div>
              ) : (
                categoryBreakdown.map(cat => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex justify-between text-xs font-bold tabular-nums">
                      <span>{cat.label}</span>
                      <span className="text-emerald-500">{cat.count} ta</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.max(4, Math.round((cat.count / maxCatVal) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Regional Performance Table */}
        {(data?.regionPerformance?.length || 0) > 0 && (
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-black uppercase tracking-tight">Viloyatlar Bo‘yicha Samaradorlik</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs tabular-nums">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-400 uppercase text-[10px] font-black">
                  <tr>
                    <th className="py-3.5 px-6">Viloyat</th>
                    <th className="py-3.5 px-4 text-center">Maktablar</th>
                    <th className="py-3.5 px-4 text-center">O'quvchilar</th>
                    <th className="py-3.5 px-4 text-center">Hal Etilgan / Jami</th>
                    <th className="py-3.5 px-6 text-right">EcoCoin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data?.regionPerformance.map(r => (
                    <tr key={r.region} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="py-3.5 px-6 font-bold">{r.region}</td>
                      <td className="py-3.5 px-4 text-center">{r.schools}</td>
                      <td className="py-3.5 px-4 text-center">{r.students}</td>
                      <td className="py-3.5 px-4 text-center text-emerald-500 font-bold">
                        {r.resolved} / {r.reports}
                      </td>
                      <td className="py-3.5 px-6 text-right font-mono font-black text-amber-500">
                        {r.coins.toLocaleString()} ECO
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
