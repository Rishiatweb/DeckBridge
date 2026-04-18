"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import UploadZone from "@/components/UploadZone";
import DeckCard from "@/components/DeckCard";
import ThemeToggle from "@/components/ThemeToggle";
import CollectionBanner from "@/components/CollectionBanner";
import { createClient } from "@/lib/supabase/client";

interface RarityBreakdown {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
  legendary: number;
}

type ColorTheme = "blue" | "emerald" | "amber" | "rose" | "violet" | "slate";

interface Deck {
  id: string;
  title: string;
  description: string;
  colorTheme: ColorTheme;
  sourceFileName: string;
  cardCount: number;
  createdAt: string;
  mastered: number;
  learning: number;
  newCards: number;
  due: number;
  lastPracticed: string | null;
  rarityBreakdown: RarityBreakdown;
}

type SortMode = "urgent" | "newest" | "practiced" | "alpha";

const SORT_LABELS: Record<SortMode, string> = {
  urgent: "Due first",
  newest: "Newest",
  practiced: "Last practiced",
  alpha: "A–Z",
};

const SORT_LABELS_SHORT: Record<SortMode, string> = {
  urgent: "Due",
  newest: "New",
  practiced: "Practiced",
  alpha: "A–Z",
};

function sortDecks(decks: Deck[], mode: SortMode): Deck[] {
  const copy = Array.isArray(decks) ? [...decks] : [];
  switch (mode) {
    case "urgent":
      return copy.sort((a, b) => {
        if (b.due !== a.due) return b.due - a.due;
        const at = a.lastPracticed ? new Date(a.lastPracticed).getTime() : 0;
        const bt = b.lastPracticed ? new Date(b.lastPracticed).getTime() : 0;
        return bt - at;
      });
    case "newest":
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case "practiced":
      return copy.sort((a, b) => {
        const at = a.lastPracticed ? new Date(a.lastPracticed).getTime() : 0;
        const bt = b.lastPracticed ? new Date(b.lastPracticed).getTime() : 0;
        return bt - at;
      });
    case "alpha":
      return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
}

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("urgent");
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [merging, setMerging] = useState(false);

  const fetchDecks = async () => {
    try {
      const res = await fetch("/api/decks");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Failed to load decks"
        );
      }
      if (!Array.isArray(data)) {
        throw new Error("Deck list response was not an array");
      }
      setDecks(data);
      setLoadError(null);
    } catch (err) {
      setDecks([]);
      setLoadError(err instanceof Error ? err.message : "Failed to load decks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecks();
  }, []);

  const handleDelete = (id: string) => {
    setDecks((prev) => prev.filter((d) => d.id !== id));
  };

  const displayedDecks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? decks.filter(
          (d) =>
            d.title.toLowerCase().includes(q) ||
            d.sourceFileName.toLowerCase().includes(q)
        )
      : decks;
    return sortDecks(filtered, sortMode);
  }, [decks, searchQuery, sortMode]);

  const totalDue = useMemo(() => decks.reduce((s, d) => s + d.due, 0), [decks]);
  const decksWithDue = useMemo(() => decks.filter((d) => d.due > 0).length, [decks]);
  const mostUrgent = useMemo(
    () => [...decks].sort((a, b) => b.due - a.due)[0] ?? null,
    [decks]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    if (selectedIds.size < 2) return;
    setMerging(true);
    try {
      const res = await fetch("/api/decks/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckIds: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        setMergeMode(false);
        setSelectedIds(new Set());
        router.push(`/decks/${data.deckId}`);
      }
    } catch {
      // ignore
    } finally {
      setMerging(false);
    }
  };

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-900">
      {/* Header */}
      <header className="bg-white dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <span className="text-2xl">🔥</span>
          <h1 className="text-xl font-bold text-stone-800 dark:text-stone-100">DeckForge</h1>
          <span className="hidden sm:inline text-stone-400 dark:text-stone-500 text-sm ml-1">AI Flashcard Engine</span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/mastery"
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 transition-colors px-3 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              ⚡ My Mastery
            </Link>
            <ThemeToggle />
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push("/auth");
              }}
              className="text-xs font-semibold text-stone-500 dark:text-stone-400 hover:text-red-500 dark:hover:text-red-400 transition-colors px-3 py-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8 sm:space-y-10">
        {/* Upload section */}
        <section>
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-stone-800 dark:text-stone-100 mb-2">
              Upload a PDF. Get smart flashcards.
            </h2>
            <p className="text-stone-500 dark:text-stone-400 text-lg">
              Drop any textbook chapter or class notes — AI generates a complete study deck in seconds.
            </p>
          </div>
          <UploadZone />
        </section>

        {/* Collection banner — only when decks exist */}
        {!loading && decks.length > 0 && <CollectionBanner />}

        {/* Decks section */}
        <section>
          {/* Global due banner */}
          {!loading && !mergeMode && totalDue > 0 && mostUrgent && (
            <div className="mb-6 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-300">
                  {totalDue} card{totalDue !== 1 ? "s" : ""} due across{" "}
                  {decksWithDue} deck{decksWithDue !== 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-0.5">
                  Pick up where you left off →{" "}
                  <span className="font-medium">{mostUrgent.title}</span>
                </p>
              </div>
              <Link
                href={`/practice/${mostUrgent.id}`}
                className="shrink-0 bg-amber-400 hover:bg-amber-500 text-white font-semibold py-2 px-5 rounded-xl transition-colors text-sm"
              >
                Continue
              </Link>
            </div>
          )}

          {/* Merge mode banner */}
          {mergeMode && (
            <div className="mb-6 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-2xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-purple-800 dark:text-purple-300">
                  Merge Mode — select {selectedIds.size < 2 ? `${2 - selectedIds.size} more deck${selectedIds.size === 1 ? "" : "s"}` : `${selectedIds.size} decks selected`}
                </p>
                <p className="text-sm text-purple-600 dark:text-purple-400 mt-0.5">
                  Click decks to select them, then merge into a single deck
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={handleMerge}
                  disabled={selectedIds.size < 2 || merging}
                  className="bg-purple-500 hover:bg-purple-600 disabled:bg-stone-300 dark:disabled:bg-stone-700 text-white disabled:text-stone-500 font-semibold py-2 px-4 rounded-xl transition-colors text-sm"
                >
                  {merging ? "Merging..." : `Merge (${selectedIds.size})`}
                </button>
                <button
                  onClick={() => { setMergeMode(false); setSelectedIds(new Set()); }}
                  className="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-600 dark:text-stone-300 font-semibold py-2 px-4 rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Section header with search + sort */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
            <h2 className="text-xl font-bold text-stone-800 dark:text-stone-100 shrink-0">Your Decks</h2>

            {decks.length > 0 && (
              <>
                <div className="relative flex-1">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500"
                    width="15"
                    height="15"
                    viewBox="0 0 15 15"
                    fill="none"
                  >
                    <path
                      d="M10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm-.7 3.507 2.846 2.847a.5.5 0 0 1-.707.707L8.593 9.807A4.5 4.5 0 1 1 9.3 9.1Z"
                      fill="currentColor"
                      fillRule="evenodd"
                      clipRule="evenodd"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search decks..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-xl focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 text-stone-700 dark:text-stone-200 placeholder:text-stone-400 dark:placeholder:text-stone-500"
                  />
                </div>

                <div className="flex gap-1 bg-stone-100 dark:bg-stone-800 rounded-xl p-1 shrink-0">
                  {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSortMode(mode)}
                      className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        sortMode === mode
                          ? "bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm"
                          : "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                      }`}
                    >
                      <span className="hidden sm:inline">{SORT_LABELS[mode]}</span>
                      <span className="sm:hidden">{SORT_LABELS_SHORT[mode]}</span>
                    </button>
                  ))}
                </div>

                {!mergeMode && decks.length >= 2 && (
                  <button
                    onClick={() => setMergeMode(true)}
                    className="shrink-0 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 px-3 py-2 rounded-xl transition-colors border border-purple-200 dark:border-purple-700"
                  >
                    ⊕ Merge
                  </button>
                )}
              </>
            )}
          </div>

          {!loading && decks.length > 0 && (
            <p className="text-xs text-stone-400 dark:text-stone-500 mb-4">
              {searchQuery
                ? `${displayedDecks.length} of ${decks.length} deck${decks.length !== 1 ? "s" : ""}`
                : `${decks.length} deck${decks.length !== 1 ? "s" : ""}`}
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-48 bg-stone-200 dark:bg-stone-700 rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : loadError ? (
            <div className="text-center py-12 rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">
              <div className="text-4xl mb-3">!</div>
              <p className="text-lg font-medium">Couldn&apos;t load decks</p>
              <p className="text-sm mt-1">{loadError}</p>
              <button
                onClick={() => {
                  setLoading(true);
                  fetchDecks();
                }}
                className="text-sm font-medium text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 mt-3"
              >
                Try again
              </button>
            </div>
          ) : decks.length === 0 ? (
            <div className="text-center py-16 text-stone-400 dark:text-stone-500">
              <div className="text-5xl mb-3">🃏</div>
              <p className="text-lg font-medium text-stone-600 dark:text-stone-300">Drop your first PDF to start building your collection</p>
              <p className="text-sm mt-2">Cards level up as you remember them — Common → Uncommon → Rare → Epic → Legendary</p>
            </div>
          ) : displayedDecks.length === 0 ? (
            <div className="text-center py-12 text-stone-400 dark:text-stone-500">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-lg font-medium">No decks match &quot;{searchQuery}&quot;</p>
              <button
                onClick={() => setSearchQuery("")}
                className="text-sm text-amber-500 hover:text-amber-600 mt-2"
              >
                Clear search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedDecks.map((deck) =>
                mergeMode ? (
                  <div
                    key={deck.id}
                    onClick={() => toggleSelect(deck.id)}
                    className={`cursor-pointer rounded-2xl border-2 p-1 transition-all duration-150 ${
                      selectedIds.has(deck.id)
                        ? "border-purple-400 dark:border-purple-500 shadow-md shadow-purple-100 dark:shadow-purple-900/30"
                        : "border-transparent hover:border-purple-200 dark:hover:border-purple-700"
                    }`}
                  >
                    {selectedIds.has(deck.id) && (
                      <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400 text-xs font-semibold mb-1 px-1">
                        <span>✓ Selected</span>
                      </div>
                    )}
                    <DeckCard {...deck} onDelete={handleDelete} />
                  </div>
                ) : (
                  <DeckCard key={deck.id} {...deck} onDelete={handleDelete} />
                )
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
