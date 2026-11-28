import React, { useMemo, useState } from 'react';
import {
  Trophy,
  Building2,
  GraduationCap,
  Globe,
  Gift,
  Award,
  CheckCircle2,
  QrCode,
  Search,
} from 'lucide-react';
import {
  MonthlyAwardRecord,
  RegionalDistrictSummary,
  RosterStudentEntry,
  School,
} from '../../../types/eco';
import { VoucherVerifierPanel } from '../../shop/VoucherVerifierPanel';
import championshipHeroImg from '../../../assets/images/school_championship_photo_1795843393072.jpg';
import realisticAvatarImg from '../../../assets/images/profile_avatar_realistic_1795605008121.jpg';

interface RegionalChampionshipSectionProps {
  region: string;
  districts: RegionalDistrictSummary[];
  schools: School[];
  students: RosterStudentEntry[];
  monthlyAwards: MonthlyAwardRecord[];
  globalSearchQuery: string;
  onAwardChampionship: (payload: {
    region?: string;
    periodType: 'monthly' | 'yearly';
    category: 'district' | 'school' | 'student';
    targetId?: string;
    targetName: string;
    district?: string;
    rank: number;
    bonusCoins: number;
    prizeTitle: string;
  }) => Promise<{ success: boolean; award?: any; error?: string }>;
}

export const RegionalChampionshipSection: React.FC<RegionalChampionshipSectionProps> = ({
  region,
  districts,
  schools,
  students,
  monthlyAwards,
  globalSearchQuery,
  onAwardChampionship,
}) => {
  const [periodType, setPeriodType] = useState<'monthly' | 'yearly'>('monthly');
  const [activeTab, setActiveTab] = useState<'districts' | 'schools' | 'students' | 'awards'>('districts');
  const [search, setSearch] = useState('');
  const [awardModalTarget, setAwardModalTarget] = useState<{
    category: 'district' | 'school' | 'student';
    targetId?: string;
    targetName: string;
    district?: string;
    rank: number;
  } | null>(null);
  const [prizeTitle, setPrizeTitle] = useState("Viloyat Chempionati G'olibi");
  const [bonusCoins, setBonusCoins] = useState('1500');
  const [awarding, setAwarding] = useState(false);

  const q = (search || globalSearchQuery).trim().toLowerCase();

  // Compute scored rankings for monthly vs yearly
  const rankedDistricts = useMemo(() => {
    const mult = periodType === 'yearly' ? 1.15 : 1;
    return [...districts]
      .map(d => {
        const score = Math.round(
          ((d.resolvedReports * 35 + d.treesPlanted * 12 + Math.round(d.totalCoins / 10)) * mult)
        );
        return { ...d, champScore: score };
      })
      .filter(d => !q || d.district.toLowerCase().includes(q) || (d.coordinator?.fullName || '').toLowerCase().includes(q))
      .sort((a, b) => b.champScore - a.champScore);
  }, [districts, periodType, q]);

  const rankedSchools = useMemo(() => {
    return [...schools]
      .map(s => {
        const baseScore = (s.totalCoins || 0) + (s.treesPlanted || 0) * 20 + (s.cleanupsCompleted || 0) * 40;
        const score = periodType === 'yearly' ? Math.round(baseScore * 1.1) : baseScore;
        return { ...s, champScore: score };
      })
      .filter(
        s =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.district.toLowerCase().includes(q) ||
          (s.ambassadorName || '').toLowerCase().includes(q)
      )
      .sort((a, b) => b.champScore - a.champScore);
  }, [schools, periodType, q]);

  const rankedStudents = useMemo(() => {
    return [...students]
      .map(st => {
        const base =
          (st.ecoCoins || 0) + (st.reportsCount || 0) * 50 + (st.treesPlanted || 0) * 25;
        const score = periodType === 'yearly' ? (st.totalCoinsEarned || base) : base;
        return { ...st, champScore: score };
      })
      .filter(
        st =>
          !q ||
          st.fullName.toLowerCase().includes(q) ||
          st.schoolName.toLowerCase().includes(q) ||
          st.district.toLowerCase().includes(q)
      )
      .sort((a, b) => b.champScore - a.champScore);
  }, [students, periodType, q]);

  const regionalAwardHistory = useMemo(() => {
    return monthlyAwards.filter(
      a => !region || a.region?.toLowerCase() === region.toLowerCase()
    );
  }, [monthlyAwards, region]);

  const handleConfirmAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!awardModalTarget || awarding) return;
    setAwarding(true);
    try {
      const res = await onAwardChampionship({
        region,
        periodType,
        category: awardModalTarget.category,
        targetId: awardModalTarget.targetId,
        targetName: awardModalTarget.targetName,
        district: awardModalTarget.district,
        rank: awardModalTarget.rank,
        bonusCoins: Math.max(50, Math.min(20000, Number(bonusCoins) || 500)),
        prizeTitle: prizeTitle.trim() || "Viloyat Chempionati G'olibi",
      });
      if (res.success) {
        setAwardModalTarget(null);
      }
    } finally {
      setAwarding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Real Photography Championship Header */}
      <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-[#040D0A] text-white shadow-xl">
        <img
          src={championshipHeroImg}
          alt="Viloyat Ekologik Chempionati"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#040D0A] via-[#041D14]/90 to-[#040D0A]/65" />
        <div className="relative p-4 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#00F5A0]">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>{region} — Viloyat Ekologik Chempionati</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight">
              Tumanlar, Maktablar va O‘quvchilar Bellashuvi
            </h2>
            <p className="text-xs text-emerald-100/80 max-w-2xl">
              Oylik va yillik ko‘rsatkichlar bo‘yicha yetakchilarni aniqlang, rasmiy g‘oliblarni taqdirlang va sovrin vaucherlarini boshqaring.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(['monthly', 'yearly'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriodType(p)}
                className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-black transition-all cursor-pointer ${
                  periodType === p
                    ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                    : 'bg-white/10 text-emerald-100 hover:bg-white/20 border border-white/15'
                }`}
              >
                {p === 'monthly' ? 'Oylik Natija' : 'Yillik Natija'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-Navigation + Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'districts' as const, label: 'Tumanlar Reytingi', icon: Globe },
            { id: 'schools' as const, label: 'Maktablar Reytingi', icon: Building2 },
            { id: 'students' as const, label: 'O‘quvchilar Reytingi', icon: GraduationCap },
            { id: 'awards' as const, label: 'G‘oliblar & Sovg‘alar', icon: Gift },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold inline-flex items-center gap-2 transition-all cursor-pointer ${
                activeTab === t.id
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                  : 'bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-emerald-100/75'
              }`}
            >
              <t.icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Reytingdan qidirish..."
            className="w-full pl-9 pr-3 py-2.5 min-h-[44px] rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-400"
          />
        </div>
      </div>

      {/* DISTRICTS LEADERBOARD */}
      {activeTab === 'districts' && (
        <div className="space-y-4">
          {rankedDistricts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {rankedDistricts.slice(0, 3).map((d, idx) => (
                <div
                  key={d.district}
                  className={`p-4 rounded-2xl border space-y-2.5 ${
                    idx === 0
                      ? 'bg-gradient-to-br from-amber-500/15 to-emerald-500/10 border-amber-500/40'
                      : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-black font-mono tabular-nums text-amber-500">#{idx + 1}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setAwardModalTarget({
                          category: 'district',
                          targetName: d.district,
                          district: d.district,
                          rank: idx + 1,
                        })
                      }
                      className="px-3 py-1.5 min-h-[36px] rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-[#00F5A0] text-[11px] font-black hover:bg-emerald-500 hover:text-[#04110B] transition-colors cursor-pointer"
                    >
                      Taqdirlash
                    </button>
                  </div>
                  <div>
                    <div className="text-base font-black text-slate-900 dark:text-white">{d.district}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Koordinator: {d.coordinator?.fullName || 'Tayinlanmagan'}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-emerald-500/15 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400">Ball</div>
                      <div className="text-xs font-black font-mono tabular-nums text-emerald-500">
                        {d.champScore.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Maktab</div>
                      <div className="text-xs font-black font-mono tabular-nums">{d.schoolsCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">Hal etildi</div>
                      <div className="text-xs font-black font-mono tabular-nums text-sky-500">{d.resolvedReports}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-emerald-500/20 text-[11px] font-bold text-slate-400 uppercase">
                  <th className="py-2.5 pr-3">O‘rin</th>
                  <th className="py-2.5 px-3">Tuman / Shahar</th>
                  <th className="py-2.5 px-3">Koordinator</th>
                  <th className="py-2.5 px-3 text-right">Maktablar</th>
                  <th className="py-2.5 px-3 text-right">Hal etilgan</th>
                  <th className="py-2.5 px-3 text-right">EcoCoin</th>
                  <th className="py-2.5 pl-3 text-right">Amal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/10 text-xs">
                {rankedDistricts.map((d, idx) => (
                  <tr key={d.district} className={idx < 3 ? 'bg-amber-500/5' : ''}>
                    <td className="py-3 pr-3 font-black font-mono tabular-nums text-amber-500">#{idx + 1}</td>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{d.district}</td>
                    <td className="py-3 px-3 text-slate-500 dark:text-slate-300">
                      {d.coordinator?.fullName || 'Tayinlanmagan'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">{d.schoolsCount}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-sky-500 font-bold">
                      {d.resolvedReports}/{d.totalReports}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-emerald-500">
                      {d.totalCoins.toLocaleString()}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setAwardModalTarget({
                            category: 'district',
                            targetName: d.district,
                            district: d.district,
                            rank: idx + 1,
                          })
                        }
                        className="px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-[#00F5A0] text-[11px] font-bold hover:bg-emerald-500 hover:text-[#04110B] transition-colors cursor-pointer"
                      >
                        Sovrin berish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SCHOOLS LEADERBOARD */}
      {activeTab === 'schools' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-emerald-500/20 text-[11px] font-bold text-slate-400 uppercase">
                <th className="py-2.5 pr-3">O‘rin</th>
                <th className="py-2.5 px-3">Maktab</th>
                <th className="py-2.5 px-3">Tuman</th>
                <th className="py-2.5 px-3">Sardor / Mas'ul</th>
                <th className="py-2.5 px-3 text-right">Daraxtlar</th>
                <th className="py-2.5 px-3 text-right">Ball ({periodType === 'monthly' ? 'Oylik' : 'Yillik'})</th>
                <th className="py-2.5 pl-3 text-right">Taqdirlash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/10 text-xs">
              {rankedSchools.slice(0, 40).map((sc, idx) => (
                <tr key={sc.id} className={idx < 3 ? 'bg-emerald-500/5' : ''}>
                  <td className="py-3 pr-3 font-black font-mono tabular-nums text-amber-500">#{idx + 1}</td>
                  <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">{sc.name}</td>
                  <td className="py-3 px-3 text-slate-500 dark:text-slate-300">{sc.district}</td>
                  <td className="py-3 px-3 text-slate-500 dark:text-slate-400">{sc.ambassadorName || '—'}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{sc.treesPlanted || 0}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-emerald-500">
                    {sc.champScore.toLocaleString()}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setAwardModalTarget({
                          category: 'school',
                          targetId: sc.id,
                          targetName: sc.name,
                          district: sc.district,
                          rank: idx + 1,
                        })
                      }
                      className="px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-[#00F5A0] text-[11px] font-bold hover:bg-emerald-500 hover:text-[#04110B] transition-colors cursor-pointer"
                    >
                      Taqdirlash
                    </button>
                  </td>
                </tr>
              ))}
              {rankedSchools.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Maktablar topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* STUDENTS LEADERBOARD */}
      {activeTab === 'students' && (
        <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-emerald-500/20 text-[11px] font-bold text-slate-400 uppercase">
                <th className="py-2.5 pr-3">O‘rin</th>
                <th className="py-2.5 px-3">O‘quvchi</th>
                <th className="py-2.5 px-3">Maktab & Tuman</th>
                <th className="py-2.5 px-3 text-right">Hisobotlar</th>
                <th className="py-2.5 px-3 text-right">EcoCoin</th>
                <th className="py-2.5 pl-3 text-right">Taqdirlash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/10 text-xs">
              {rankedStudents.slice(0, 40).map((st, idx) => (
                <tr key={st.uid} className={idx < 3 ? 'bg-emerald-500/5' : ''}>
                  <td className="py-3 pr-3 font-black font-mono tabular-nums text-amber-500">#{idx + 1}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2.5">
                      <img
                        src={
                          st.avatarUrl && !st.avatarUrl.includes('dicebear.com')
                            ? st.avatarUrl
                            : realisticAvatarImg
                        }
                        alt={st.fullName}
                        className="w-8 h-8 rounded-full object-cover border border-emerald-400/40 shrink-0"
                      />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{st.fullName}</div>
                        <div className="text-[11px] text-slate-400">{st.grade || 'Eco Qahramon'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-700 dark:text-slate-200">{st.schoolName}</div>
                    <div className="text-[11px] text-slate-400">{st.district}</div>
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums">{st.reportsCount || 0}</td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums font-black text-emerald-500">
                    {st.ecoCoins.toLocaleString()}
                  </td>
                  <td className="py-3 pl-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setAwardModalTarget({
                          category: 'student',
                          targetId: st.uid,
                          targetName: st.fullName,
                          district: st.district,
                          rank: idx + 1,
                        })
                      }
                      className="px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-[#00F5A0] text-[11px] font-bold hover:bg-emerald-500 hover:text-[#04110B] transition-colors cursor-pointer"
                    >
                      Sovg‘a berish
                    </button>
                  </td>
                </tr>
              ))}
              {rankedStudents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    O‘quvchilar topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* AWARDS & VOUCHER VERIFIER */}
      {activeTab === 'awards' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-black">Taqdirlangan G‘oliblar Tarixi</h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400">{regionalAwardHistory.length} ta</span>
            </div>

            <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
              {regionalAwardHistory.map(aw => (
                <div
                  key={aw.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-emerald-600 dark:text-[#00F5A0]">{aw.periodLabel}</span>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(aw.awardedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-300">
                    {aw.district} · Taqdirladi: {aw.awardedByName}
                  </div>
                  {aw.topSchools?.map(ts => (
                    <div
                      key={`${aw.id}-${ts.id}`}
                      className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/70 dark:border-emerald-500/10"
                    >
                      <span className="font-bold">#{ts.rank} {ts.name}</span>
                      <span className="font-mono font-black text-amber-500">
                        +{ts.bonusCoins} ECO {ts.promoCode ? `· ${ts.promoCode}` : ''}
                      </span>
                    </div>
                  ))}
                  {aw.topAmbassadors?.map(ta => (
                    <div
                      key={`${aw.id}-${ta.id}`}
                      className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/70 dark:border-emerald-500/10"
                    >
                      <span className="font-bold">#{ta.rank} {ta.fullName}</span>
                      <span className="font-mono font-black text-amber-500">
                        +{ta.bonusCoins} ECO {ta.promoCode ? `· ${ta.promoCode}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              {regionalAwardHistory.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-400">
                  Hozircha taqdirlangan g‘oliblar mavjud emas. Reyting jadvallaridan g‘oliblarni tanlab taqdirlang.
                </div>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <div className="flex items-center gap-2">
              <QrCode className="w-5 h-5 text-emerald-500" />
              <h3 className="text-sm font-black">Sovg‘a Vaucherlarini Tekshirish</h3>
            </div>
            <VoucherVerifierPanel />
          </div>
        </div>
      )}

      {/* AWARD MODAL */}
      {awardModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmAward}
            className="w-full max-w-md bg-white dark:bg-[#061812] border border-emerald-500/30 rounded-3xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-black">G‘olibni Taqdirlash</h3>
              </div>
              <button
                type="button"
                onClick={() => setAwardModalTarget(null)}
                className="text-xs font-bold text-slate-400 hover:text-white cursor-pointer"
              >
                Yopish
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-1">
              <div className="text-xs font-black text-emerald-600 dark:text-[#00F5A0]">
                #{awardModalTarget.rank}-o‘rin · {awardModalTarget.targetName}
              </div>
              <div className="text-[11px] text-slate-500">
                {awardModalTarget.district || region} · {periodType === 'monthly' ? 'Oylik Chempionat' : 'Yillik Chempionat'}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Sovrin / Nominatsiya nomi</label>
                <input
                  type="text"
                  required
                  value={prizeTitle}
                  onChange={e => setPrizeTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-400"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Mukofot EcoCoin miqdori</label>
                <input
                  type="number"
                  min={50}
                  max={20000}
                  required
                  value={bonusCoins}
                  onChange={e => setBonusCoins(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono font-bold outline-none focus:border-emerald-400"
                />
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setAwardModalTarget(null)}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-[#040D0A] text-xs font-bold cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={awarding}
                className="flex-1 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 text-xs font-black inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{awarding ? 'Saqlanmoqda...' : 'Tasdiqlash & Promo Kod'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
