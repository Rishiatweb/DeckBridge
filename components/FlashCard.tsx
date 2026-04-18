"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { calculateNextReview, getNextReviewLabel } from "@/lib/sm2";
import { getCardLevel } from "@/lib/gamification";
import CardChat from "@/components/CardChat";

interface FlashCardProps {
  cardId: string;
  front: string;
  back: string;
  type: string;
  cardFormat?: string;   // "basic" | "mcq" | "fill_blank"
  options?: string;      // JSON string: ["correct", "w1", "w2", "w3"]
  difficulty?: number;   // 1 | 2 | 3
  colorTheme?: string;   // deck color identity
  focusMode?: boolean;   // hides chrome, dims rating buttons
  chatMessageCount?: number;
  showChatHint?: boolean;
  onRate: (rating: "again" | "hard" | "good" | "easy", chatMessageCount?: number) => void;
  onChatMessageCountChange: (count: number) => void;
  onReveal?: () => void;
  onDismissChatHint: () => void;
  cardNumber: number;
  totalCards: number;
  easeFactor?: number;
  interval?: number;
  repetitions?: number;
}

const TYPE_COLORS: Record<string, string> = {
  concept:      "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
  definition:   "bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300",
  relationship: "bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300",
  application:  "bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300",
  edge_case:    "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300",
};

const TYPE_LABELS: Record<string, string> = {
  concept:      "Concept",
  definition:   "Definition",
  relationship: "Relationship",
  application:  "Application",
  edge_case:    "Edge Case",
};

const RATING_BUTTONS: {
  key: "again" | "hard" | "good" | "easy";
  label: string;
  color: string;
  emoji: string;
}[] = [
  { key: "again", label: "Forgot", color: "bg-red-50 dark:bg-red-900/50 hover:bg-red-100 dark:hover:bg-red-900 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300", emoji: "🔴" },
  { key: "hard",  label: "Hard",   color: "bg-amber-50 dark:bg-amber-900/50 hover:bg-amber-100 dark:hover:bg-amber-900 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300", emoji: "🟡" },
  { key: "good",  label: "Good",   color: "bg-green-50 dark:bg-green-900/50 hover:bg-green-100 dark:hover:bg-green-900 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300", emoji: "🟢" },
  { key: "easy",  label: "Easy",   color: "bg-blue-50 dark:bg-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300", emoji: "⚡" },
];

const QUALITY_MAP = { again: 1, hard: 2, good: 4, easy: 5 } as const;

// ── Color theme stripe lookup ─────────────────────────────────────────────
const THEME_STRIPE: Record<string, string> = {
  blue:    "bg-blue-500",
  emerald: "bg-emerald-500",
  amber:   "bg-amber-500",
  rose:    "bg-rose-500",
  violet:  "bg-violet-500",
  slate:   "bg-slate-400",
};

// ── Rarity border/glow classes (applied to card face divs) ────────────────
const RARITY_BORDER: Record<number, string> = {
  0: "border-2 border-stone-200 dark:border-stone-600 shadow-sm",
  1: "border-2 border-amber-400 shadow-md shadow-amber-100 dark:shadow-amber-900/30",
  2: "rarity-rare shadow-md",
  3: "border-0 rarity-epic",
  4: "border-0 rarity-legendary",
};

// Animated background for epic/legendary — overrides static bg-white / bg-amber-50
const RARITY_BG: Record<number, string> = {
  0: "",
  1: "",
  2: "",
  3: "rarity-epic-bg",
  4: "rarity-legendary-bg",
};

// Rarity badge label + color
const RARITY_BADGE: Record<number, { label: string; color: string }> = {
  0: { label: "Common",    color: "text-stone-400 dark:text-stone-500" },
  1: { label: "Uncommon",  color: "text-amber-500" },
  2: { label: "Rare",      color: "text-slate-400 dark:text-slate-300" },
  3: { label: "Epic",      color: "text-indigo-500" },
  4: { label: "Legendary", color: "text-pink-500" },
};

// Flip duration per level
function flipDuration(level: number): number {
  return level === 0 ? 0.45 : 0.35;
}

/** Fisher-Yates shuffle — stable given same seed input */
function shuffleWithCorrectFirst(opts: string[]): { shuffled: string[]; correctIndex: number } {
  if (opts.length === 0) return { shuffled: [], correctIndex: 0 };
  const correct = opts[0];
  const rest = opts.slice(1);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const pos = Math.floor(Math.random() * (rest.length + 1));
  rest.splice(pos, 0, correct);
  return { shuffled: rest, correctIndex: pos };
}

// ── Typewriter hook ───────────────────────────────────────────────────────
function useTypewriter(text: string, active: boolean): string {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!active) {
      setDisplayed("");
      return;
    }
    const chars = text.length;
    if (chars === 0) { setDisplayed(""); return; }
    // ~25ms per char, capped so max total is 1200ms
    const msPerChar = Math.max(10, Math.min(25, 1200 / chars));
    let i = 0;
    setDisplayed("");
    const timer = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= chars) clearInterval(timer);
    }, msPerChar);
    return () => clearInterval(timer);
  }, [text, active]);

  return displayed;
}

// ── Shared metadata overlay (rarity badge + difficulty stars + color stripe) ──
function CardMetaOverlay({
  level,
  difficulty,
  colorTheme,
  chatActive = false,
}: {
  level: number;
  difficulty: number;
  colorTheme: string;
  chatActive?: boolean;
}) {
  const stripeClass = THEME_STRIPE[colorTheme] ?? THEME_STRIPE.slate;
  const badge = RARITY_BADGE[level];
  const stars = "⭐".repeat(Math.max(1, Math.min(3, difficulty)));

  return (
    <>
      {/* Deck color identity stripe */}
      <div className={`absolute top-0 left-0 right-0 h-[3px] ${stripeClass} rounded-t-[calc(1.5rem-2px)]`} />
      {/* Rarity badge + chat badge */}
      <div className="absolute top-3.5 left-4 flex items-center gap-2">
        <div className={`text-xs font-medium ${badge.color}`}>{badge.label}</div>
        {chatActive && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
            Chat
          </span>
        )}
      </div>
      {/* Difficulty stars — top right */}
      <div className="absolute top-3 right-4 text-xs leading-none" title={`Difficulty: ${difficulty}/3`}>
        {stars}
      </div>
    </>
  );
}

export default function FlashCard({
  cardId,
  front,
  back,
  type,
  cardFormat = "basic",
  options = "[]",
  difficulty = 1,
  colorTheme = "slate",
  focusMode = false,
  chatMessageCount = 0,
  showChatHint = false,
  onRate,
  onChatMessageCountChange,
  onReveal,
  onDismissChatHint,
  cardNumber,
  totalCards,
  easeFactor = 2.5,
  interval = 1,
  repetitions = 0,
}: FlashCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // MCQ state
  const [mcqChosen, setMcqChosen] = useState<number | null>(null);
  const isMcq = cardFormat === "mcq";
  const parsedOptions: string[] = useMemo(() => {
    try { return JSON.parse(options); } catch { return []; }
  }, [options]);
  const { shuffled: shuffledOptions, correctIndex } = useMemo(
    () => shuffleWithCorrectFirst(parsedOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options]
  );

  // Rarity level from SM-2 state
  const cardLevel = getCardLevel(repetitions, interval);

  // Typewriter for basic card back reveal
  const displayedBack = useTypewriter(back, flipped && cardFormat === "basic");

  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;
  const onRateRef = useRef(onRate);
  onRateRef.current = onRate;
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  const revealCard = () => {
    if (flippedRef.current) return;
    setFlipped(true);
    onRevealRef.current?.();
  };

  // Keyboard shortcuts: Space/Enter = flip/reveal, 1/2/3/4 = rate
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.key === " " || e.key === "Enter") && !flippedRef.current) {
        e.preventDefault();
        revealCard();
        return;
      }
      if (e.key.toLowerCase() === "c" && flippedRef.current) {
        e.preventDefault();
        if (showChatHint) {
          onDismissChatHint();
        }
        setChatOpen((open) => !open);
        return;
      }
      if (flippedRef.current) {
        const keyMap: Record<string, "again" | "hard" | "good" | "easy"> = {
          "1": "again", "2": "hard", "3": "good", "4": "easy",
        };
        const rating = keyMap[e.key];
        if (rating) {
          e.preventDefault();
          setFlipped(false);
          setChatOpen(false);
          onRateRef.current(rating, chatMessageCount);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chatMessageCount, onDismissChatHint, showChatHint]);

  const intervalPreviews = useMemo(() => {
    const cardState = { easeFactor, interval, repetitions, nextReviewDate: new Date() };
    const result: Record<string, string> = {};
    for (const btn of RATING_BUTTONS) {
      const quality = QUALITY_MAP[btn.key];
      const next = calculateNextReview(cardState, quality);
      result[btn.key] = getNextReviewLabel(next.interval);
    }
    return result;
  }, [easeFactor, interval, repetitions]);

  const handleFlip = () => {
    if (!flipped) revealCard();
  };

  const handleRate = (rating: "again" | "hard" | "good" | "easy") => {
    setFlipped(false);
    setMcqChosen(null);
    setChatOpen(false);
    onRate(rating, chatMessageCount);
  };

  const handleMcqChoose = (idx: number) => {
    if (mcqChosen !== null) return;
    setMcqChosen(idx);
    revealCard();
  };

  const typeColor = TYPE_COLORS[type] || "bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300";
  const typeLabel = TYPE_LABELS[type] || type;
  const rarityBorder = RARITY_BORDER[cardLevel.level] ?? RARITY_BORDER[0];
  const rarityBg = RARITY_BG[cardLevel.level] ?? "";

  const chatAreaProps = {
    cardId,
    colorTheme,
    isOpen: chatOpen,
    showHint: showChatHint,
    onOpenChange: setChatOpen,
    onMessageCountChange: onChatMessageCountChange,
    onDismissHint: onDismissChatHint,
  };

  // ── Shared progress bar (hidden in focus mode — page renders a minimal line) ──
  const ProgressBar = () => {
    if (focusMode) return null;
    return (
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-stone-500 dark:text-stone-400">{cardNumber} / {totalCards}</span>
        <div className="flex-1 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${THEME_STRIPE[colorTheme] ?? "bg-amber-400"}`}
            style={{ width: `${(cardNumber / totalCards) * 100}%` }}
          />
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${typeColor}`}>{typeLabel}</span>
      </div>
    );
  };

  // ── Shared rating buttons ─────────────────────────────────────────────
  const RatingButtons = () => (
    <div className={`flex gap-2 sm:gap-3 transition-opacity duration-200 ${focusMode ? "opacity-40 hover:opacity-100" : ""}`}>
      {RATING_BUTTONS.map((btn, i) => (
        <button
          key={btn.key}
          onClick={(e) => { e.stopPropagation(); handleRate(btn.key); }}
          className={`flex-1 py-3 px-2 rounded-2xl font-semibold text-sm transition-all duration-150 hover:scale-[1.03] active:scale-95 ${btn.color}`}
        >
          <span className="block text-base mb-0.5">{btn.emoji}</span>
          <span className="block">{btn.label}</span>
          <span className="block text-xs opacity-60 mt-0.5 font-normal">{intervalPreviews[btn.key]}</span>
          <span className="block text-xs opacity-40 font-normal mt-0.5"><kbd className="font-mono">{i + 1}</kbd></span>
        </button>
      ))}
    </div>
  );

  // ── MCQ card ──────────────────────────────────────────────────────────
  if (isMcq && shuffledOptions.length > 0) {
    const answered = mcqChosen !== null;
    const wasCorrect = answered && mcqChosen === correctIndex;

    return (
      <div className="w-full max-w-2xl mx-auto">
        <ProgressBar />

        {/* Question card with overlay */}
        <div className={`relative rounded-3xl p-8 pt-10 shadow-sm mb-4 ${rarityBg || "bg-white dark:bg-stone-800"} ${rarityBorder}`}>
          <CardMetaOverlay
            level={cardLevel.level}
            difficulty={difficulty}
            colorTheme={colorTheme}
            chatActive={chatMessageCount > 0}
          />
          <p className="text-stone-400 dark:text-stone-500 text-xs uppercase tracking-widest mb-4 font-medium text-center">Question</p>
          <p className="text-xl font-semibold text-stone-800 dark:text-stone-100 text-center leading-relaxed">{front}</p>
          <span className="absolute top-3.5 left-[50%] -translate-x-1/2 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-medium">MCQ</span>
        </div>

        {/* Options */}
        <div className="space-y-2 mb-4">
          {shuffledOptions.map((opt, idx) => {
            let btnClass = "w-full text-left px-4 py-3 rounded-xl border-2 font-medium text-sm transition-all duration-200 ";
            if (!answered) {
              btnClass += "border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:border-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 cursor-pointer";
            } else if (idx === correctIndex) {
              btnClass += "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 cursor-default";
            } else if (idx === mcqChosen) {
              btnClass += "border-red-400 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 cursor-default";
            } else {
              btnClass += "border-stone-100 dark:border-stone-700 bg-stone-50 dark:bg-stone-800/50 text-stone-400 dark:text-stone-500 cursor-default opacity-60";
            }

            return (
              <button key={idx} className={btnClass} onClick={() => handleMcqChoose(idx)} disabled={answered}>
                <span className="inline-flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full border-2 border-current flex items-center justify-center text-xs font-bold shrink-0">
                    {answered && idx === correctIndex ? "✓" : answered && idx === mcqChosen ? "✗" : String.fromCharCode(65 + idx)}
                  </span>
                  {opt}
                </span>
              </button>
            );
          })}
        </div>

        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700 rounded-2xl p-5 mb-4"
          >
            <p className="text-amber-700 dark:text-amber-400 text-xs uppercase tracking-widest font-medium mb-2">
              {wasCorrect ? "✓ Correct!" : "✗ Incorrect"} — Explanation
            </p>
            <p className="text-stone-700 dark:text-stone-200 text-sm leading-relaxed">{back}</p>
          </motion.div>
        )}

        {answered && <CardChat {...chatAreaProps} />}

        {answered && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: 0.1 }}>
            <RatingButtons />
          </motion.div>
        )}

        {!answered && (
          <p className="text-center text-xs text-stone-400 dark:text-stone-500 mt-2">Select an option above</p>
        )}
      </div>
    );
  }

  // ── Fill-in-blank card ────────────────────────────────────────────────
  if (cardFormat === "fill_blank") {
    const parts = front.split("___");
    const revealed = flipped;

    return (
      <div className="w-full max-w-2xl mx-auto">
        <ProgressBar />

        <div
          className={`relative w-full min-h-[280px] rounded-3xl p-8 pt-10 flex flex-col items-center justify-center shadow-sm cursor-pointer transition-colors duration-300 ${
            rarityBg || (revealed
              ? "bg-amber-50 dark:bg-amber-900/20"
              : "bg-white dark:bg-stone-800 hover:border-amber-300")
          } ${rarityBorder}`}
          onClick={handleFlip}
        >
          <CardMetaOverlay
            level={cardLevel.level}
            difficulty={difficulty}
            colorTheme={colorTheme}
            chatActive={chatMessageCount > 0}
          />
          <span className="absolute top-3.5 left-[50%] -translate-x-1/2 text-xs bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-300 px-2 py-0.5 rounded-full font-medium">Fill Blank</span>
          <p className="text-stone-400 dark:text-stone-500 text-xs uppercase tracking-widest mb-6 font-medium">
            {revealed ? "Answer revealed" : "Complete the sentence"}
          </p>
          <p className="text-xl font-semibold text-stone-800 dark:text-stone-100 text-center leading-relaxed">
            {parts[0]}
            <span
              className={`inline-block mx-1 px-3 py-0.5 rounded-lg border-2 border-dashed transition-all duration-300 ${
                revealed
                  ? "border-amber-400 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200"
                  : "border-stone-400 dark:border-stone-500 text-transparent bg-stone-100 dark:bg-stone-700 min-w-[80px]"
              }`}
            >
              {revealed ? back : "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0"}
            </span>
            {parts[1] ?? ""}
          </p>
          {!revealed && (
            <p className="text-stone-400 dark:text-stone-500 text-sm mt-6">
              Tap to reveal · <kbd className="font-mono bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-xs">Space</kbd>
            </p>
          )}
        </div>

        {revealed && <CardChat {...chatAreaProps} />}

        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: revealed ? 1 : 0, y: revealed ? 0 : 10 }}
          transition={{ duration: 0.2 }}
        >
          {revealed && <RatingButtons />}
        </motion.div>
      </div>
    );
  }

  // ── Basic flip card ───────────────────────────────────────────────────
  return (
    <div className="w-full max-w-2xl mx-auto">
      <ProgressBar />

      <div
        className="relative w-full min-h-[300px] cursor-pointer"
        style={{ perspective: "1200px" }}
        onClick={handleFlip}
      >
        <motion.div
          className="relative w-full min-h-[300px]"
          style={{ transformStyle: "preserve-3d" }}
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: flipDuration(cardLevel.level), ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Front face */}
          <div
            className={`relative w-full min-h-[300px] rounded-3xl p-8 pt-12 flex flex-col items-center justify-center shadow-sm ${rarityBg || "bg-white dark:bg-stone-800"} ${rarityBorder}`}
            style={{ backfaceVisibility: "hidden" }}
          >
            <CardMetaOverlay
              level={cardLevel.level}
              difficulty={difficulty}
              colorTheme={colorTheme}
              chatActive={chatMessageCount > 0}
            />
            <p className="text-stone-400 dark:text-stone-500 text-xs uppercase tracking-widest mb-4 font-medium">Question</p>
            <p className="text-xl font-semibold text-stone-800 dark:text-stone-100 text-center leading-relaxed">{front}</p>
            {!flipped && (
              <p className="text-stone-400 dark:text-stone-500 text-sm mt-6">
                Tap to reveal · <kbd className="font-mono bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded text-xs">Space</kbd>
              </p>
            )}
          </div>

          {/* Back face */}
          <div
            className={`absolute top-0 left-0 right-0 min-h-[300px] rounded-3xl p-8 flex flex-col items-center justify-center overflow-y-auto ${rarityBg || "bg-amber-50 dark:bg-amber-900/20"} ${rarityBorder}`}
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <p className="text-amber-600 dark:text-amber-400 text-xs uppercase tracking-widest mb-4 font-medium">Answer</p>
            <p className="text-lg text-stone-800 dark:text-stone-100 text-center leading-relaxed">
              {displayedBack}
              {/* blinking cursor while typing */}
              {displayedBack.length < back.length && (
                <span className="inline-block w-[2px] h-[1em] bg-amber-500 ml-0.5 align-middle animate-pulse" />
              )}
            </p>
          </div>
        </motion.div>
      </div>

      {flipped && <CardChat {...chatAreaProps} />}

      {/* Rating buttons */}
      <motion.div
        className="mt-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: flipped ? 1 : 0, y: flipped ? 0 : 10 }}
        transition={{ duration: 0.2 }}
      >
        {flipped && <RatingButtons />}
      </motion.div>
    </div>
  );
}
