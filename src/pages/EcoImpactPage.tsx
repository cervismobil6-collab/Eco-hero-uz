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
import kabinetEarthSproutImg from '../assets/images/kabinet_earth_sprout_1795606728116.jpg';

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
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Compact Duolingo Analytics Hero */}
      <div className="relative overflow-hidden rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 max-w-2xl">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-emerald-400/40 bg-[#040D0A] shrink-0 shadow-lg">
              <img src={kabinetEarthSproutImg} alt="Eco Impact Analitika" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#00F5A0]">
                <Globe className="w-3.5 h-3.5" />
                <span>{data?.scopeLabel || 'Haqiqiy Ekologik Statistika'}</span>
              </div>
              <h1 className="text-xl sm:text-3xl font-black tracking-tight text-white">
                Eco <span className="text-[#00F5A0]">Impact</span> Analitika
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-snug">
                Barcha ko‘rsatkichlar foydalanuvchi rolingiz va vakolat doirangizga mos ravishda yagona bazadan real vaqtda hisoblanadi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-3.5 sm:p-4 bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 text-[#00F5A0]" />
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
                className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold text-slate-900 dark:text-white outline-none"
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
                  className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold text-slate-900 dark:text-white outline-none"
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
            className="px-3 py-2 min-h-[40px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold text-slate-900 dark:text-white outline-none"
          >
            <option value="all">Barcha muammo toifalari</option>
            <option value="waste">Chiqindilar</option>
            <option value="water">Suv ifloslanishi</option>
            <option value="deforestation">Daraxt kesilishi</option>
            <option value="air">Havo ifloslanishi</option>
            <option value="greening_needed">Ko&apos;kalamzorlashtirish</option>
            <option value="electrical_hazard">Elektr xavfi</option>
            <option value="chemical_hazard">Kimyoviy xavf</option>
          </select>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((stat, idx) => (
          <div
            key={idx}
            className="p-4 sm:p-5 bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 space-y-2.5 shadow-sm"
          >
            <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{stat.label}</div>
              <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {loading ? '...' : stat.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Monthly Trend */}
        <div className="lg:col-span-7 bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 p-4 sm:p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">Oylik Faollik Dinamikasi</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Yuborilgan va hal etilgan hisobotlar</p>
            </div>
            <BarChart3 className="w-5 h-5 text-[#00F5A0]" />
          </div>

          {monthlySeries.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-xs text-slate-400">
              Oylik dinamika uchun ma&apos;lumotlar shakllanmoqda
            </div>
          ) : (
            <div className="h-48 flex items-end gap-3 px-2 pt-3">
              {monthlySeries.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full h-36 flex items-end justify-center gap-1">
                    <div
                      title={`Jami hisobotlar: ${m.reports}`}
                      style={{ height: `${Math.max(8, Math.round((m.reports / maxSeriesVal) * 100))}%` }}
                      className="w-3 bg-slate-300 dark:bg-emerald-500/25 rounded-t-md"
                    />
                    <div
                      title={`Hal etilgan: ${m.resolved}`}
                      style={{ height: `${Math.max(8, Math.round((m.resolved / maxSeriesVal) * 100))}%` }}
                      className="w-3 bg-[#00F5A0] rounded-t-md"
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{m.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-100 dark:border-emerald-500/15 text-xs tabular-nums">
            <div>
              <div className="text-slate-500 dark:text-slate-400">Maktablar</div>
              <div className="font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <SchoolIcon className="w-4 h-4 text-[#00F5A0]" /> {totals?.schools ?? 0}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">O&apos;quvchilar</div>
              <div className="font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-500" /> {totals?.students ?? 0}
              </div>
            </div>
            <div>
              <div className="text-slate-500 dark:text-slate-400">Eko-Elchilar</div>
              <div className="font-black text-base text-slate-900 dark:text-white flex items-center gap-1.5">
                <Trash2 className="w-4 h-4 text-amber-500" /> {totals?.ambassadors ?? 0}
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="lg:col-span-5 bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 p-4 sm:p-5 space-y-4 shadow-sm">
          <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">Muammo Toifalari Kesimi</h3>
          <div className="space-y-3">
            {categoryBreakdown.length === 0 ? (
              <div className="text-xs text-slate-400 py-8 text-center">Ma&apos;lumot topilmadi</div>
            ) : (
              categoryBreakdown.map(cat => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold tabular-nums text-slate-800 dark:text-slate-200">
                    <span>{cat.label}</span>
                    <span className="text-emerald-600 dark:text-[#00F5A0]">{cat.count} ta</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-[#040D0A] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#00F5A0] to-[#10B981] rounded-full"
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
        <div className="bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-emerald-500/15">
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">Viloyatlar Bo‘yicha Samaradorlik</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="bg-slate-50 dark:bg-[#040D0A] text-slate-500 dark:text-slate-400 uppercase text-[10px] font-black border-b border-slate-200 dark:border-emerald-500/15">
                <tr>
                  <th className="py-3 px-4 sm:px-5">Viloyat</th>
                  <th className="py-3 px-4 text-center">Maktablar</th>
                  <th className="py-3 px-4 text-center">O&apos;quvchilar</th>
                  <th className="py-3 px-4 text-center">Hal Etilgan / Jami</th>
                  <th className="py-3 px-4 sm:px-5 text-right">EcoCoin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/10">
                {data?.regionPerformance.map(r => (
                  <tr key={r.region} className="hover:bg-emerald-500/[0.04]">
                    <td className="py-3 px-4 sm:px-5 font-bold text-slate-900 dark:text-white">{r.region}</td>
                    <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300">{r.schools}</td>
                    <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300">{r.students}</td>
                    <td className="py-3 px-4 text-center text-emerald-600 dark:text-[#00F5A0] font-bold">
                      {r.resolved} / {r.reports}
                    </td>
                    <td className="py-3 px-4 sm:px-5 text-right font-mono font-black text-amber-500">
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
  );
};
