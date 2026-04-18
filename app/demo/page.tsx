"use client";

import Link from "next/link";

const CARDS = [
  {
    level: 0,
    label: "Common",
    badgeColor: "text-stone-400",
    border: "border-2 border-stone-200 dark:border-stone-600 shadow-sm",
    bgFront: "bg-white dark:bg-stone-800",
    bgBack: "bg-amber-50 dark:bg-amber-900/20",
    front: "What is spaced repetition?",
    back: "A learning technique that increases intervals between reviews of previously learned material to exploit the psychological spacing effect.",
    difficulty: 1,
    stripe: "bg-violet-500",
  },
  {
    level: 1,
    label: "Uncommon",
    badgeColor: "text-amber-500",
    border: "border-2 border-amber-400 shadow-md shadow-amber-100 dark:shadow-amber-900/30",
    bgFront: "bg-white dark:bg-stone-800",
    bgBack: "bg-amber-50 dark:bg-amber-900/20",
    front: "Why does TCP use a three-way handshake instead of two?",
    back: "A two-way handshake only proves the client can send. The third step proves the server can also send — confirming bidirectional communication before data flows.",
    difficulty: 2,
    stripe: "bg-violet-500",
  },
  {
    level: 2,
    label: "Rare",
    badgeColor: "text-slate-400 dark:text-slate-300",
    border: "rarity-rare shadow-md",
    bgFront: "bg-white dark:bg-stone-800",
    bgBack: "bg-amber-50 dark:bg-amber-900/20",
    front: "What property prevents a bank transfer from leaving money in limbo if the server crashes mid-transfer?",
    back: "Atomicity. Either all operations in the transaction commit, or none do — both accounts return to their original state on rollback.",
    difficulty: 2,
    stripe: "bg-blue-500",
  },
  {
    level: 3,
    label: "Epic",
    badgeColor: "text-indigo-500",
    border: "border-0 rarity-epic",
    bgFront: "rarity-epic-bg",
    bgBack: "rarity-epic-bg",
    front: "What happens when a MongoDB replica set primary goes down with in-flight writes?",
    back: "Writes not yet replicated to a majority are rolled back. The new primary only reflects writes that reached quorum — unacknowledged writes are lost.",
    difficulty: 3,
    stripe: "bg-violet-500",
  },
  {
    level: 4,
    label: "Legendary",
    badgeColor: "text-pink-500",
    border: "border-0 rarity-legendary",
    bgFront: "rarity-legendary-bg",
    bgBack: "rarity-legendary-bg",
    front: "Why can TCP's sliding window cause head-of-line blocking even when later packets have arrived?",
    back: "TCP delivers data in order. If packet N is lost, packets N+1…N+k sit in the receive buffer but can't be passed to the application until N is retransmitted and fills the gap — stalling the entire stream.",
    difficulty: 3,
    stripe: "bg-blue-500",
  },
];

const DIFFICULTY_STARS: Record<number, string> = { 1: "⭐", 2: "⭐⭐", 3: "⭐⭐⭐" };

export default function DemoPage() {
  return (
    <main className="min-h-screen bg-stone-100 dark:bg-stone-900 px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Rarity Effects Demo</h1>
            <p className="text-stone-500 dark:text-stone-400 text-sm mt-1">All 5 card levels — Common through Legendary</p>
          </div>
          <Link href="/" className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors">
            ← Back
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CARDS.map((card) => (
            <div key={card.level} className="flex flex-col gap-2">
              {/* Label above card */}
              <div className="flex items-center gap-2 px-1">
                <span className={`text-sm font-bold ${card.badgeColor}`}>Level {card.level} — {card.label}</span>
              </div>

              {/* Card face (front) */}
              <div className={`relative rounded-3xl p-6 pt-9 min-h-[220px] flex flex-col justify-center ${card.bgFront} ${card.border}`}>
                {/* Color stripe */}
                <div className={`absolute top-0 left-0 right-0 h-[3px] ${card.stripe} rounded-t-[calc(1.5rem-2px)]`} />

                {/* Rarity badge top-left */}
                <div className="absolute top-3.5 left-4 flex items-center gap-2">
                  <span className={`text-xs font-medium ${card.badgeColor}`}>{card.label}</span>
                </div>

                {/* Difficulty stars top-right */}
                <div className="absolute top-3 right-4 text-xs leading-none">
                  {DIFFICULTY_STARS[card.difficulty]}
                </div>

                <p className="text-xs uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-3 font-medium text-center">Question</p>
                <p className="text-sm font-semibold text-stone-800 dark:text-stone-100 text-center leading-relaxed">
                  {card.front}
                </p>
              </div>

              {/* Card face (back / answer) */}
              <div className={`relative rounded-3xl p-6 pt-9 min-h-[180px] flex flex-col justify-center ${card.bgBack} ${card.border}`}>
                {/* Color stripe */}
                <div className={`absolute top-0 left-0 right-0 h-[3px] ${card.stripe} rounded-t-[calc(1.5rem-2px)]`} />

                {/* Rarity badge */}
                <div className="absolute top-3.5 left-4">
                  <span className={`text-xs font-medium ${card.badgeColor}`}>{card.label}</span>
                </div>

                {/* Difficulty */}
                <div className="absolute top-3 right-4 text-xs leading-none">
                  {DIFFICULTY_STARS[card.difficulty]}
                </div>

                <p className="text-xs uppercase tracking-widest text-amber-500 mb-3 font-medium text-center">Answer</p>
                <p className="text-sm text-stone-700 dark:text-stone-200 text-center leading-relaxed">
                  {card.back}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-10">
          This page is for visual testing only — not linked in production nav
        </p>
      </div>
    </main>
  );
}
