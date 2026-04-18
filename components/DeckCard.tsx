"use client";

import Link from "next/link";
import { useState } from "react";

type ColorTheme = "blue" | "emerald" | "amber" | "rose" | "violet" | "slate";

// Static lookup — Tailwind needs full class strings to include them in the build
const THEME = {
  blue:    { stripe: "bg-blue-500",    hover: "hover:border-blue-300 dark:hover:border-blue-600" },
  emerald: { stripe: "bg-emerald-500", hover: "hover:border-emerald-300 dark:hover:border-emerald-600" },
  amber:   { stripe: "bg-amber-500",   hover: "hover:border-amber-300 dark:hover:border-amber-600" },
  rose:    { stripe: "bg-rose-500",    hover: "hover:border-rose-300 dark:hover:border-rose-600" },
  violet:  { stripe: "bg-violet-500",  hover: "hover:border-violet-300 dark:hover:border-violet-600" },
  slate:   { stripe: "bg-slate-400",   hover: "hover:border-stone-300 dark:hover:border-stone-600" },
} satisfies Record<ColorTheme, { stripe: string; hover: string }>;

const RARITY_DOT: Record<string, string> = {
  common:    "bg-gray-300 dark:bg-gray-600",
  uncommon:  "bg-amber-400",
  rare:      "bg-slate-400",
  epic:      "bg-indigo-500",
  legendary: "bg-pink-500",
};

interface RarityBreakdown {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

interface DeckCardProps {
  id: string;
  title: string;
  description: string;
  colorTheme?: ColorTheme;
  sourceFileName: string;
  cardCount: number;
  createdAt: string;
  mastered?: number;
  learning?: number;
  newCards?: number;
  due?: number;
  lastPracticed?: string | null;
  rarityBreakdown?: RarityBreakdown;
  onDelete?: (id: string) => void;
}

function relativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 14) return "1w ago";
  if (diffDays < 30) return `${Math.round(diffDays / 7)}w ago`;
  return `${Math.round(diffDays / 30)}mo ago`;
}

export default function DeckCard({
  id,
  title,
  description,
  colorTheme = "slate",
  sourceFileName,
  cardCount,
  createdAt,
  mastered = 0,
  learning = 0,
  due = 0,
  lastPracticed,
  rarityBreakdown,
  onDelete,
}: DeckCardProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/decks/${id}`, { method: "DELETE" });
      onDelete?.(id);
    } catch {
      setDeleting(false);
    }
  };

  const hasProgress = mastered > 0 || learning > 0;
  const masteredPct = cardCount > 0 ? (mastered / cardCount) * 100 : 0;
  const learningPct = cardCount > 0 ? (learning / cardCount) * 100 : 0;
  const practicedLabel = relativeTime(lastPracticed);
  const createdLabel = new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const theme = THEME[colorTheme] ?? THEME.slate;

  // Non-common cards for rarity dots
  const rarityDots = rarityBreakdown
    ? (["legendary", "epic", "rare", "uncommon", "common"] as const).flatMap((key) => {
        const count = rarityBreakdown[key];
        if (count === 0) return [];
        return [{ key, count }];
      })
    : [];

  return (
    <div
      className={`relative group bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 overflow-hidden hover:shadow-md transition-all duration-200 ${theme.hover} ${
        deleting ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      {/* Color stripe — deck identity */}
      <div className={`h-1 w-full ${theme.stripe}`} />

      <Link href={`/decks/${id}`} className="block p-5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-stone-800 dark:text-stone-100 text-lg leading-tight truncate">{title}</h3>
            {description && (
              <p className="text-stone-500 dark:text-stone-400 text-sm mt-1 line-clamp-2">{description}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <span className="text-2xl font-bold text-amber-500">{cardCount}</span>
            {due > 0 && (
              <span className="text-xs font-semibold bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full">
                {due} due
              </span>
            )}
          </div>
        </div>

        {/* Mastery bar */}
        {hasProgress && (
          <div className="mt-4">
            <div className="flex h-1.5 rounded-full overflow-hidden bg-stone-100 dark:bg-stone-700">
              <div
                className="bg-emerald-400 transition-all duration-500"
                style={{ width: `${masteredPct}%` }}
              />
              <div
                className="bg-amber-400 transition-all duration-500"
                style={{ width: `${learningPct}%` }}
              />
            </div>
            <div className="flex gap-3 mt-1.5 text-xs text-stone-400 dark:text-stone-500">
              {mastered > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  {mastered} mastered
                </span>
              )}
              {learning > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                  {learning} learning
                </span>
              )}
            </div>
          </div>
        )}

        {/* Rarity breakdown dots */}
        {rarityDots.length > 0 && (
          <div className="flex items-center gap-1.5 mt-3">
            {rarityDots.map(({ key, count }) => (
              <span key={key} className="flex items-center gap-0.5" title={`${count} ${key}`}>
                <span className={`w-2 h-2 rounded-full ${RARITY_DOT[key]}`} />
                <span className="text-xs text-stone-400 dark:text-stone-500">{count}</span>
              </span>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-2 mt-3 text-xs text-stone-400 dark:text-stone-500">
          <span className="bg-stone-100 dark:bg-stone-700 px-2 py-0.5 rounded-full truncate max-w-[140px]">
            {sourceFileName}
          </span>
          <span className="ml-auto shrink-0">
            {practicedLabel ? (
              <span className={practicedLabel === "today" ? "text-emerald-500 font-medium" : ""}>
                {practicedLabel === "today" ? "✓ studied today" : `studied ${practicedLabel}`}
              </span>
            ) : (
              <span>added {createdLabel}</span>
            )}
          </span>
        </div>
      </Link>

      {/* Action buttons */}
      <div className="flex gap-2 px-5 pb-5">
        <Link
          href={`/practice/${id}`}
          className={`flex-1 text-center text-sm font-semibold py-2 px-4 rounded-xl transition-colors ${
            due > 0
              ? "bg-amber-400 hover:bg-amber-500 text-white"
              : "bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200"
          }`}
        >
          {due > 0 ? `Practice (${due} due)` : "Practice"}
        </Link>
        <Link
          href={`/decks/${id}`}
          className="text-sm font-semibold bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 py-2 px-4 rounded-xl transition-colors"
        >
          View
        </Link>
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 transition-all p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30"
        aria-label="Delete deck"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1H11Z" />
        </svg>
      </button>
    </div>
  );
}
