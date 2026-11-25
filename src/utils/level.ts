export interface LevelProgressInfo {
  level: number;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  xpIntoLevel: number;
  xpRequiredForNextLevel: number;
  xpRemainingForNextLevel: number;
  progressPct: number;
}

/**
 * Progressive XP threshold for advancing from `level` to `level + 1`.
 * Level 1 -> 2: 1,000 XP
 * Level 2 -> 3: 1,800 XP
 * Level 3 -> 4: 3,000 XP
 * Level 4 -> 5: 4,600 XP
 * Level 5 -> 6: 6,600 XP
 * Level 6 -> 7: 9,000 XP
 */
export function getXpRequiredForStep(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const offset = safeLevel - 1;
  return 1000 + offset * 600 + offset * offset * 200;
}

export function getTotalXpForLevelStart(level: number): number {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  let total = 0;
  for (let lv = 1; lv < safeLevel; lv += 1) {
    total += getXpRequiredForStep(lv);
  }
  return total;
}

export function calculateLevelFromXp(totalXpInput: number): number {
  return calculateLevelProgress(totalXpInput).level;
}

export function calculateLevelProgress(totalXpInput: number): LevelProgressInfo {
  const totalXp = Math.max(0, Math.floor(Number(totalXpInput) || 0));
  let level = 1;
  let accumulated = 0;

  while (level < 200) {
    const stepXp = getXpRequiredForStep(level);
    if (totalXp < accumulated + stepXp) {
      const xpIntoLevel = totalXp - accumulated;
      const xpRemainingForNextLevel = Math.max(1, stepXp - xpIntoLevel);
      const progressPct =
        xpIntoLevel <= 0
          ? 3
          : Math.min(100, Math.max(4, Math.round((xpIntoLevel / stepXp) * 100)));

      return {
        level,
        totalXp,
        levelStartXp: accumulated,
        nextLevelXp: accumulated + stepXp,
        xpIntoLevel,
        xpRequiredForNextLevel: stepXp,
        xpRemainingForNextLevel,
        progressPct,
      };
    }
    accumulated += stepXp;
    level += 1;
  }

  const finalStep = getXpRequiredForStep(level);
  return {
    level,
    totalXp,
    levelStartXp: accumulated,
    nextLevelXp: accumulated + finalStep,
    xpIntoLevel: Math.max(0, totalXp - accumulated),
    xpRequiredForNextLevel: finalStep,
    xpRemainingForNextLevel: Math.max(1, finalStep - Math.max(0, totalXp - accumulated)),
    progressPct: 100,
  };
}
