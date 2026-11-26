import React, { useCallback, useEffect, useState } from 'react';
import {
  Trophy,
  Power,
  Gift,
  Users,
  Save,
  Crown,
  CheckCircle2,
  Lock,
  Copy,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { StudentRatingScopePayload } from '../../types/eco';

interface StudentRatingManagerCardProps {
  mode: 'school' | 'district';
  schoolId?: string;
  schoolName?: string;
  region?: string;
  district?: string;
}

export const StudentRatingManagerCard: React.FC<StudentRatingManagerCardProps> = ({
  mode,
  schoolId,
  schoolName,
  region,
  district,
}) => {
  const {
    user,
    liveSyncVersion,
    fetchStudentRatingsManage,
    updateSchoolStudentRatingConfig,
    updateDistrictStudentRatingConfig,
    awardSchoolTop1Student,
    awardDistrictTop3Students,
    showNotification,
  } = useEco();

  const [payload, setPayload] = useState<StudentRatingScopePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [confirmEarlyAward, setConfirmEarlyAward] = useState(false);

  // School editable fields
  const [schoolThreshold, setSchoolThreshold] = useState('50');
  const [schoolPrizeTitle, setSchoolPrizeTitle] = useState("Maktabning Eng Faol O'quvchisi — Qimmatbaho Sovg'a");
  const [schoolBonusCoins, setSchoolBonusCoins] = useState('500');

  // District editable fields
  const [distThreshold, setDistThreshold] = useState('500');
  const [top1Prize, setTop1Prize] = useState("1-o'rin: Smart-soat / Planshet + Oltin Diplom");
  const [top2Prize, setTop2Prize] = useState("2-o'rin: Simsiz Quloqchin + Kumush Diplom");
  const [top3Prize, setTop3Prize] = useState("3-o'rin: Eko-Ryukzak va Kitoblar To'plami");
  const [bonus1, setBonus1] = useState('1500');
  const [bonus2, setBonus2] = useState('1000');
  const [bonus3, setBonus3] = useState('700');

  const syncFormFromPayload = (p: StudentRatingScopePayload) => {
    if (mode === 'school') {
      setSchoolThreshold(String(p.minMembersThreshold || 50));
      setSchoolPrizeTitle(p.prizes[0]?.title || "Maktabning Eng Faol O'quvchisi — Qimmatbaho Sovg'a");
      setSchoolBonusCoins(String(p.prizes[0]?.bonusCoins ?? 500));
    } else {
      setDistThreshold(String(p.minMembersThreshold || 500));
      setTop1Prize(p.prizes[0]?.title || "1-o'rin: Smart-soat / Planshet + Oltin Diplom");
      setTop2Prize(p.prizes[1]?.title || "2-o'rin: Simsiz Quloqchin + Kumush Diplom");
      setTop3Prize(p.prizes[2]?.title || "3-o'rin: Eko-Ryukzak va Kitoblar To'plami");
      setBonus1(String(p.prizes[0]?.bonusCoins ?? 1500));
      setBonus2(String(p.prizes[1]?.bonusCoins ?? 1000));
      setBonus3(String(p.prizes[2]?.bonusCoins ?? 700));
    }
  };

  const loadData = useCallback(async () => {
    setLoading(prev => prev && !payload);
    const res = await fetchStudentRatingsManage({
      schoolId: schoolId || user.schoolId,
      region: region || user.region,
      district: district || user.district,
    });
    const next = mode === 'school' ? res?.school : res?.district;
    if (next) {
      setPayload(next);
      syncFormFromPayload(next);
    }
    setLoading(false);
  }, [fetchStudentRatingsManage, mode, schoolId, region, district, user.schoolId, user.region, user.district]);

  useEffect(() => {
    loadData();
  }, [loadData, liveSyncVersion]);

  const handleToggle = async () => {
    if (!payload) return;
    const targetEnabled = !payload.enabled;
    setToggling(true);
    try {
      if (mode === 'school') {
        const res = await updateSchoolStudentRatingConfig({
          schoolId: payload.schoolId,
          schoolName: payload.schoolName || schoolName,
          enabled: targetEnabled,
        });
        if (res.school) {
          setPayload(res.school);
          syncFormFromPayload(res.school);
        }
      } else {
        const res = await updateDistrictStudentRatingConfig({
          region: payload.region,
          district: payload.district,
          enabled: targetEnabled,
        });
        if (res.district) {
          setPayload(res.district);
          syncFormFromPayload(res.district);
        }
      }
    } finally {
      setToggling(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payload) return;
    setSaving(true);
    try {
      if (mode === 'school') {
        const res = await updateSchoolStudentRatingConfig({
          schoolId: payload.schoolId,
          schoolName: payload.schoolName || schoolName,
          minMembersThreshold: Number(schoolThreshold) || 50,
          monthlyPrizeTitle: schoolPrizeTitle.trim(),
          bonusCoins: Number(schoolBonusCoins) || 0,
        });
        if (res.school) {
          setPayload(res.school);
          syncFormFromPayload(res.school);
        }
      } else {
        const res = await updateDistrictStudentRatingConfig({
          region: payload.region,
          district: payload.district,
          minMembersThreshold: Number(distThreshold) || 500,
          top1Prize: top1Prize.trim(),
          top2Prize: top2Prize.trim(),
          top3Prize: top3Prize.trim(),
          bonuses: [Number(bonus1) || 0, Number(bonus2) || 0, Number(bonus3) || 0],
        });
        if (res.district) {
          setPayload(res.district);
          syncFormFromPayload(res.district);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const executeAward = async () => {
    if (!payload) return;
    setAwarding(true);
    setConfirmEarlyAward(false);
    try {
      if (mode === 'school') {
        const res = await awardSchoolTop1Student({
          schoolId: payload.schoolId,
          schoolName: payload.schoolName,
        });
        if (res.school) setPayload(res.school);
      } else {
        const res = await awardDistrictTop3Students({
          region: payload.region,
          district: payload.district,
        });
        if (res.district) setPayload(res.district);
      }
    } finally {
      setAwarding(false);
    }
  };

  const handleAwardClick = () => {
    if (!payload) return;
    if (!payload.isLastDayOfMonth && !confirmEarlyAward) {
      setConfirmEarlyAward(true);
      return;
    }
    executeAward();
  };

  const previewRows = payload?.previewTop10 || payload?.top10 || [];
  const pct = payload
    ? Math.min(100, Math.round((payload.currentMembersCount / Math.max(1, payload.minMembersThreshold)) * 100))
    : 0;

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4">
      {/* Header + Activation Toggle */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            <span>
              {mode === 'school'
                ? "Maktab O'quvchilari Reytingini Boshqarish (1-O'ringa Sovg'a)"
                : "Tuman O'quvchilari Oylik Reytingi (TOP-3 Qimmatbaho Sovg'alar)"}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-emerald-200/70">
            {mode === 'school'
              ? "Reyting avtomatik yoqilmaydi: kamida 50 ta o'quvchi qo'shilgach Maktab Sardori yoqadi va eng faol 1-o'quvchi taqdirlanadi."
              : "1 oy davomida tumandagi eng faol 3 ta o'quvchiga qimmatbaho sovg'alar beriladi. Kamida 500 ta ishtirokchi yig'ilgach yoqiladi."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={toggling || !payload || (!payload.enabled && !payload.canActivate)}
            onClick={handleToggle}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
              payload?.isLiveActive
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-b-2 border-emerald-800'
                : payload?.canActivate
                ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-2 border-emerald-700'
                : 'bg-slate-100 dark:bg-[#040D0A] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-emerald-500/20'
            }`}
          >
            {payload?.isLiveActive ? (
              <Power className="w-4 h-4" />
            ) : payload?.canActivate ? (
              <Power className="w-4 h-4" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            <span>
              {toggling
                ? 'Saqlanmoqda...'
                : payload?.enabled
                ? 'Reyting Yoqilgan (O‘chirish)'
                : payload?.canActivate
                ? 'Reytingni Jonli Yoqish'
                : `Yoqish (${payload?.currentMembersCount ?? 0} / ${payload?.minMembersThreshold ?? (mode === 'school' ? 50 : 500)})`}
            </span>
          </button>

          <button
            type="button"
            disabled={
              awarding ||
              !payload?.isLiveActive ||
              Boolean(payload?.alreadyAwardedThisMonth) ||
              previewRows.length === 0
            }
            onClick={handleAwardClick}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 text-xs font-black border-b-2 border-amber-700 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Gift className="w-4 h-4" />
            <span>
              {awarding
                ? 'Yuborilmoqda...'
                : payload?.alreadyAwardedThisMonth
                ? 'Bu oy taqdirlangan'
                : mode === 'school'
                ? "1-O'rinni Taqdirlash"
                : 'TOP-3 O‘quvchini Taqdirlash'}
            </span>
          </button>
        </div>
      </div>

      {/* Early Award Inline Confirmation (No window.confirm) */}
      {confirmEarlyAward && payload && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-800 dark:text-slate-200">
            Oy yakuniga hali <b className="font-mono">{payload.daysRemainingInMonth}</b> kun qoldi ({payload.lastDayDateLabel}).{' '}
            Hozirgi yetakchilarni <b>{payload.periodLabel}</b> oyi g‘oliblari sifatida tasdiqlaysizmi?
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmEarlyAward(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-500/25 font-semibold cursor-pointer"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={executeAward}
              className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-black cursor-pointer"
            >
              Ha, Taqdirlash
            </button>
          </div>
        </div>
      )}

      {loading && !payload ? (
        <div className="py-8 text-center text-xs text-slate-500">Ma’lumotlar yuklanmoqda...</div>
      ) : payload ? (
        <>
          {/* Threshold Progress Strip */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-500" />
                {mode === 'school'
                  ? `Maktab o‘quvchilari qamrovi (${payload.schoolName})`
                  : `${payload.district} ishtirokchilari qamrovi`}
              </span>
              <span className="font-mono tabular-nums font-black text-slate-900 dark:text-white">
                {payload.currentMembersCount} / {payload.minMembersThreshold} ({pct}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-emerald-950 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  payload.isLiveActive
                    ? 'bg-emerald-500'
                    : payload.canActivate
                    ? 'bg-sky-500'
                    : 'bg-amber-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <span>
                Holat:{' '}
                <b className={payload.isLiveActive ? 'text-emerald-500' : 'text-amber-500'}>
                  {payload.isLiveActive
                    ? "Jonli ishlamoqda (o'quvchilar kabinetida ko'rinadi)"
                    : payload.canActivate
                    ? "Chegara bajarildi · Yuqoridagi tugma bilan yoqing"
                    : `Hali faol emas · Yana ${Math.max(0, payload.minMembersThreshold - payload.currentMembersCount)} ta a'zo kerak`}
                </b>
              </span>
              <span className="font-mono tabular-nums">
                {payload.periodLabel} · Oy oxirigacha {payload.daysRemainingInMonth} kun
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Prize & Threshold Configuration Form */}
            <form onSubmit={handleSaveSettings} className="lg:col-span-5 space-y-3 text-xs">
              <div className="font-bold text-slate-800 dark:text-slate-200">
                {mode === 'school' ? "Maktab sovg'asi va chegara sozlamalari" : "Tuman TOP-3 sovg'alari va chegara"}
              </div>

              {mode === 'school' ? (
                <>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                      1-o‘ringa beriladigan sovg‘a nomi
                    </label>
                    <input
                      type="text"
                      value={schoolPrizeTitle}
                      onChange={e => setSchoolPrizeTitle(e.target.value)}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Bonus EcoCoin
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={schoolBonusCoins}
                        onChange={e => setSchoolBonusCoins(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-mono outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Ishga tushish chegarasi
                      </label>
                      <input
                        type="number"
                        min={user.role === 'super_admin' ? 1 : 10}
                        value={schoolThreshold}
                        onChange={e => setSchoolThreshold(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-mono outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">1-o‘rin sovg‘asi</label>
                        <input
                          type="text"
                          value={top1Prize}
                          onChange={e => setTop1Prize(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Bonus ECO</label>
                        <input
                          type="number"
                          min={0}
                          value={bonus1}
                          onChange={e => setBonus1(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">2-o‘rin sovg‘asi</label>
                        <input
                          type="text"
                          value={top2Prize}
                          onChange={e => setTop2Prize(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Bonus ECO</label>
                        <input
                          type="number"
                          min={0}
                          value={bonus2}
                          onChange={e => setBonus2(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">3-o‘rin sovg‘asi</label>
                        <input
                          type="text"
                          value={top3Prize}
                          onChange={e => setTop3Prize(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">Bonus ECO</label>
                        <input
                          type="number"
                          min={0}
                          value={bonus3}
                          onChange={e => setBonus3(e.target.value)}
                          className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-mono outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Ishga tushish chegarasi (default 500)
                      </label>
                      <input
                        type="number"
                        min={user.role === 'super_admin' ? 1 : 100}
                        value={distThreshold}
                        onChange={e => setDistThreshold(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-mono outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 active:translate-y-[1px] text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saqlanmoqda...' : 'Sozlamalarni Saqlash'}</span>
              </button>
            </form>

            {/* Live Top 10 Preview */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    {payload.isLiveActive ? 'Jonli TOP-10 O‘quvchilar' : 'Nomzod TOP-10 O‘quvchilar (Oldindan ko‘rish)'}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-[11px] text-slate-500">
                  Jami: {payload.totalParticipants} o‘quvchi
                </span>
              </div>

              {previewRows.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-emerald-500/20 rounded-xl">
                  Hozircha bu hududda ro‘yxatdan o‘tgan o‘quvchilar yo‘q.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-emerald-500/20 rounded-xl divide-y divide-slate-100 dark:divide-emerald-500/15 max-h-[340px] overflow-y-auto bg-white dark:bg-[#040D0A]">
                  {previewRows.map(st => {
                    const isWinnerZone = mode === 'school' ? st.rank === 1 : st.rank <= 3;
                    return (
                      <div
                        key={st.uid}
                        className={`py-2.5 px-3.5 flex items-center justify-between gap-3 text-xs ${
                          isWinnerZone ? 'bg-amber-500/[0.06]' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`w-7 font-mono tabular-nums font-black shrink-0 ${
                              isWinnerZone ? 'text-amber-500' : 'text-slate-400'
                            }`}
                          >
                            #{st.rank}
                          </span>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-white truncate">{st.fullName}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              {mode === 'district' ? `${st.schoolName || 'Maktab'} · ` : ''}
                              {st.grade || "O'quvchi"} · {st.monthlyActivitiesCount} faollik
                            </div>
                          </div>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <div className="font-black text-emerald-500">{st.monthlyScore.toLocaleString()} ball</div>
                          <div className="text-[10px] text-slate-400">{st.totalCoins.toLocaleString()} ECO</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recent Winners History */}
              {payload.recentWinners && payload.recentWinners.length > 0 && (
                <div className="p-3.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/20 space-y-2 text-xs">
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Taqdirlangan g‘oliblar ({payload.recentWinners[0].periodLabel})</span>
                  </div>
                  <div className="space-y-1.5">
                    {payload.recentWinners[0].winners.map(w => (
                      <div key={`${w.uid}_${w.rank}`} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-200">
                          <b className="font-mono text-amber-500 mr-1.5">#{w.rank}</b>
                          {w.fullName}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard?.writeText(w.promoCode).catch(() => {});
                              showNotification(`Promokod nusxalandi: ${w.promoCode}`, 'success');
                            }}
                            className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-mono text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <span>{w.promoCode}</span>
                            <Copy className="w-2.5 h-2.5" />
                          </button>
                          <span className="font-mono text-emerald-500 font-bold">+{w.bonusCoins} ECO</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
