"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

interface RarityBreakdown {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

interface CollectionStats {
  totalScore: number;
  breakdown: RarityBreakdown;
  streakBonus: boolean;
  streakDays: number;
  totalCards: number;
}

interface Deck {
  id: string;
  title: string;
  colorTheme: string;
  cardCount: number;
  mastered: number;
  learning: number;
  due: number;
  rarityBreakdown: RarityBreakdown;
}

const THEME_STRIPE: Record<string, string> = {
  blue: "bg-blue-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  slate: "bg-slate-400",
};

const THEME_BG: Record<string, string> = {
  blue: "bg-blue-50 dark:bg-blue-950/30",
  emerald: "bg-emerald-50 dark:bg-emerald-950/30",
  amber: "bg-amber-50 dark:bg-amber-950/30",
  rose: "bg-rose-50 dark:bg-rose-950/30",
  violet: "bg-violet-50 dark:bg-violet-950/30",
  slate: "bg-stone-50 dark:bg-stone-800/50",
};

const RARITY_CONFIG = [
  { key: "legendary" as const, label: "Legendary", color: "text-pink-500",   dot: "bg-pink-500",   glow: "shadow-pink-200 dark:shadow-pink-900" },
  { key: "epic"      as const, label: "Epic",      color: "text-indigo-500", dot: "bg-indigo-500", glow: "shadow-indigo-200 dark:shadow-indigo-900" },
  { key: "rare"      as const, label: "Rare",      color: "text-slate-400 dark:text-slate-300",  dot: "bg-slate-400",  glow: "" },
  { key: "uncommon"  as const, label: "Uncommon",  color: "text-amber-500",  dot: "bg-amber-400",  glow: "" },
  { key: "common"    as const, label: "Common",    color: "text-stone-400",  dot: "bg-stone-300 dark:bg-stone-600",  glow: "" },
];

// Circular SVG progress ring
function RingProgress({ pct, size = 80, stroke = 7, color = "#f59e0b" }: { pct: number; size?: number; stroke?: number; color?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-stone-200 dark:text-stone-700" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
    </svg>
  );
}

export default function MasteryPage() {
  const [stats, setStats] = useState<CollectionStats | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/stats").then((r) => r.json()),
      fetch("/api/decks").then((r) => r.json()),
    ]).then(([s, d]) => {
      setStats(s);
      setDecks(Array.isArray(d) ? d : []);
    }).finally(() => setLoading(false));
  }, []);

  const handleCopy = () => {
    const lines = [
      "🔥 DeckForge — My Collection",
      stats ? `⚡ ${stats.totalScore.toLocaleString()} Knowledge Power` : "",
      stats ? `📚 ${stats.totalCards} cards across ${decks.length} decks` : "",
      stats?.streakDays ? `🔥 ${stats.streakDays}-day streak` : "",
      stats ? `✨ ${stats.breakdown.legendary} Legendary · ${stats.breakdown.epic} Epic · ${stats.breakdown.rare} Rare` : "",
      "",
      "Built with DeckForge — AI flashcard engine",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const aboveCommon = stats
    ? stats.breakdown.uncommon + stats.breakdown.rare + stats.breakdown.epic + stats.breakdown.legendary
    : 0;
  const aboveCommonPct = stats && stats.totalCards > 0
    ? Math.round((aboveCommon / stats.totalCards) * 100)
    : 0;

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 dark:bg-stone-900 flex items-center justify-center">
        <p className="text-stone-400 dark:text-stone-500">Loading collection...</p>
      </main>
    );
  }

  if (!stats || stats.totalCards === 0) {
    return (
      <main className="min-h-screen bg-stone-50 dark:bg-stone-900 flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <div className="text-5xl">🃏</div>
          <p className="text-xl font-bold text-stone-800 dark:text-stone-100">No cards yet</p>
          <p className="text-stone-500 dark:text-stone-400">Upload a PDF to start building your collection.</p>
          <Link href="/" className="inline-block bg-amber-400 hover:bg-amber-500 text-white font-semibold py-2.5 px-6 rounded-xl transition-colors mt-2">
            Go to Home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-900">
      {/* Header */}
      <header className="bg-white dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/" className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors shrink-0">
            ← Back
          </Link>
          <span className="text-stone-300 dark:text-stone-600 shrink-0">|</span>
          <span className="text-2xl shrink-0">🔥</span>
          <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">My Mastery</h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="text-xs font-semibold bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-600 dark:text-stone-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              {copied ? "✓ Copied!" : "Copy Stats"}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Hero — Knowledge Power */}
        <div className="bg-white dark:bg-stone-800 rounded-3xl border border-stone-200 dark:border-stone-700 p-8 text-center relative overflow-hidden">
          {/* Background glow */}
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-white to-stone-50 dark:from-amber-950/20 dark:via-stone-800 dark:to-stone-800 pointer-events-none" />
          <div className="relative z-10">
            <p className="text-xs uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-1">Knowledge Power</p>
            <div className="text-6xl font-black text-stone-800 dark:text-stone-100 leading-none mb-1">
              {stats.totalScore.toLocaleString()}
            </div>
            <p className="text-amber-500 font-semibold text-sm mb-6">⚡ {stats.streakBonus ? "1.5× streak bonus active" : "Keep reviewing to grow"}</p>

            <div className="flex items-center justify-center gap-8">
              {/* Ring */}
              <div className="relative inline-flex items-center justify-center">
                <RingProgress pct={aboveCommonPct} size={96} stroke={8} color="#f59e0b" />
                <div className="absolute text-center">
                  <p className="text-lg font-bold text-stone-800 dark:text-stone-100 leading-none">{aboveCommonPct}%</p>
                  <p className="text-[10px] text-stone-400 dark:text-stone-500">evolved</p>
                </div>
              </div>

              <div className="text-left space-y-1">
                <p className="text-sm text-stone-500 dark:text-stone-400">{stats.totalCards} total cards</p>
                <p className="text-sm text-stone-500 dark:text-stone-400">{decks.length} deck{decks.length !== 1 ? "s" : ""}</p>
                {stats.streakDays > 0 && (
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">🔥 {stats.streakDays}-day streak</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Rarity Breakdown */}
        <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-6">
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-4">Collection Rarity</p>
          <div className="space-y-3">
            {RARITY_CONFIG.map(({ key, label, color, dot, glow }) => {
              const count = stats.breakdown[key];
              const pct = stats.totalCards > 0 ? (count / stats.totalCards) * 100 : 0;
              const isHigh = key === "legendary" || key === "epic";
              return (
                <div key={key} className="flex items-center gap-3">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot} ${isHigh && count > 0 ? `shadow-sm ${glow}` : ""}`} />
                  <span className={`text-sm font-medium w-20 shrink-0 ${color}`}>{label}</span>
                  <div className="flex-1 h-2 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${dot}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-8 text-right ${count > 0 ? color : "text-stone-300 dark:text-stone-600"}`}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Decks */}
        {decks.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-3">Decks</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {decks.map((deck) => {
                const stripe = THEME_STRIPE[deck.colorTheme] ?? THEME_STRIPE.slate;
                const bg = THEME_BG[deck.colorTheme] ?? THEME_BG.slate;
                const masteredPct = deck.cardCount > 0 ? (deck.mastered / deck.cardCount) * 100 : 0;
                const learningPct = deck.cardCount > 0 ? (deck.learning / deck.cardCount) * 100 : 0;
                const topRarity = (["legendary", "epic", "rare", "uncommon"] as const).find(
                  (r) => deck.rarityBreakdown[r] > 0
                );
                const topRarityConfig = topRarity ? RARITY_CONFIG.find((r) => r.key === topRarity) : null;

                return (
                  <div key={deck.id} className={`rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden ${bg}`}>
                    <div className={`h-1 w-full ${stripe}`} />
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="font-semibold text-stone-800 dark:text-stone-100 text-sm leading-tight line-clamp-2">{deck.title}</p>
                        <span className="text-lg font-bold text-stone-600 dark:text-stone-300 shrink-0">{deck.cardCount}</span>
                      </div>

                      {/* Mastery bar */}
                      <div className="flex h-1.5 rounded-full overflow-hidden bg-stone-200 dark:bg-stone-700 mb-2">
                        <div className="bg-emerald-400" style={{ width: `${masteredPct}%` }} />
                        <div className="bg-amber-400" style={{ width: `${learningPct}%` }} />
                      </div>

                      <div className="flex items-center justify-between">
                        <p className="text-xs text-stone-400 dark:text-stone-500">
                          {deck.mastered > 0 && <span className="text-emerald-500">{deck.mastered} mastered</span>}
                          {deck.mastered > 0 && deck.learning > 0 && " · "}
                          {deck.learning > 0 && <span className="text-amber-500">{deck.learning} learning</span>}
                          {deck.mastered === 0 && deck.learning === 0 && "Not started"}
                        </p>
                        {topRarityConfig && (
                          <span className={`text-xs font-medium ${topRarityConfig.color}`}>
                            {deck.rarityBreakdown[topRarityConfig.key]} {topRarityConfig.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Screenshot tip */}
        <p className="text-center text-xs text-stone-400 dark:text-stone-500 pb-4">
          Screenshot this page to share your collection progress
        </p>
      </div>
    </main>
  );
}
