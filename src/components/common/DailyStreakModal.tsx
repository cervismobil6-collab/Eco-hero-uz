import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCircle2, Flame, Gift, Lock, Sparkles, X } from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { computeUserStreakState, DAILY_STREAK_REWARDS } from '../../utils/streak';
import dailyQuestChestImg from '../../assets/images/daily_quest_chest_1795179383259.jpg';

interface DailyStreakModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DailyStreakModal: React.FC<DailyStreakModalProps> = ({ isOpen, onClose }) => {
  const { user, serverDateKey, claimDailyStreakReward, triggerHaptic } = useEco();
  const [isClaiming, setIsClaiming] = useState(false);

  const streakState = computeUserStreakState(
    {
      lastStreakClaimDate: user.lastStreakClaimDate,
      storedStreakDays: user.streakDays ?? user.activityStats?.streakDays ?? 0,
    },
    serverDateKey
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const effectiveCycleDay =
    streakState.currentStreakDays > 7 && streakState.claimedToday
      ? 7
      : Math.min(7, streakState.currentStreakDays);

  const todayTargetDay = !streakState.claimedToday
    ? Math.min(7, streakState.claimDayNumber)
    : -1;

  const handleClaim = async () => {
    if (streakState.claimedToday || isClaiming) return;
    triggerHaptic('medium');
    setIsClaiming(true);
    try {
      const result = await claimDailyStreakReward();
      if (result.success || result.alreadyClaimed) {
        onClose();
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const firstSixDays = DAILY_STREAK_REWARDS.slice(0, 6);
  const daySevenReward = DAILY_STREAK_REWARDS[6];
  const isDaySevenToday = !streakState.claimedToday && todayTargetDay === 7;
  const isDaySevenDone = streakState.claimedToday
    ? 7 <= effectiveCycleDay
    : !isDaySevenToday && 7 < streakState.claimDayNumber && streakState.currentStreakDays > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#020A07]/82 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="daily-streak-modal-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-[#061812]/95 border border-emerald-400/35 shadow-[0_24px_80px_rgba(16,185,129,0.24)] text-white p-5 sm:p-6 space-y-4"
          >
            {/* Ambient radial glow */}
            <div className="pointer-events-none absolute -top-20 right-0 w-48 h-48 rounded-full bg-teal-400/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-16 left-0 w-44 h-44 rounded-full bg-emerald-500/12 blur-3xl" />

            {/* Mobile bottom-sheet drag indicator */}
            <div className="sm:hidden w-10 h-1 rounded-full bg-emerald-400/30 mx-auto -mt-1 mb-1" />

            {/* Modal Header */}
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/25 via-teal-400/20 to-amber-400/20 border border-emerald-400/40 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-950/50">
                  <Flame className="w-6 h-6 text-amber-400 fill-amber-400/80" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="daily-streak-modal-title"
                    className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-white leading-tight"
                  >
                    Kunlik Kirish Sovg&apos;asi
                  </h2>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-300/85 mt-0.5 tabular-nums">
                    <span>
                      {streakState.currentStreakDays > 0
                        ? `${streakState.currentStreakDays} kunlik streak`
                        : '1-kunlik boshlanish'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="text-teal-300/80">7 kunlik kalendar</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Yopish"
                className="min-w-[44px] min-h-[44px] -mr-2 -mt-1 flex items-center justify-center rounded-2xl text-slate-300 hover:text-white hover:bg-emerald-500/15 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dynamic Daily Status Message */}
            <div className="relative z-10 rounded-2xl px-3.5 py-2.5 bg-[#04100B]/85 border border-emerald-500/20 text-xs text-slate-200 leading-relaxed">
              {streakState.claimedToday ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-emerald-300 font-semibold">
                    Bugungi +{streakState.todayReward} EcoCoin olindi
                  </span>
                  <span className="font-mono tabular-nums text-teal-300 font-bold shrink-0">
                    Ertaga +{streakState.nextTomorrowReward} EC
                  </span>
                </div>
              ) : streakState.wasResetDueToInactivity ? (
                <span>
                  Kecha kirmaganingiz uchun streak 1-kundan qayta boshlandi: bugun{' '}
                  <strong className="text-emerald-300 font-mono tabular-nums">+{streakState.todayReward} EcoCoin</strong>{' '}
                  oling.
                </span>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span>
                    Bugungi mukofot:{' '}
                    <strong className="text-emerald-300 font-mono tabular-nums">+{streakState.todayReward} EcoCoin</strong>
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
                    Ertaga +{streakState.nextTomorrowReward} EC
                  </span>
                </div>
              )}
            </div>

            {/* 7-Day Reward Calendar (Days 1-6 + Special Day 7) */}
            <div className="relative z-10 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                {firstSixDays.map((coins, idx) => {
                  const dayNum = idx + 1;
                  const isDone = streakState.claimedToday
                    ? dayNum <= effectiveCycleDay
                    : dayNum < streakState.claimDayNumber && streakState.currentStreakDays > 0;
                  const isToday = !streakState.claimedToday && dayNum === todayTargetDay;

                  return (
                    <div
                      key={dayNum}
                      className={`relative rounded-2xl p-2.5 border transition-all text-center flex flex-col items-center justify-between min-h-[82px] ${
                        isToday
                          ? 'bg-gradient-to-b from-emerald-500/25 via-teal-500/15 to-[#061A13] border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.28)]'
                          : isDone
                          ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-200'
                          : 'bg-[#04100B]/75 border-emerald-500/15 text-slate-400 opacity-75'
                      }`}
                    >
                      <div className="w-full flex items-center justify-between text-[10px] font-bold">
                        <span className={isToday ? 'text-emerald-300' : isDone ? 'text-emerald-300/90' : 'text-slate-400'}>
                          {dayNum}-kun
                        </span>
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : isToday ? (
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                        )}
                      </div>

                      <div
                        className={`font-mono tabular-nums text-sm font-black mt-1 ${
                          isToday
                            ? 'text-white'
                            : isDone
                            ? 'text-emerald-300'
                            : 'text-slate-300'
                        }`}
                      >
                        +{coins}
                      </div>

                      <div className="text-[10px] font-semibold mt-0.5">
                        {isDone ? (
                          <span className="text-emerald-400">Olindi</span>
                        ) : isToday ? (
                          <span className="text-teal-300 font-bold">Bugun tayyor</span>
                        ) : (
                          <span className="text-slate-500">Yopiq</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Special Day 7 Grand Reward Card */}
              <div
                className={`relative overflow-hidden rounded-2xl p-3 border flex items-center justify-between gap-3 transition-all ${
                  isDaySevenToday
                    ? 'bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-amber-500/25 border-amber-400/70 shadow-[0_0_24px_rgba(251,191,36,0.22)]'
                    : isDaySevenDone
                    ? 'bg-gradient-to-r from-emerald-500/15 to-teal-500/10 border-emerald-400/50'
                    : 'bg-gradient-to-r from-[#071D15] via-[#061812] to-[#121A10] border-amber-400/25 opacity-85'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-amber-400/45 bg-[#040D0A] shrink-0 shadow-md">
                    <img
                      src={dailyQuestChestImg}
                      alt="7-kun maxsus sovg'a"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-300">
                      <span>7-kun · Maxsus Super Sovg&apos;a</span>
                    </div>
                    <p className="text-[11px] text-slate-300 truncate mt-0.5">
                      {isDaySevenDone
                        ? 'Haftalik super mukofot qo‘lga kiritildi'
                        : isDaySevenToday
                        ? 'Bugun ochish mumkin!'
                        : '7 kun ketma-ket kiring va yuting'}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0 flex flex-col items-end gap-0.5">
                  <div className="font-mono tabular-nums text-base font-black text-amber-300">
                    +{daySevenReward.toLocaleString()} EC
                  </div>
                  <div className="text-[10px] font-bold flex items-center gap-1">
                    {isDaySevenDone ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Olindi</span>
                      </>
                    ) : isDaySevenToday ? (
                      <>
                        <Gift className="w-3 h-3 text-amber-300" />
                        <span className="text-amber-300">Tayyor</span>
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-400">Qulf</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action CTA */}
            <div className="relative z-10 pt-1">
              {streakState.claimedToday ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 font-bold text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Bugungi mukofot olindi · Yopish</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isClaiming}
                  onClick={handleClaim}
                  className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-300 hover:brightness-105 active:scale-[0.99] text-[#03120C] font-black text-sm shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Gift className="w-4.5 h-4.5 shrink-0" />
                  <span className="tabular-nums">
                    {isClaiming
                      ? 'Yuklanmoqda...'
                      : `Mukofotni olish (+${streakState.todayReward} EcoCoin)`}
                  </span>
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
