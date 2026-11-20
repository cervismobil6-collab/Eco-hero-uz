export const DAILY_STREAK_REWARDS = [50, 100, 300, 450, 600, 800, 1000] as const;

export interface UserStreakState {
  claimedToday: boolean;
  currentStreakDays: number;
  claimDayNumber: number;
  todayReward: number;
  nextTomorrowReward: number;
  wasResetDueToInactivity: boolean;
  todayKey: string;
}

/**
 * Uzbekistan calendar date key (UTC+5 permanently, no DST) in YYYY-MM-DD format.
 */
export function getUzbekistanDateKey(now: Date = new Date()): string {
  const uzTime = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  return uzTime.toISOString().slice(0, 10);
}

/**
 * Exact integer calendar day difference between two YYYY-MM-DD keys.
 */
export function getDaysDiffBetweenDateKeys(prevKey?: string | null, nextKey?: string | null): number {
  if (!prevKey || !nextKey) return -1;
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(prevKey).trim());
  const n = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(nextKey).trim());
  if (!p || !n) return -1;
  const t1 = Date.UTC(Number(p[1]), Number(p[2]) - 1, Number(p[3]));
  const t2 = Date.UTC(Number(n[1]), Number(n[2]) - 1, Number(n[3]));
  return Math.round((t2 - t1) / 86400000);
}

export function getStreakRewardForDay(dayNumber: number): number {
  const safeDay = Math.max(1, Math.floor(dayNumber || 1));
  if (safeDay <= DAILY_STREAK_REWARDS.length) {
    return DAILY_STREAK_REWARDS[safeDay - 1];
  }
  return DAILY_STREAK_REWARDS[DAILY_STREAK_REWARDS.length - 1];
}

export function computeUserStreakState(
  input: { lastStreakClaimDate?: string | null; storedStreakDays?: number | null },
  todayKey: string = getUzbekistanDateKey()
): UserStreakState {
  const prevDate = input.lastStreakClaimDate ? String(input.lastStreakClaimDate).trim() : '';
  const storedStreak = Math.max(0, Number(input.storedStreakDays || 0));

  if (prevDate && prevDate === todayKey) {
    const activeDay = Math.max(1, storedStreak || 1);
    return {
      claimedToday: true,
      currentStreakDays: activeDay,
      claimDayNumber: activeDay,
      todayReward: getStreakRewardForDay(activeDay),
      nextTomorrowReward: getStreakRewardForDay(activeDay + 1),
      wasResetDueToInactivity: false,
      todayKey,
    };
  }

  const diff = prevDate ? getDaysDiffBetweenDateKeys(prevDate, todayKey) : -1;
  if (diff === 1 && storedStreak >= 1) {
    const nextDay = storedStreak + 1;
    return {
      claimedToday: false,
      currentStreakDays: storedStreak,
      claimDayNumber: nextDay,
      todayReward: getStreakRewardForDay(nextDay),
      nextTomorrowReward: getStreakRewardForDay(nextDay + 1),
      wasResetDueToInactivity: false,
      todayKey,
    };
  }

  // First-time claim OR user skipped 1+ day(s) -> streak resets strictly to Day 1 (50 EcoCoin)
  return {
    claimedToday: false,
    currentStreakDays: 0,
    claimDayNumber: 1,
    todayReward: getStreakRewardForDay(1),
    nextTomorrowReward: getStreakRewardForDay(2),
    wasResetDueToInactivity: Boolean(prevDate && diff > 1),
    todayKey,
  };
}
