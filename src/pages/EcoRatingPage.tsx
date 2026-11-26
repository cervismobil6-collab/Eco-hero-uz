import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  School as SchoolIcon,
  User,
  Search,
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
import {
  DistrictLeaderboardDetailsResponse,
  LeaderboardPeriod,
  LeaderboardTier,
} from '../types/eco';
import { StudentCabinetRatingsPanel } from '../components/ratings/StudentCabinetRatingsPanel';
import ecoTrophyCrestImg from '../assets/images/eco_trophy_crest_1795179383102.jpg';

export const EcoRatingPage: React.FC = () => {
  const {
    user,
    rewardSettings,
    fetchLeaderboard,
    fetchDistrictLeaderboardDetails,
    setActiveTab,
    liveSyncVersion,
    ratingIntent,
    clearRatingIntent,
  } = useEco();

  const [tier, setTier] = useState<LeaderboardTier>(() => ratingIntent?.tier || 'school');
  const [period, setPeriod] = useState<LeaderboardPeriod>('monthly');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<string>(() =>
    ratingIntent?.filterToMyDistrict && user.region ? user.region : 'all'
  );
  const [selectedDistrict, setSelectedDistrict] = useState<string>(() =>
    ratingIntent?.filterToMyDistrict && user.district ? user.district : 'all'
  );
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [forbiddenMsg, setForbiddenMsg] = useState<string | null>(null);
  const [districtAmbDetails, setDistrictAmbDetails] = useState<DistrictLeaderboardDetailsResponse | null>(null);
  const [districtAmbLoading, setDistrictAmbLoading] = useState(false);

  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [selectedCertificateAmbassador, setSelectedCertificateAmbassador] = useState<any>(null);

  useEffect(() => {
    if (!ratingIntent) return;
    setTier(ratingIntent.tier);
    setPage(1);
    if (ratingIntent.filterToMyDistrict) {
      if (user.region) setSelectedRegion(user.region);
      if (user.district) setSelectedDistrict(user.district);
    }
    clearRatingIntent();
  }, [ratingIntent, user.region, user.district, clearRatingIntent]);

  useEffect(() => {
    if (tier !== 'ambassador' || !user?.uid) return;
    let active = true;
    setDistrictAmbLoading(true);
    fetchDistrictLeaderboardDetails({
      region: selectedRegion !== 'all' ? selectedRegion : user.region || undefined,
      district: selectedDistrict !== 'all' ? selectedDistrict : user.district || undefined,
    })
      .then(res => {
        if (!active) return;
        setDistrictAmbDetails(res);
      })
      .finally(() => {
        if (active) setDistrictAmbLoading(false);
      });
    return () => {
      active = false;
    };
  }, [tier, user?.uid, user?.region, user?.district, selectedRegion, selectedDistrict, fetchDistrictLeaderboardDetails, liveSyncVersion]);

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

  const getPodiumAvatar = (item: any) => {
    if (item?.avatarUrl && !String(item.avatarUrl).includes('dicebear.com')) return item.avatarUrl;
    return ecoTrophyCrestImg;
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-5">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-3xl p-4 sm:p-6 bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 shadow-2xl">
        <div className="pointer-events-none absolute -right-16 -top-16 w-64 h-64 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 max-w-2xl">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-amber-400/40 bg-[#040D0A] shrink-0 shadow-lg shadow-emerald-950/60">
              <img src={ecoTrophyCrestImg} alt="EcoHero Chempionat" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-[#00F5A0] font-mono text-[11px] font-bold tracking-wider uppercase">
                <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>O&apos;zbekiston Eko-Chempionati · Jonli Reyting</span>
              </div>
              <h1 className="font-display text-xl sm:text-3xl font-black text-white tracking-tight">
                ECO Reyting & Milliy Peshqadamlar
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-snug">
                Tasdiqlangan ekologik faoliyatlar asosida shakllanadigan ko‘p darajali jonli liga.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowFormulaModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold border border-white/15 cursor-pointer"
            >
              <Info className="w-4 h-4 text-[#00F5A0]" />
              <span>Ball Formulasi</span>
            </button>
            <button
              onClick={() => setActiveTab('championship')}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 active:translate-y-[1px] shadow-lg shadow-emerald-500/25 cursor-pointer"
            >
              <Crown className="w-4 h-4" />
              <span>3 Bosqichli Chempionat</span>
            </button>
          </div>
        </div>

        {/* Tier Switcher */}
        <div className="mt-4 pt-4 border-t border-emerald-500/20 flex flex-wrap gap-2 relative z-10">
          {tierTabs.map(t => (
            <button
              key={t.id}
              onClick={() => {
                setTier(t.id);
                setPage(1);
              }}
              className={`flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-xl text-xs font-bold transition-all cursor-pointer ${
                tier === t.id
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 shadow-md shadow-emerald-500/25'
                  : 'bg-[#040D0A]/80 border border-emerald-500/20 text-slate-300 hover:text-white hover:border-emerald-400/40'
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

      {/* Personal School & District Student Monthly Ratings (50+ school / 500+ district) */}
      {tier === 'student' && user?.uid && <StudentCabinetRatingsPanel />}

      {/* Personal District Eco-Elchilar Monthly Ranking */}
      {tier === 'ambassador' && user?.uid && !forbiddenMsg && (() => {
        const ambList = districtAmbDetails?.ambassadorRatings || [];
        const myAmb = districtAmbDetails?.myAmbassadorRating || null;
        const totalAmb = districtAmbDetails?.totalAmbassadorsInDistrict || ambList.length;
        const top3FloorScore = ambList.length >= 3 ? ambList[2]?.realScore || 0 : 0;
        return (
          <div className="rounded-3xl p-5 sm:p-6 bg-white dark:bg-[#071912] border border-emerald-500/25 shadow-xl space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  <Award className="w-3.5 h-3.5" />
                  <span>Tumandagi Eko-Elchilar Reytingi</span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {districtAmbDetails?.district || user.district || 'Tumaningiz'} · Eko-Elchilar Jadvali
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Oy oxirigacha {districtAmbDetails?.daysRemainingInMonth ?? '—'} kun qoldi · TOP-3 g&apos;oliblar taqdirlanadi
                </p>
              </div>
              {myAmb && (
                <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 text-right shrink-0">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Sizning o&apos;rningiz
                  </div>
                  <div className="text-xl font-black font-mono tabular-nums text-emerald-600 dark:text-[#00F5A0]">
                    #{myAmb.rank} <span className="text-xs font-bold text-slate-500 dark:text-slate-400">/ {totalAmb}</span>
                  </div>
                </div>
              )}
            </div>

            {myAmb && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-white">
                    {myAmb.isTop3
                      ? 'Tabriklaymiz! Siz hozir tuman TOP-3 sovrinli zonasidasiz.'
                      : `TOP-3 ga kirish uchun yana +${Math.max(1, top3FloorScore - myAmb.realScore)} ball kerak.`}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {myAmb.schoolName} · {myAmb.verifiedActivitiesCount} tasdiqlangan faoliyat · {myAmb.tasksCompletedCount} vazifa
                  </div>
                </div>
                <div className="font-mono tabular-nums font-black text-amber-500 dark:text-amber-400 text-sm">
                  {myAmb.realScore.toLocaleString()} ball
                </div>
              </div>
            )}

            {districtAmbLoading && ambList.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Tumandagi Eko-Elchilar reytingi yuklanmoqda...
              </div>
            ) : ambList.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                {user.district
                  ? `${user.district} tumani bo'yicha hozircha Eko-Elchilar topilmadi.`
                  : "Profilingizda tuman tanlanmagan. Sozlamalardan tumaningizni kiriting."}
              </div>
            ) : (
              <div className="divide-y divide-slate-200/70 dark:divide-emerald-500/15 max-h-[320px] overflow-y-auto pr-1">
                {ambList.map(amb => (
                  <div
                    key={amb.id}
                    className={`py-2.5 px-3 rounded-xl flex items-center justify-between gap-3 text-xs ${
                      amb.isMe ? 'bg-emerald-500/15 border border-emerald-500/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 font-mono tabular-nums font-black shrink-0 ${
                          amb.isTop3 ? 'text-amber-500 dark:text-amber-400' : 'text-slate-400'
                        }`}
                      >
                        #{amb.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <span className="truncate">{amb.fullName}</span>
                          {amb.isMe && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold shrink-0">
                              Siz
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {amb.schoolName} · {amb.verifiedActivitiesCount} faoliyat · {amb.tasksCompletedCount} vazifa
                        </div>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums font-black text-amber-500 dark:text-amber-400 shrink-0">
                      {amb.realScore.toLocaleString()} ball
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Illuminated Top 3 Podium */}
      {top3.length >= 1 && (
        <div className="relative rounded-3xl p-4 sm:p-6 bg-gradient-to-b from-[#071D15] via-[#05120D] to-[#040D0A] border border-emerald-500/25 shadow-2xl overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(0,245,160,0.16),transparent_70%)]" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-3 relative z-10">
            {/* #2 Silver Pedestal */}
            {top3[1] && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="order-2 md:order-1 relative rounded-2xl bg-[#061812]/95 border border-slate-300/30 p-5 text-center space-y-2.5 shadow-xl"
              >
                <div className="relative mx-auto w-16 h-16">
                  <img
                    src={getPodiumAvatar(top3[1])}
                    alt={getItemTitle(top3[1])}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200 shadow-lg bg-[#040D0A]"
                  />
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-slate-200 text-[#040D0A] text-[11px] font-black font-mono">
                    #2
                  </span>
                </div>
                <div className="pt-1">
                  <div className="font-display font-extrabold text-white text-base truncate">{getItemTitle(top3[1])}</div>
                  <div className="text-xs text-slate-400 truncate">{getItemSub(top3[1])}</div>
                </div>
                <div className="p-3 rounded-2xl bg-[#040D0A]/80 border border-slate-300/15">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Ball / EcoCoin</div>
                  <div className="text-xl font-black font-mono text-slate-100 tabular-nums">
                    {Number(getScoreValue(top3[1])).toLocaleString()}
                  </div>
                </div>
              </motion.div>
            )}

            {/* #1 Champion Raised Pedestal */}
            {top3[0] && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="order-1 md:order-2 relative rounded-3xl bg-gradient-to-b from-amber-500/20 via-[#0B2A1E] to-[#061812] border-2 border-amber-400/75 p-7 text-center space-y-3.5 md:-translate-y-4 shadow-[0_18px_45px_-12px_rgba(245,158,11,0.35)]"
              >
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  <Crown className="w-3.5 h-3.5 text-amber-300" />
                  <span>1-O&apos;rin Chempioni</span>
                </div>
                <div className="relative mx-auto w-20 h-20">
                  <img
                    src={getPodiumAvatar(top3[0])}
                    alt={getItemTitle(top3[0])}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-amber-400 shadow-xl bg-[#040D0A]"
                  />
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-amber-400 text-[#040D0A] text-xs font-black font-mono shadow">
                    #1
                  </span>
                </div>
                <div className="pt-1">
                  <div className="font-display font-black text-white text-lg truncate">{getItemTitle(top3[0])}</div>
                  <div className="text-xs text-emerald-300 truncate">{getItemSub(top3[0])}</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#040D0A]/80 border border-amber-400/35">
                  <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">Umumiy Ball</div>
                  <div className="text-2xl font-black font-mono text-amber-400 tabular-nums">
                    {Number(getScoreValue(top3[0])).toLocaleString()} ECO
                  </div>
                </div>
              </motion.div>
            )}

            {/* #3 Bronze Pedestal */}
            {top3[2] && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="order-3 relative rounded-3xl bg-[#092118]/90 border border-amber-600/35 p-6 text-center space-y-3 shadow-xl"
              >
                <div className="relative mx-auto w-16 h-16">
                  <img
                    src={getPodiumAvatar(top3[2])}
                    alt={getItemTitle(top3[2])}
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-600 shadow-lg bg-[#040D0A]"
                  />
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-black font-mono">
                    #3
                  </span>
                </div>
                <div className="pt-1">
                  <div className="font-display font-extrabold text-white text-base truncate">{getItemTitle(top3[2])}</div>
                  <div className="text-xs text-slate-400 truncate">{getItemSub(top3[2])}</div>
                </div>
                <div className="p-3 rounded-2xl bg-[#040D0A]/80 border border-amber-600/20">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Ball / EcoCoin</div>
                  <div className="text-xl font-black font-mono text-amber-500 tabular-nums">
                    {Number(getScoreValue(top3[2])).toLocaleString()}
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl eco-surface flex flex-col md:flex-row items-center justify-between gap-3 text-xs shadow-sm">
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
              className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          <select
            value={selectedRegion}
            onChange={e => {
              setSelectedRegion(e.target.value);
              setSelectedDistrict('all');
              setPage(1);
            }}
            className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
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
              className="px-3 py-2.5 rounded-xl bg-white dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-800 dark:text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value="all">Barcha tumanlar</option>
              {availableDistricts.map(dist => (
                <option key={dist} value={dist}>{dist}</option>
              ))}
            </select>
          )}
        </div>

        {/* Period Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#040D0A] p-1 rounded-xl border border-slate-200 dark:border-emerald-500/20">
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
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                period === tf.id
                  ? 'bg-emerald-500 text-[#040D0A]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Leaderboard Table */}
      {!forbiddenMsg && (
        <div className="rounded-3xl eco-surface overflow-hidden shadow-xl">
          <div className="px-6 py-4 border-b border-slate-200/80 dark:border-emerald-500/15 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-500" />
              <h3 className="font-display font-extrabold text-sm text-slate-900 dark:text-white uppercase">
                {tierTabs.find(t => t.id === tier)?.label} Reytingi ({period})
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Jami: {total} ta natija
            </span>
          </div>

          <div>
            {loading && items.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-bold uppercase">
                Reyting ma&apos;lumotlari yuklanmoqda...
              </div>
            ) : items.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-bold uppercase">
                Tanlangan filtrlar bo‘yicha natijalar topilmadi
              </div>
            ) : (
              <>
                {/* Mobile Responsive Cards */}
                <div className="md:hidden divide-y divide-slate-200/70 dark:divide-emerald-500/10">
                  {items.map((item, idx) => {
                    const rank = item.rank || (page - 1) * 15 + idx + 1;
                    const isSelf =
                      (item.uid && item.uid === user.uid) ||
                      (item.id && item.id === user.schoolId);
                    return (
                      <div
                        key={item.id || item.uid || idx}
                        className={`p-4 space-y-2 text-xs ${isSelf ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs shrink-0 ${
                                rank === 1
                                  ? 'bg-amber-400 text-[#040D0A]'
                                  : rank === 2
                                  ? 'bg-slate-200 text-[#040D0A]'
                                  : rank === 3
                                  ? 'bg-amber-600 text-white'
                                  : 'bg-slate-100 dark:bg-[#0D261D] text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {rank}
                            </span>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                <span className="truncate">{getItemTitle(item)}</span>
                                {isSelf && (
                                  <span className="text-[10px] font-bold text-emerald-500 shrink-0">(Siz)</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                {item.region || '-'}
                                {item.district ? ` · ${item.district}` : ''}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-black font-mono text-amber-500 dark:text-amber-400 tabular-nums">
                              {Number(getScoreValue(item)).toLocaleString()} ECO
                            </div>
                            {tier === 'ambassador' && (
                              <button
                                onClick={() => setSelectedCertificateAmbassador(item)}
                                className="mt-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold cursor-pointer"
                              >
                                Sertifikat
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums pl-9">
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
                    <thead className="bg-slate-100/80 dark:bg-[#040D0A]/80 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-emerald-500/15">
                      <tr>
                        <th className="py-4 px-4 w-14 text-center">#</th>
                        <th className="py-4 px-4">Ishtirokchi / Hudud</th>
                        <th className="py-4 px-4">Viloyat / Tuman</th>
                        <th className="py-4 px-4 text-center">Faollik Ko&apos;rsatkichlari</th>
                        <th className="py-4 px-4 text-right">Ball / EcoCoin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-emerald-500/10 font-medium">
                      {items.map((item, idx) => {
                        const rank = item.rank || (page - 1) * 15 + idx + 1;
                        const isSelf =
                          (item.uid && item.uid === user.uid) ||
                          (item.id && item.id === user.schoolId);
                        return (
                          <tr
                            key={item.id || item.uid || idx}
                            className={`hover:bg-emerald-500/[0.06] transition-colors ${
                              isSelf ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : ''
                            }`}
                          >
                            <td className="py-4 px-4 text-center font-bold font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                              {rank}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <img
                                  src={getPodiumAvatar(item)}
                                  alt={getItemTitle(item)}
                                  className="w-8 h-8 rounded-xl object-cover border border-emerald-500/30 bg-[#040D0A] shrink-0"
                                />
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>{getItemTitle(item)}</span>
                                    {isSelf && (
                                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold">
                                        Siz
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{getItemSub(item)}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-slate-700 dark:text-slate-300">
                              <div>{item.region || '-'}</div>
                              <div className="text-[11px] text-slate-500">{item.district || ''}</div>
                            </td>
                            <td className="py-4 px-4 text-center text-slate-700 dark:text-slate-300 tabular-nums">
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
                                <span className="font-black font-mono text-amber-500 dark:text-amber-400 text-sm tabular-nums">
                                  {Number(getScoreValue(item)).toLocaleString()} ECO
                                </span>
                                {tier === 'ambassador' && (
                                  <button
                                    onClick={() => setSelectedCertificateAmbassador(item)}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] font-bold hover:bg-emerald-500 hover:text-[#040D0A] cursor-pointer"
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
            <div className="px-6 py-4 border-t border-slate-200 dark:border-emerald-500/15 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="tabular-nums">
                Sahifa {page} / {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Oldingi
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 disabled:opacity-40 flex items-center gap-1 cursor-pointer"
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
              className="w-full max-w-md rounded-3xl bg-[#071912] border-2 border-amber-400/50 p-8 space-y-5 shadow-2xl text-center"
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
              <div className="p-4 rounded-2xl bg-[#040D0A] border border-emerald-500/20 space-y-1 text-xs tabular-nums">
                <div className="font-bold text-amber-300">Tasdiqlangan Eko-Elchi</div>
                <div className="font-mono text-slate-400">Ball: {Number(getScoreValue(selectedCertificateAmbassador)).toLocaleString()} ECO</div>
              </div>
              <button
                onClick={() => setSelectedCertificateAmbassador(null)}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#040D0A] font-black text-xs cursor-pointer"
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
              className="w-full max-w-xl rounded-3xl bg-[#071912] border border-emerald-500/25 p-6 sm:p-8 space-y-6 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-emerald-500/20 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Target className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Ball Formulasi & Qoidalar</h3>
                    <p className="text-xs text-slate-400">Super Admin sozlamalariga ulangan joriy mezonlar</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFormulaModal(false)}
                  className="w-8 h-8 rounded-lg bg-[#040D0A] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs tabular-nums">
                <div className="p-3 rounded-xl bg-[#040D0A] border border-emerald-500/15 flex justify-between">
                  <span className="text-slate-300">Tasdiqlangan muammo</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.problemVerified} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-[#040D0A] border border-emerald-500/15 flex justify-between">
                  <span className="text-slate-300">Hal etilgan muammo</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.problemResolved} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-[#040D0A] border border-emerald-500/15 flex justify-between">
                  <span className="text-slate-300">Daraxt ekish videosi</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.treePlanting} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-[#040D0A] border border-emerald-500/15 flex justify-between">
                  <span className="text-slate-300">Chiqindi saralash</span>
                  <span className="font-mono font-bold text-emerald-400">+{rewardSettings.wasteSorting} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-[#040D0A] border border-emerald-500/15 flex justify-between">
                  <span className="text-slate-300">Kunlik Eko-Viktorina</span>
                  <span className="font-mono font-bold text-amber-400">+{rewardSettings.dailyQuiz} ECO</span>
                </div>
                <div className="p-3 rounded-xl bg-[#040D0A] border border-emerald-500/15 flex justify-between">
                  <span className="text-slate-300">Elchi topshirig‘i</span>
                  <span className="font-mono font-bold text-amber-400">+{rewardSettings.ambassadorTaskBonus} ECO</span>
                </div>
              </div>

              <button
                onClick={() => setShowFormulaModal(false)}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#040D0A] font-black text-xs cursor-pointer"
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
