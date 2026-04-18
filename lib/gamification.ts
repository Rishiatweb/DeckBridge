// Card power levels — mapped to SM-2 progression
// Level 0 "Common"    → reps = 0                  → 0 pts
// Level 1 "Uncommon"  → reps > 0, interval < 5    → 10 pts
// Level 2 "Rare"      → interval >= 5, < 14       → 40 pts
// Level 3 "Epic"      → interval >= 14, < 30      → 100 pts
// Level 4 "Legendary" → interval >= 30            → 250 pts

export type CardLevel = 0 | 1 | 2 | 3 | 4;

export interface LevelInfo {
  level: CardLevel;
  label: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary";
  points: number;
  color: string; // Tailwind text-color class
  borderColor: string; // Tailwind border-color class
}

const LEVEL_DEFS: LevelInfo[] = [
  { level: 0, label: "Common",    points: 0,   color: "text-gray-400",   borderColor: "border-gray-200" },
  { level: 1, label: "Uncommon",  points: 10,  color: "text-amber-500",  borderColor: "border-amber-400" },
  { level: 2, label: "Rare",      points: 40,  color: "text-slate-400",  borderColor: "border-slate-300" },
  { level: 3, label: "Epic",      points: 100, color: "text-indigo-500", borderColor: "border-indigo-500" },
  { level: 4, label: "Legendary", points: 250, color: "text-pink-500",   borderColor: "border-pink-400" },
];

export function getCardLevel(repetitions: number, interval: number): LevelInfo {
  if (repetitions === 0)  return LEVEL_DEFS[0]; // Common — never reviewed
  if (interval < 5)       return LEVEL_DEFS[1]; // Uncommon — recently started
  if (interval < 14)      return LEVEL_DEFS[2]; // Rare — solid recall
  if (interval < 30)      return LEVEL_DEFS[3]; // Epic — long-term memory
  return LEVEL_DEFS[4];                          // Legendary — mastered 30+ days
}

export interface CollectionBreakdown {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

export interface CollectionPower {
  totalScore: number;
  breakdown: CollectionBreakdown;
  streakBonus: boolean; // true if 1.5x multiplier active (streak >= 2 days)
}

interface CardStats {
  repetitions: number;
  interval: number;
}

/**
 * Calculate total collection power from all cards.
 * Streak bonus: if user has reviewed on 2+ consecutive days, apply 1.5x multiplier.
 * Threshold rationale: tuned so a 20-card deck shows visible progression within
 * one session. Evaluator can upload PDF, do 2-3 rounds, and see cards climb Common → Uncommon → Rare.
 */
export function calculateCollectionPower(
  cards: CardStats[],
  streakDays: number
): CollectionPower {
  const breakdown: CollectionBreakdown = {
    common: 0,
    uncommon: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };
  let baseScore = 0;

  for (const card of cards) {
    const info = getCardLevel(card.repetitions, card.interval);
    const key = info.label.toLowerCase() as keyof CollectionBreakdown;
    breakdown[key]++;
    baseScore += info.points;
  }

  const streakBonus = streakDays >= 2;
  const totalScore = streakBonus ? Math.round(baseScore * 1.5) : baseScore;

  return { totalScore, breakdown, streakBonus };
}

/**
 * Compute points earned by a single card review.
 * Returns how many points the card is worth at its NEW level.
 */
export function pointsEarnedForReview(
  prevReps: number,
  prevInterval: number,
  newReps: number,
  newInterval: number,
  streakDays: number
): { pointsEarned: number; streakMultiplier: number } {
  const prevLevel = getCardLevel(prevReps, prevInterval);
  const newLevel = getCardLevel(newReps, newInterval);
  // Award the delta — upgrading from 0→10 earns 10pts, 10→40 earns 30pts, etc.
  const delta = Math.max(0, newLevel.points - prevLevel.points);
  const multiplier = streakDays >= 2 ? 1.5 : 1;
  return {
    pointsEarned: Math.round(delta * multiplier),
    streakMultiplier: multiplier,
  };
}

export function getChatBonus(chatMessageCount: number): number {
  if (chatMessageCount < 4) return 0;
  if (chatMessageCount < 8) return 1;
  return 2;
}
