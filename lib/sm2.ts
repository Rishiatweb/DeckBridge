// SM-2 Spaced Repetition Algorithm
// Based on: Piotr Wozniak, 1987
// Modified: Hard (quality=2) no longer resets — it penalises (halves interval, ease penalty).
//           Only Again (quality=1) fully resets. Easy gets a 1.3x bonus multiplier.
// Quality mapping: 1=Again, 2=Hard, 4=Good, 5=Easy

export interface SM2Card {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewDate: Date;
}

const MIN_EASE_FACTOR = 1.3;
const EASY_BONUS = 1.3;
const HARD_INTERVAL_MULTIPLIER = 0.5;
const HARD_EASE_PENALTY = 0.15;

/**
 * Calculate next review date using SM-2 algorithm.
 *
 * Quality scale:
 *   1 (Again) — forgot completely. Full reset: interval=1, repetitions=0.
 *   2 (Hard)  — recalled with significant difficulty. No reset, but interval halved,
 *               ease factor penalised. Card stays in learning.
 *   4 (Good)  — recalled with effort. Standard SM-2 advance.
 *   5 (Easy)  — recalled instantly. SM-2 advance with 1.3× ease bonus.
 */
export function calculateNextReview(card: SM2Card, quality: number): SM2Result {
  let { easeFactor, interval, repetitions } = card;

  if (quality === 1) {
    // Again — full reset
    repetitions = 0;
    interval = 1;
  } else if (quality === 2) {
    // Hard — penalise but don't reset progress
    interval = Math.max(1, Math.ceil(interval * HARD_INTERVAL_MULTIPLIER));
    easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - HARD_EASE_PENALTY);
    // repetitions unchanged — card keeps its history
  } else {
    // Good (4) or Easy (5) — standard SM-2 advance
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      const bonus = quality === 5 ? EASY_BONUS : 1;
      interval = Math.round(interval * easeFactor * bonus);
    }
    repetitions += 1;

    // Update ease factor (standard SM-2 formula)
    easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (easeFactor < MIN_EASE_FACTOR) {
      easeFactor = MIN_EASE_FACTOR;
    }
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return { easeFactor, interval, repetitions, nextReviewDate };
}

/**
 * Check if a card is due for review.
 */
export function isDue(nextReviewDate: Date): boolean {
  return new Date(nextReviewDate) <= new Date();
}

/**
 * Map UI rating to SM-2 quality score.
 */
export function ratingToQuality(rating: "again" | "hard" | "good" | "easy"): number {
  const map = { again: 1, hard: 2, good: 4, easy: 5 };
  return map[rating];
}

/**
 * Human-readable label for an interval in days.
 * Used to show next-review previews on rating buttons.
 */
export function getNextReviewLabel(intervalDays: number): string {
  if (intervalDays <= 0) return "< 1 day";
  if (intervalDays === 1) return "tomorrow";
  if (intervalDays < 7) return `${intervalDays} days`;
  if (intervalDays < 14) return "1 week";
  if (intervalDays < 21) return "2 weeks";
  if (intervalDays < 30) return "3 weeks";
  if (intervalDays < 60) return "1 month";
  if (intervalDays < 90) return "2 months";
  if (intervalDays < 180) return "3 months";
  if (intervalDays < 365) return `${Math.round(intervalDays / 30)} months`;
  return "1+ year";
}
