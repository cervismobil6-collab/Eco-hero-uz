import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  School as SchoolIcon,
  User,
  Search,
  Sparkles,
  ShieldCheck,
  Award,
  Info,
  BarChart3,
  Target,
  Crown,
  Lock,
  MapPin,
  Globe,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../data/mockData';
import { LeaderboardPeriod, LeaderboardTier } from '../types/eco';

export const EcoRatingPage: React.FC = () => {
  const { user, rewardSettings, fetchLeaderboard, setActiveTab, liveSyncVersion } = useEco();

  const [tier, setTier] = useState<LeaderboardTier>('school');
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [selectedDistrict, setSelectedDistrict] = useState<string>('all');
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [forbiddenMsg, setForbiddenMsg] = useState<string | null>(null);

  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [selectedCertificateAmbassador, setSelectedCertificateAmbassador] = useState<any>(null);

  const availableDistricts = useMemo(() => {
    if (selectedRegion === 'all' || !UZBEKISTAN_DISTRICTS[selectedRegion]) return [];
    return UZBEKISTAN_DISTRICTS[selectedRegion];
  }, [selectedRegion]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setForbiddenMsg(null);
    fetchLeaderboard(tier, {
      period,
      region: selectedRegion !== 'all' ? selectedRegion : undefined,
      district: selectedDistrict !== 'all' ? selectedDistrict : undefined,
      search: searchQuery.trim() || undefined,
      page,
      limit: 15,
    })
      .then(res => {
        if (!mounted) return;
        if (res.forbidden) {
          setForbiddenMsg(res.error || "Ushbu maxsus reyting faqat vakolatli a'zolar va administratorlar uchun ochiq.");
          setItems([]);
          setTotal(0);
          setTotalPages(1);
        } else {
          setItems(res.items || []);
          setTotal(res.total || 0);
          setTotalPages(res.totalPages || 1);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [tier, period, selectedRegion, selectedDistrict, searchQuery, page, fetchLeaderboard, liveSyncVersion]);

  const top3 = useMemo(() => (page === 1 && !forbiddenMsg ? items.slice(0, 3) : []), [items, page, forbiddenMsg]);

  const getScoreValue = (item: any) => {
    return item.score ?? item.totalCoins ?? item.ecoCoins ?? item.awardedCoins ?? 0;
  };

  const getItemTitle = (item: any) => {
    return item.name || item.fullName || item.district || item.region || 'Ishtirokchi';
  };

  const getItemSub = (item: any) => {
    if (tier === 'district') return item.region || "O'zbekiston";
    if (tier === 'regional') return `${item.schoolsCount || 0} maktab · ${item.studentsCount || 0} o‘quvchi`;
    return item.schoolName || item.region || 'Maktab';
  };

  const tierTabs: { id: LeaderboardTier; label: string; icon: React.ComponentType<any>; restricted?: boolean }[] = [
    { id: 'school', label: 'Maktablar', icon: SchoolIcon },
    { id: 'student', label: "O'quvchilar", icon: User },
    { id: 'district', label: 'Tumanlar', icon: MapPin },
    { id: 'regional', label: 'Viloyatlar', icon: Globe },
    { id: 'ambassador', label: 'Eko-Elchilar', icon: Award, restricted: true },
    { id: 'district_leaders', label: 'Tuman Koordinatorlari', icon: ShieldCheck, restricted: true },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-slate-900 via-emerald-950/40 to-slate-900 border border-emerald-500/20 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-semibold tracking-wider uppercase">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>O'zbekiston Eko-Chempionati · Jonli Reyting</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              ECO Reyting & Milliy Peshqadamlar
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Tasdiqlangan ekologik faoliyatlar asosida shakllanadigan ko‘p darajali reyting tizimi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowFormulaModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold border border-white/10 cursor-pointer"
            >
              <Info className="w-4 h-4 text-emerald-400" />
              <span>Ball Formulasi</span>
            </button>
            <button
              onClick={() => setActiveTab('championship')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-600/30 cursor-pointer"
            >
              <Crown className="w-4 h-4 text-amber-300" />
              <span>3 Bosqichli Chempionat</span>
            </button>
          </div>
        </div>

        {/* Tier Switcher */}
        <div className="mt-6 pt-6 border-t border-slate-800 flex flex-wrap gap-2">
          {tierTabs.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setTier(t.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tier === t.id
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-950/70 border border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <t.icon className="w-4 h-4" />
              <span>{t.label}</span>
              {t.restricted && <Lock className="w-3 h-3 text-amber-400" />}
            </button>
          ))}
        </div>
      </div>

      {/* Permission-Gated Banner if 403 */}
      {forbiddenMsg && (
        <div className="p-8 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black uppercase">Ruxsat Cheklangan (403)</h2>
          <p className="text-xs text-slate-600 dark:text-slate-300 max-w-lg mx-auto">{forbiddenMsg}</p>
        </div>
      )}

      {/* Top 3 Podium */}
      {top3.length >= 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end pt-2">
          {top3[1] && (
            <div className="order-2 md:order-1 p-6 rounded-3xl bg-slate-900 border border-slate-700/60 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-950 flex items-center justify-center mx-auto text-lg font-black">
                2
              </div>
              <div>
                <div className="font-extrabold text-white text-base truncate">{getItemTitle(top3[1])}</div>
                <div className="text-xs text-slate-400 truncate">{getItemSub(top3[1])}</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-xs text-slate-400">Ball / EcoCoin</div>
                <div className="text-xl font-black font-mono text-slate-200 tabular-nums">
                  {Number(getScoreValue(top3[1])).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {top3[0] && (
            <div className="order-1 md:order-2 relative p-7 rounded-3xl bg-gradient-to-b from-amber-500/20 via-slate-900 to-slate-900 border-2 border-amber-400/80 text-center space-y-3 md:-translate-y-3">
              <div className="w-16 h-16 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center mx-auto text-2xl font-black">
                <Crown className="w-8 h-8" />
              </div>
              <div>
                <div className="font-black text-white text-lg truncate">{getItemTitle(top3[0])}</div>
                <div className="text-xs text-emerald-400 truncate">{getItemSub(top3[0])}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <div className="text-xs text-amber-300 font-semibold">1-O'rin Chempioni</div>
                <div className="text-2xl font-black font-mono text-amber-400 tabular-nums">
                  {Number(getScoreValue(top3[0])).toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {top3[2] && (
            <div className="order-3 p-6 rounded-3xl bg-slate-900 border border-amber-800/40 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-600 text-slate-950 flex items-center justify-center mx-auto text-lg font-black">
                3
              </div>
              <div>
                <div className="font-extrabold text-white text-base truncate">{getItemTitle(top3[2])}</div>
                <div className="text-xs text-slate-400 truncate">{getItemSub(top3[2])}</div>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                <div className="text-xs text-slate-400">Ball / EcoCoin</div>
                <div className="text-xl font-black font-mono text-amber-500 tabular-nums">
                  {Number(getScoreValue(top3[2])).toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto flex-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Qidiruv (nom, maktab, hudud)..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder:text-slate-500 text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedRegion}
            onChange={e => {
              setSelectedRegion(e.target.value);
              setSelectedDistrict('all');
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
          >
            <option value="all">Barcha viloyatlar</option>
            {UZBEKISTAN_REGIONS.map(reg => (
              <option key={reg} value={reg}>{reg}</option>
            ))}
          </select>

          {availableDistricts.length > 0 && (
            <select
              value={selectedDistrict}
              onChange={e => {
                setSelectedDistrict(e.target.value);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Barcha tumanlar</option>
              {availableDistricts.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
          )}
        </div>

        {/* Period Switcher */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
          {([
            { id: 'monthly', label: 'Oylik' },
            { id: 'quarterly', label: 'Choraklik' },
            { id: 'yearly', label: 'Yillik' },
          ] as const).map(tf => (
            <button
              key={tf.id}
              onClick={() => {
                setPeriod(tf.id);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                period === tf.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Leaderboard Table */}
      {!forbiddenMsg && (
        <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-400" />
              <h3 className="font-extrabold text-sm text-white uppercase">
                {tierTabs.find(t => t.id === tier)?.label} Reytingi ({period})
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              Jami: {total} ta natija
            </span>
          </div>

          <div>
            {loading && items.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-bold uppercase">
                Reyting ma'lumotlari yuklanmoqda...
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-bold uppercase">
                Tanlangan filtrlar bo‘yicha natijalar topilmadi
              </div>
            ) : (
              <>
                {/* Mobile Responsive Cards */}
                <div className="md:hidden divide-y divide-slate-800/80">
                  {items.map((item, idx) => {
                    const rank = item.rank || (page - 1) * 15 + idx + 1;
                    const isSelf =
                      (item.uid && item.uid === user.uid) ||
                      (item.id && item.id === user.schoolId);
                    return (
                      <div
                        key={item.id || item.uid || idx}
                        className={`p-4 space-y-2 text-xs ${isSelf ? 'bg-emerald-950/50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 ${
                                rank === 1
                                  ? 'bg-amber-400 text-slate-950'
                                  : rank === 2
                                  ? 'bg-slate-200 text-slate-950'
                                  : rank === 3
                                  ? 'bg-amber-600 text-slate-950'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {rank}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{getItemTitle(item)}</span>
                                {isSelf && (
                                  <span className="text-[10px] font-bold text-emerald-400 shrink-0">(Siz)</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {item.region || '-'}
                                {item.district ? ` · ${item.district}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black font-mono text-amber-400 tabular-nums">
                              {Number(getScoreValue(item)).toLocaleString()} ECO
                            </div>
                            {tier === 'ambassador' && (
                              <button
                                onClick={() => setSelectedCertificateAmbassador(item)}
                                className="mt-1 px-2 py-0.5 rounded bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold cursor-pointer"
                              >
                                Sertifikat
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono tabular-nums pl-9">
                          {tier === 'school' && (
                            <span>
                              {item.registeredStudentsCount || item.studentsCount || 0} o‘quvchi · {item.treesPlanted || 0} daraxt
                            </span>
                          )}
                          {tier === 'student' && (
                            <span>
                              {item.reportsCount || 0} hisobot · {item.treesPlanted || 0} daraxt
                            </span>
                          )}
                          {tier === 'ambassador' && (
                            <span>
                              {item.tasksCompletedCount || 0} vazifa · {item.mediaCount || 0} media
                            </span>
                          )}
                          {(tier === 'district' || tier === 'regional' || tier === 'district_leaders') && (
                            <span>
                              {item.schoolsCount || item.schoolsCount === 0 ? `${item.schoolsCount} maktab · ` : ''}
                              {item.resolvedCount || item.reportsResolved || 0} hal etilgan
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="py-4 px-4 w-14 text-center">#</th>
                        <th className="py-4 px-4">Ishtirokchi / Hudud</th>
                        <th className="py-4 px-4">Viloyat / Tuman</th>
                        <th className="py-4 px-4 text-center">Faollik Ko'rsatkichlari</th>
                        <th className="py-4 px-4 text-right">Ball / EcoCoin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80 font-medium">
                      {items.map((item, idx) => {
                        const rank = item.rank || (page - 1) * 15 + idx + 1;
                        const isSelf =
                          (item.uid && item.uid === user.uid) ||
                          (item.id && item.id === user.schoolId);
                        return (
                          <tr
                            key={item.id || item.uid || idx}
                            className={`hover:bg-slate-800/50 transition-colors ${
                              isSelf ? 'bg-emerald-950/50' : ''
                            }`}
                          >
                            <td className="py-4 px-4 text-center font-bold font-mono text-slate-300 tabular-nums">
                              {rank}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                {item.avatarUrl && (
                                  <img
                                    src={item.avatarUrl}
                                    alt={getItemTitle(item)}
                                    className="w-8 h-8 rounded-full object-cover border border-slate-700"
                                  />
                                )}
                                <div>
                                  <div className="font-bold text-white flex items-center gap-2">
                                    <span>{getItemTitle(item)}</span>
                                    {isSelf && (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                        Siz
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-400">{getItemSub(item)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-slate-300">
                              <div>{item.region || '-'}</div>
                              <div className="text-[11px] text-slate-500">{item.district || ''}</div>
                            </td>
                            <td className="py-4 px-4 text-center text-slate-300 tabular-nums">
                              {tier === 'school' && (
                                <span>
                                  {item.registeredStudentsCount || item.studentsCount || 0} o‘quvchi · {item.treesPlanted || 0} daraxt
                                </span>
                              )}
                              {tier === 'student' && (
                                <span>
                                  {item.reportsCount || 0} hisobot · {item.treesPlanted || 0} daraxt
                                </span>
                              )}
                              {tier === 'ambassador' && (
                                <span>
                                  {item.tasksCompletedCount || 0} vazifa · {item.mediaCount || 0} media
                                </span>
                              )}
                              {(tier === 'district' || tier === 'regional' || tier === 'district_leaders') && (
                                <span>
                                  {item.schoolsCount || item.schoolsCount === 0 ? `${item.schoolsCount} maktab · ` : ''}
                                  {item.resolvedCount || item.reportsResolved || 0} hal etilgan
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <span className="font-black font-mono text-amber-400 text-sm tabular-nums">
                                  {Number(getScoreValue(item)).toLocaleString()} ECO
                                </span>
                                {tier === 'ambassador' && (
                                  <button
                                    onClick={() => setSelectedCertificateAmbassador(item)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold hover:bg-emerald-600 hover:text-white cursor-pointer"
                                  >
                                    Sertifikat
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span className="tabular-nums">
                Sahifa {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Oldingi
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  Keyingi <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ambassador Certificate Modal */}
      <AnimatePresence>
        {selectedCertificateAmbassador && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md rounded-3xl bg-slate-900 border-2 border-amber-400/50 p-8 space-y-5 shadow-2xl text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Award className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  Rasmiy Eko-Elchi Sertifikati
                </div>
                <h3 className="text-2xl font-black text-white">{getItemTitle(selectedCertificateAmbassador)}</h3>
                <p className="text-xs text-slate-400">{getItemSub(selectedCertificateAmbassador)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1 text-xs tabular-nums">
                <div className="font-bold text-amber-300">Tasdiqlangan Eko-Elchi</div>
                <div className="font-mono text-slate-400">Ball: {Number(getScoreValue(selectedCertificateAmbassador)).toLocaleString()} ECO</div>
              </div>
              <button
                onClick={() => setSelectedCertificateAmbassador(null)}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
              >
                Yopish
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Formula Modal Driven by Dynamic rewardSettings */}
      <AnimatePresence>
        {showFormulaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Ball Formulasi & Qoidalar</h3>
                    <p className="text-xs text-slate-400">Super Admin sozlamalariga ulangan joriy mezonlar</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFormulaModal(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs tabular-nums">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Tasdiqlangan muammo</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.problemVerified} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Hal etilgan muammo</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.problemResolved} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Daraxt ekish videosi</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.treePlanting} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Chiqindi saralash</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.wasteSorting} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Kunlik Eko-Viktorina</span>
                  <span className="font-mono font-bold text-amber-400">+{rewardSettings.dailyQuiz} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between">
                  <span className="text-slate-300">Elchi topshirig‘i</span>
                  <span className="font-mono font-bold text-amber-400">+{rewardSettings.ambassadorTaskBonus} ECO</span>
                </div>
              </div>

              <button
                onClick={() => setShowFormulaModal(false)}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer"
              >
                Tushundim
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
