import React, { useEffect, useState } from 'react';
import { Trophy, School as SchoolIcon, MapPin, Gift, Lock, Crown, Users, ArrowRight } from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { StudentRatingEntry, StudentRatingScopePayload, StudentRatingsCabinetResponse } from '../../types/eco';

interface StudentCabinetRatingsPanelProps {
  compact?: boolean;
  onOpenFullRatings?: () => void;
}

export const StudentCabinetRatingsPanel: React.FC<StudentCabinetRatingsPanelProps> = ({
  compact = false,
  onOpenFullRatings,
}) => {
  const { user, fetchStudentRatingsCabinet, liveSyncVersion } = useEco();
  const [data, setData] = useState<StudentRatingsCabinetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeScope, setActiveScope] = useState<'school' | 'district'>('school');

  useEffect(() => {
    let mounted = true;
    setLoading(prev => prev && !data);
    fetchStudentRatingsCabinet().then(res => {
      if (!mounted) return;
      if (res) setData(res);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchStudentRatingsCabinet, liveSyncVersion, user.schoolId, user.district, user.ecoCoins]);

  const school = data?.school;
  const district = data?.district;
  const current: StudentRatingScopePayload | undefined = activeScope === 'school' ? school : district;

  const renderProgressText = (scopeData?: StudentRatingScopePayload) => {
    if (!scopeData) return '—';
    if (scopeData.isLiveActive) {
      return scopeData.myRank ? `#${scopeData.myRank} / ${scopeData.totalParticipants}` : `${scopeData.totalParticipants} ishtirokchi`;
    }
    return `${scopeData.currentMembersCount} / ${scopeData.minMembersThreshold}`;
  };

  const renderRow = (entry: StudentRatingEntry, scopeData: StudentRatingScopePayload, highlightSelfRow = false) => {
    const isTopPrizeZone = scopeData.scope === 'school' ? entry.rank === 1 : entry.rank <= 3;
    const isMe = Boolean(entry.isMe || entry.uid === user.uid);

    return (
      <div
        key={`${entry.uid}_${entry.rank}`}
        className={`py-3 px-4 flex items-center justify-between gap-3 text-xs transition-colors ${
          highlightSelfRow || isMe
            ? 'bg-emerald-500/10 dark:bg-emerald-500/15'
            : isTopPrizeZone
            ? 'bg-amber-500/[0.04]'
            : ''
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-8 text-left font-mono tabular-nums font-bold shrink-0 ${
              entry.rank === 1
                ? 'text-amber-500'
                : entry.rank <= 3 && scopeData.scope === 'district'
                ? 'text-amber-500'
                : isMe
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-400'
            }`}
          >
            #{entry.rank}
          </span>
          <div className="min-w-0">
            <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-2">
              <span className="truncate">{entry.fullName}</span>
              {isMe && (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                  (Sizning o‘rningiz)
                </span>
              )}
              {isTopPrizeZone && (
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                  · Sovrinli o‘rin
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {scopeData.scope === 'district'
                ? `${entry.schoolName || 'Maktab'}${entry.grade ? ` · ${entry.grade}` : ''}`
                : `${entry.grade ? `${entry.grade} · ` : ''}${entry.monthlyActivitiesCount} ta faollik`}
              <span aria-hidden="true"> · </span>
              <span className="font-mono tabular-nums">{entry.totalCoins.toLocaleString()} ECO</span>
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono tabular-nums font-black text-slate-900 dark:text-white">
            {entry.monthlyScore.toLocaleString()} ball
          </div>
          {highlightSelfRow && scopeData.pointsToTop10 ? (
            <div className="text-[11px] font-mono tabular-nums text-amber-600 dark:text-amber-400">
              Top-10 gacha +{scopeData.pointsToTop10.toLocaleString()} ball
            </div>
          ) : (
            <div className="text-[11px] font-mono tabular-nums text-slate-400">
              +{entry.monthlyEarnedCoins.toLocaleString()} EC/oy
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="eco-surface rounded-3xl overflow-hidden shadow-xl">
      {/* Header & Summary Strip */}
      <div className="p-6 border-b border-slate-200/80 dark:border-emerald-500/15 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <h2 className="font-display text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
              <span>Jonli Oylik Reytinglarim (Maktab & Tuman)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {current?.periodLabel || 'Joriy oy'} · Top-10 yetakchilar va ularning ortidan sizning aniq o‘rningiz
            </p>
          </div>
          {onOpenFullRatings && (
            <button
              type="button"
              onClick={onOpenFullRatings}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-emerald-500/25 text-xs font-semibold text-slate-700 dark:text-emerald-300 hover:bg-emerald-500/10 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Barcha reytinglar</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Dual Rank Summary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setActiveScope('school')}
            className={`text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
              activeScope === 'school'
                ? 'border-emerald-500/60 bg-emerald-500/[0.08]'
                : 'border-slate-200 dark:border-emerald-500/15 hover:bg-slate-50 dark:hover:bg-[#040D0A]/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <SchoolIcon className="w-3.5 h-3.5 text-emerald-500" />
                Maktabdagi o‘rningiz
              </span>
              <span className={school?.isLiveActive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
                {school?.isLiveActive ? 'Jonli faol' : 'Kutilmoqda'}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {renderProgressText(school)}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {school?.schoolName || user.schoolName || 'Maktab'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveScope('district')}
            className={`text-left p-4 rounded-2xl border transition-colors cursor-pointer ${
              activeScope === 'district'
                ? 'border-amber-500/60 bg-amber-500/[0.08]'
                : 'border-slate-200 dark:border-emerald-500/15 hover:bg-slate-50 dark:hover:bg-[#040D0A]/60'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 font-semibold">
                <MapPin className="w-3.5 h-3.5 text-amber-500" />
                Tumandagi o‘rningiz (1 oylik)
              </span>
              <span className={district?.isLiveActive ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-amber-600 dark:text-amber-400 font-semibold'}>
                {district?.isLiveActive ? 'Jonli faol' : 'Kutilmoqda'}
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <span className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {renderProgressText(district)}
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {district?.district || user.district || 'Tuman'}
              </span>
            </div>
          </button>
        </div>

        {/* Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#040D0A] rounded-xl w-full sm:w-fit border border-slate-200 dark:border-emerald-500/15">
          <button
            type="button"
            onClick={() => setActiveScope('school')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeScope === 'school'
                ? 'bg-white dark:bg-[#0D261D] text-slate-900 dark:text-emerald-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Maktab Reytingi (Top 10 · 1-o‘ringa sovg‘a)
          </button>
          <button
            type="button"
            onClick={() => setActiveScope('district')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              activeScope === 'district'
                ? 'bg-white dark:bg-[#0D261D] text-slate-900 dark:text-amber-300 shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Tuman Reytingi (Top 10 · 3 ta sovg‘a)
          </button>
        </div>
      </div>

      {/* Body */}
      {loading && !data ? (
        <div className="p-8 text-center text-xs text-slate-500">Reyting ma’lumotlari yuklanmoqda...</div>
      ) : !current ? (
        <div className="p-8 text-center text-xs text-slate-500">
          Reyting ma’lumotlarini ko‘rish uchun profilingizda maktab va tumaningizni belgilang.
        </div>
      ) : !current.isLiveActive ? (
        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Lock className="w-3.5 h-3.5" />
                <span>
                  {current.scope === 'school'
                    ? 'Maktab reytingi hali ishga tushirilmagan'
                    : 'Tuman oylik reytingi hali ishga tushirilmagan'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                {current.canActivate
                  ? current.scope === 'school'
                    ? `Minimal ${current.minMembersThreshold} nafar o‘quvchi chegarasiga yetildi. Maktab Sardori boshqaruv panelidan reytingni yoqishi bilan jonli jadval ochiladi.`
                    : `Minimal ${current.minMembersThreshold} nafar ishtirokchi chegarasiga yetildi. Tuman Koordinatori reytingni yoqishi bilan jonli jadval ochiladi.`
                  : current.scope === 'school'
                  ? `Reyting o‘z-o‘zidan yoqilmaydi: maktabingizdan kamida ${current.minMembersThreshold} ta o‘quvchi qo‘shilgandan so‘ng Maktab Sardori jonli reytingni ishga tushiradi.`
                  : `Tuman reytingi tumandan kamida ${current.minMembersThreshold} ta ishtirokchi qatnashgandan keyin Tuman Koordinatori tomonidan ishga tushiriladi.`}
              </p>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <div className="text-xs text-slate-500">Joriy qamrov</div>
              <div className="text-xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {current.currentMembersCount} / {current.minMembersThreshold}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1.5">
            <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((current.currentMembersCount / Math.max(1, current.minMembersThreshold)) * 100)
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono tabular-nums">
              <span>
                <Users className="w-3 h-3 inline mr-1" />
                {current.currentMembersCount} ta qo‘shilgan
              </span>
              <span>
                {current.canActivate
                  ? 'Chegara bajarilgan · Admin yoqishi kutilmoqda'
                  : `Yana ${Math.max(0, current.minMembersThreshold - current.currentMembersCount)} ta kerak`}
              </span>
            </div>
          </div>

          {/* Prize Preview */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {current.scope === 'school'
                  ? 'Reyting yoqilgach 1-o‘ringa beriladigan sovg‘a:'
                  : '1 oylik eng faol TOP-3 o‘quvchilar uchun qimmatbaho sovg‘alar:'}
              </span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {current.prizes.map(p => (
                <div key={p.rank} className="py-2 flex items-center justify-between gap-3">
                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                    <span className="font-mono font-bold text-amber-500 mr-2">#{p.rank}</span>
                    {p.title}
                  </span>
                  <span className="font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                    +{p.bonusCoins.toLocaleString()} ECO
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div>
          {/* Active Prize Banner Strip */}
          <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-bold text-slate-800 dark:text-slate-200 inline-flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-500" />
                {current.scope === 'school' ? '1-o‘rin sovg‘asi:' : '1 oylik TOP-3 sovg‘alar:'}
              </span>
              {current.prizes.map((p, idx) => (
                <span key={p.rank} className="text-slate-600 dark:text-slate-300">
                  {idx > 0 && <span className="mr-2 text-slate-400">·</span>}
                  <b className="font-mono text-amber-600 dark:text-amber-400">#{p.rank}</b> {p.title}{' '}
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">(+{p.bonusCoins} ECO)</span>
                </span>
              ))}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
              {current.daysRemainingInMonth > 0
                ? `Oy yakunigacha: ${current.daysRemainingInMonth} kun`
                : 'Bugun oy yakuni'}
            </div>
          </div>

          {/* Top 10 List */}
          {current.top10.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Hali reytingga ball to‘plagan o‘quvchilar mavjud emas. Ilk ekologik harakatni bajaring!
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {(compact ? current.top10.slice(0, 10) : current.top10).map(entry => renderRow(entry, current))}

              {/* If caller is ranked below #10, show separator and exact position below Top 10 */}
              {current.myEntry && current.myRank && current.myRank > 10 && (
                <>
                  <div className="py-1.5 px-4 text-center text-xs font-mono text-slate-400 tracking-[0.4em] bg-slate-50/70 dark:bg-slate-950/50">
                    ···
                  </div>
                  {renderRow(current.myEntry, current, true)}
                </>
              )}
            </div>
          )}

          {/* Bottom Personal Position Summary */}
          {current.myEntry && (
            <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                Jami ishtirokchilar: <b className="font-mono tabular-nums">{current.totalParticipants}</b> · Sizning o‘rningiz:{' '}
                <b className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">#{current.myRank}</b>
              </span>
              <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                {current.scope === 'school'
                  ? current.myRank === 1
                    ? 'Siz hozir maktabda 1-o‘rindasiz!'
                    : current.pointsToTop1
                    ? `1-o‘ringacha: +${current.pointsToTop1.toLocaleString()} ball`
                    : ''
                  : current.myRank && current.myRank <= 3
                  ? `Siz hozir TOP-3 sovrinli o‘rindasiz (#${current.myRank})!`
                  : current.pointsToTop3
                  ? `TOP-3 sovrinli zonagacha: +${current.pointsToTop3.toLocaleString()} ball`
                  : ''}
              </span>
            </div>
          )}

          {/* Recent Monthly Winners */}
          {current.recentWinners && current.recentWinners.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Gift className="w-3.5 h-3.5 text-amber-500" />
                <span>So‘nggi oy g‘oliblari ({current.recentWinners[0].periodLabel})</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {current.recentWinners[0].winners.map(w => (
                  <div key={`${w.uid}_${w.rank}`} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="text-slate-700 dark:text-slate-300">
                      <b className="font-mono text-amber-500 mr-1.5">#{w.rank}</b>
                      {w.fullName}
                      {w.schoolName && current.scope === 'district' ? ` · ${w.schoolName}` : ''}
                    </span>
                    <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                      +{w.bonusCoins} ECO
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
