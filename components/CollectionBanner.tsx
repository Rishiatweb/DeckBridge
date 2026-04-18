"use client";

import { useState, useEffect } from "react";

interface CollectionBreakdown {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

interface GlobalStats {
  totalScore: number;
  breakdown: CollectionBreakdown;
  streakBonus: boolean;
  streakDays: number;
  totalCards: number;
}

// ── Rarity text colors ────────────────────────────────────────────────────────
const RARITY_TEXT: Record<keyof CollectionBreakdown, string> = {
  common:    "text-stone-400 dark:text-stone-500",
  uncommon:  "text-amber-500",
  rare:      "text-slate-400 dark:text-slate-300",
  epic:      "text-indigo-500",
  legendary: "text-pink-500",
};

// Banner glow based on highest rarity achieved
const HIGHEST_GLOW: Record<number, string> = {
  0: "",
  1: "shadow-lg shadow-amber-100/60 dark:shadow-amber-900/20",
  2: "shadow-lg shadow-slate-200/60 dark:shadow-slate-800/30",
  3: "shadow-lg shadow-indigo-100/60 dark:shadow-indigo-900/20",
  4: "shadow-lg shadow-pink-100/60 dark:shadow-pink-900/20",
};

// ── Counting number animation ─────────────────────────────────────────────────
function CountingNumber({ target, duration = 1.2 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - start) / (duration * 1000);
      const progress = Math.min(elapsed, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);

  return <>{value.toLocaleString()}</>;
}

// ── SVG Collection Strength Ring ──────────────────────────────────────────────
function StrengthRing({ pct }: { pct: number }) {
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;

  return (
    <div className="relative flex items-center justify-center" title={`${Math.round(pct)}% of cards above Common`}>
      <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
        {/* Track */}
        <circle cx="26" cy="26" r={r} fill="none" stroke="currentColor" strokeWidth="4"
          className="text-stone-200 dark:text-stone-700" />
        {/* Progress */}
        <circle
          cx="26" cy="26" r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className="text-amber-400 transition-all duration-1000 ease-out"
        />
      </svg>
      {/* Percentage label */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold text-stone-700 dark:text-stone-200 rotate-0">
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

export default function CollectionBanner() {
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [ringPct, setRingPct] = useState(0);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((data: GlobalStats) => {
        setStats(data);
        // Delay ring fill so CSS transition fires
        setTimeout(() => {
          const above = data.breakdown.uncommon + data.breakdown.rare +
                        data.breakdown.epic   + data.breakdown.legendary;
          setRingPct(data.totalCards > 0 ? (above / data.totalCards) * 100 : 0);
        }, 300);
      })
      .catch(() => {});
  }, []);

  // ── Loading skeleton ────────────────────────────────────────────────────────
  if (!stats) {
    return (
      <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-5 animate-pulse">
        <div className="h-4 bg-stone-200 dark:bg-stone-700 rounded w-40 mb-3" />
        <div className="h-8 bg-stone-200 dark:bg-stone-700 rounded w-56 mb-4" />
        <div className="h-3 bg-stone-200 dark:bg-stone-700 rounded w-72" />
      </div>
    );
  }

  // ── Compute display values ──────────────────────────────────────────────────
  const { totalScore, breakdown, streakBonus, streakDays, totalCards } = stats;

  const highestLevel =
    breakdown.legendary > 0 ? 4 :
    breakdown.epic      > 0 ? 3 :
    breakdown.rare      > 0 ? 2 :
    breakdown.uncommon  > 0 ? 1 : 0;

  const rarityOrder: Array<keyof CollectionBreakdown> = ["legendary", "epic", "rare", "uncommon", "common"];
  const nonZero = rarityOrder.filter((k) => breakdown[k] > 0);

  return (
    <div className={`bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-5 ${HIGHEST_GLOW[highestLevel]}`}>
      <div className="flex items-start justify-between gap-4">

        {/* Left: score + breakdown + streak */}
        <div className="flex-1 min-w-0">
          {/* Score header */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-sm font-semibold text-stone-500 dark:text-stone-400">⚡ Knowledge Power</span>
            {/* Tooltip */}
            <div className="relative group inline-flex cursor-help">
              <span className="text-stone-300 dark:text-stone-600 text-xs border border-stone-200 dark:border-stone-700 rounded-full w-4 h-4 inline-flex items-center justify-center leading-none">?</span>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-stone-800 dark:bg-stone-700 text-white text-xs rounded-xl px-3 py-2.5 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-20 leading-relaxed">
                Your Knowledge Power grows as you master flashcards through spaced repetition. Cards level up as you remember them over longer intervals — just like leveling up a collection.
              </div>
            </div>
          </div>

          {/* Big score */}
          <div className="text-3xl font-bold text-stone-800 dark:text-stone-100 mb-3">
            {totalCards > 0 ? <CountingNumber target={totalScore} /> : "0"}
          </div>

          {/* Rarity breakdown chips */}
          {nonZero.length > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {nonZero.map((key) => (
                <span key={key} className={`font-medium ${RARITY_TEXT[key]}`}>
                  {breakdown[key]} {key.charAt(0).toUpperCase() + key.slice(1)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-stone-400 dark:text-stone-500">
              Practice your first deck to start leveling up cards
            </p>
          )}

          {/* Streak indicator */}
          <div className="mt-3">
            {streakDays > 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                🔥 {streakDays}-day streak
                {streakBonus && <span className="ml-1 text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">1.5× bonus active</span>}
              </p>
            ) : (
              <p className="text-sm text-stone-400 dark:text-stone-500">
                Start a streak — review today!
              </p>
            )}
          </div>
        </div>

        {/* Right: strength ring */}
        {totalCards > 0 && (
          <div className="shrink-0 flex flex-col items-center gap-1">
            <StrengthRing pct={ringPct} />
            <p className="text-xs text-stone-400 dark:text-stone-500 text-center leading-tight">
              collection<br />strength
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
