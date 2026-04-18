"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

type ColorTheme = "blue" | "emerald" | "amber" | "rose" | "violet" | "slate";
const THEME_STRIPE: Record<ColorTheme, string> = {
  blue:    "bg-blue-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  rose:    "bg-rose-500",
  violet:  "bg-violet-500",
  slate:   "bg-slate-400",
};

interface Card {
  id: string;
  front: string;
  back: string;
  type: string;
  repetitions: number;
  interval: number;
  nextReviewDate: string;
}

interface Deck {
  id: string;
  title: string;
  description: string;
  colorTheme: ColorTheme;
  sourceFileName: string;
  createdAt: string;
  cards: Card[];
}

interface Stats {
  total: number;
  new: number;
  learning: number;
  mastered: number;
  due: number;
  streakDays: number;
  dueIn24h: number;
}

const TYPE_COLORS: Record<string, string> = {
  concept: "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
  definition: "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300",
  relationship: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300",
  application: "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300",
  edge_case: "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
};

function MasteryBar({ stats }: { stats: Stats }) {
  const { total, mastered, learning, new: newCards } = stats;
  if (total === 0) return null;

  const masteredPct = (mastered / total) * 100;
  const learningPct = (learning / total) * 100;
  const newPct = (newCards / total) * 100;
  const percentMastered = Math.round(masteredPct);

  return (
    <div className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-sm font-medium text-stone-500 dark:text-stone-400">Mastery Progress</p>
          <p className="text-2xl font-bold text-stone-800 dark:text-stone-100 mt-0.5">
            {percentMastered}%
            <span className="text-sm font-normal text-stone-400 dark:text-stone-500 ml-2">mastered</span>
          </p>
        </div>
        <div className="flex items-center gap-2 text-right">
          {stats.streakDays > 0 && (
            <div className="flex flex-col items-center bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-xl px-4 py-2">
              <span className="text-xl">🔥</span>
              <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{stats.streakDays}</span>
              <span className="text-xs text-amber-500 dark:text-amber-400">day streak</span>
            </div>
          )}
          {stats.due > 0 && (
            <div className="flex flex-col items-center bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl px-4 py-2">
              <span className="text-xl">⏰</span>
              <span className="text-sm font-bold text-red-700 dark:text-red-300">{stats.due}</span>
              <span className="text-xs text-red-400 dark:text-red-500">due now</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex h-3 rounded-full overflow-hidden bg-stone-100 dark:bg-stone-700 mb-4">
        <div className="bg-emerald-400 transition-all duration-700 ease-out" style={{ width: `${masteredPct}%` }} title={`${mastered} mastered`} />
        <div className="bg-amber-400 transition-all duration-700 ease-out" style={{ width: `${learningPct}%` }} title={`${learning} learning`} />
        <div className="bg-sky-300 transition-all duration-700 ease-out" style={{ width: `${newPct}%` }} title={`${newCards} new`} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Mastered", value: mastered, color: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-400", desc: "interval ≥ 21 days" },
          { label: "Learning", value: learning, color: "text-amber-600 dark:text-amber-400", dot: "bg-amber-400", desc: "in progress" },
          { label: "New", value: newCards, color: "text-sky-600 dark:text-sky-400", dot: "bg-sky-300", desc: "not started" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="flex items-center justify-center gap-1 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${s.dot} inline-block`} />
              <span className="text-xs font-medium text-stone-600 dark:text-stone-300">{s.label}</span>
            </div>
            <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">{s.desc}</div>
          </div>
        ))}
      </div>

      {stats.due === 0 && (
        <div className="mt-4 pt-4 border-t border-stone-100 dark:border-stone-700 text-center">
          {stats.dueIn24h > 0 ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              <span className="font-medium text-stone-700 dark:text-stone-200">{stats.dueIn24h} cards</span> due in the next 24 hours
            </p>
          ) : (
            <p className="text-sm text-stone-400 dark:text-stone-500">All caught up — nothing due today ✓</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function DeckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [deck, setDeck] = useState<Deck | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deckRes, statsRes] = await Promise.all([
          fetch(`/api/decks/${id}`),
          fetch(`/api/decks/${id}/stats`),
        ]);
        const deckData = await deckRes.json();
        const statsData = await statsRes.json();
        if (deckRes.ok) setDeck(deckData);
        if (statsRes.ok) setStats(statsData);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleDelete = async () => {
    if (!deck) return;
    if (!confirm(`Delete "${deck.title}"?`)) return;
    await fetch(`/api/decks/${id}`, { method: "DELETE" });
    router.push("/");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 dark:bg-stone-900 flex items-center justify-center">
        <div className="text-stone-400 dark:text-stone-500">Loading deck...</div>
      </main>
    );
  }

  if (!deck) {
    return (
      <main className="min-h-screen bg-stone-50 dark:bg-stone-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-stone-500 dark:text-stone-400 mb-4">Deck not found</p>
          <Link href="/" className="text-amber-500 hover:underline">← Back home</Link>
        </div>
      </main>
    );
  }

  const stripeClass = THEME_STRIPE[deck.colorTheme] ?? THEME_STRIPE.slate;

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-900">
      <header className="bg-white dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700">
        {/* Deck color identity stripe */}
        <div className={`h-1 w-full ${stripeClass}`} />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/" className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors shrink-0">
            ← Back
          </Link>
          <span className="text-stone-300 dark:text-stone-600 shrink-0">|</span>
          <span className="text-2xl shrink-0">🔥</span>
          <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100 truncate">DeckForge</h1>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Deck header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">{deck.title}</h2>
            {deck.description && <p className="text-stone-500 dark:text-stone-400 mt-1">{deck.description}</p>}
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">From: {deck.sourceFileName}</p>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            <Link
              href={`/practice/${id}`}
              className={`font-semibold py-2.5 px-5 rounded-xl transition-colors ${
                stats && stats.due > 0
                  ? "bg-amber-400 hover:bg-amber-500 text-white"
                  : "bg-stone-800 dark:bg-stone-600 hover:bg-stone-700 dark:hover:bg-stone-500 text-white"
              }`}
            >
              {stats && stats.due > 0 ? `Practice (${stats.due} due)` : "Practice"}
            </Link>
            <a
              href={`/api/decks/${id}/export`}
              download
              className="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-600 dark:text-stone-300 font-semibold py-2.5 px-4 rounded-xl transition-colors"
              title="Export as JSON"
            >
              ↓ Export
            </a>
            <button
              onClick={handleDelete}
              className="bg-stone-100 dark:bg-stone-700 hover:bg-red-100 dark:hover:bg-red-900/30 text-stone-500 dark:text-stone-400 hover:text-red-600 dark:hover:text-red-400 font-semibold py-2.5 px-4 rounded-xl transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Mastery section */}
        {stats && <MasteryBar stats={stats} />}

        {/* Card list */}
        <div>
          <h3 className="font-semibold text-stone-700 dark:text-stone-300 mb-3">
            All Cards ({deck.cards.length})
          </h3>
          <div className="space-y-2">
            {deck.cards.map((card) => {
              const isDue = new Date(card.nextReviewDate) <= new Date();
              const isMastered = card.interval >= 21;
              const isNew = card.repetitions === 0;

              return (
                <div
                  key={card.id}
                  className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden"
                >
                  <button
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-stone-50 dark:hover:bg-stone-700/50 transition-colors"
                    onClick={() => setExpandedCard(expandedCard === card.id ? null : card.id)}
                  >
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${TYPE_COLORS[card.type] || "bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300"}`}
                    >
                      {card.type.replace("_", " ")}
                    </span>
                    <span className="text-stone-700 dark:text-stone-200 text-sm font-medium flex-1">{card.front}</span>
                    <span className="shrink-0 flex items-center gap-1.5 ml-2">
                      {isMastered && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full font-medium">
                          mastered
                        </span>
                      )}
                      {isDue && !isMastered && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Due for review" />
                      )}
                      {isNew && (
                        <span className="text-xs text-sky-500 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded-full font-medium">
                          new
                        </span>
                      )}
                      <span className="text-stone-400 dark:text-stone-500 text-xs">
                        {expandedCard === card.id ? "▲" : "▼"}
                      </span>
                    </span>
                  </button>
                  {expandedCard === card.id && (
                    <div className="px-4 pb-3 pt-1 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-100 dark:border-amber-800">
                      <p className="text-stone-600 dark:text-stone-300 text-sm">{card.back}</p>
                      <div className="flex gap-3 mt-2 text-xs text-stone-400 dark:text-stone-500">
                        <span>Interval: {card.interval}d</span>
                        <span>Reviews: {card.repetitions}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
