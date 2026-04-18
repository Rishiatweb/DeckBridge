"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import FlashCard from "@/components/FlashCard";
import LevelUpToast from "@/components/LevelUpToast";

interface Card {
  id: string;
  front: string;
  back: string;
  type: string;
  cardFormat: string;
  options: string;
  difficulty: number;
  easeFactor: number;
  interval: number;
  repetitions: number;
}

interface SessionStats {
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}

interface LevelUp {
  front: string;
  newLabel: string;
  newLevel: number;
  chatBoosted?: boolean;
}

// ── Focus mode ambient gradients (very dark, slow-shifting) ──────────────────
const FOCUS_AMBIENT: Record<string, string> = {
  blue:    "linear-gradient(135deg, #1e293b, #0f172a, #1e3a5f, #0f172a)",
  emerald: "linear-gradient(135deg, #052e16, #022c22, #083344, #022c22)",
  amber:   "linear-gradient(135deg, #2d1a08, #1c0f04, #2d1a0a, #1c0f04)",
  rose:    "linear-gradient(135deg, #2d0a1a, #1a0610, #3d0a24, #1a0610)",
  violet:  "linear-gradient(135deg, #1a0d3d, #0d0720, #2e0a4e, #0d0720)",
  slate:   "linear-gradient(135deg, #1e293b, #0f172a, #1e2435, #0f172a)",
};

const FOCUS_STRIPE: Record<string, string> = {
  blue: "bg-blue-400", emerald: "bg-emerald-400", amber: "bg-amber-400",
  rose: "bg-rose-400", violet: "bg-violet-400", slate: "bg-slate-400",
};

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Theme lookups ─────────────────────────────────────────────────────────────
const THEME_ACCENT: Record<string, string> = {
  blue:    "text-blue-600 dark:text-blue-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber:   "text-amber-600 dark:text-amber-400",
  rose:    "text-rose-600 dark:text-rose-400",
  violet:  "text-violet-600 dark:text-violet-400",
  slate:   "text-stone-600 dark:text-stone-400",
};

const THEME_BTN: Record<string, string> = {
  blue:    "bg-blue-500 hover:bg-blue-600",
  emerald: "bg-emerald-500 hover:bg-emerald-600",
  amber:   "bg-amber-500 hover:bg-amber-600",
  rose:    "bg-rose-500 hover:bg-rose-600",
  violet:  "bg-violet-500 hover:bg-violet-600",
  slate:   "bg-stone-600 hover:bg-stone-700",
};

const THEME_GRADIENT: Record<string, string> = {
  blue:    "from-blue-50 to-white dark:from-blue-950/20 dark:to-stone-900",
  emerald: "from-emerald-50 to-white dark:from-emerald-950/20 dark:to-stone-900",
  amber:   "from-amber-50 to-white dark:from-amber-950/20 dark:to-stone-900",
  rose:    "from-rose-50 to-white dark:from-rose-950/20 dark:to-stone-900",
  violet:  "from-violet-50 to-white dark:from-violet-950/20 dark:to-stone-900",
  slate:   "from-stone-100 to-white dark:from-stone-800/40 dark:to-stone-900",
};

const LEVEL_COLOR: Record<number, string> = {
  0: "text-stone-400",
  1: "text-amber-500",
  2: "text-slate-400 dark:text-slate-300",
  3: "text-indigo-500",
  4: "text-pink-500",
};

const SESSION_TIPS = [
  "Flip fast, then pause for the rating that matches how well you actually knew it.",
  "Use chat on sticky concepts when you want a simpler explanation or quick check question.",
  "A streak keeps momentum high, but honest ratings keep the schedule smart.",
];

// ── Counting number animation ─────────────────────────────────────────────────
function CountingNumber({ target, duration = 1 }: { target: number; duration?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (target === 0) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - start) / (duration * 1000);
      const progress = Math.min(elapsed, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(eased * target));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);

  return <>{value.toLocaleString()}</>;
}

// ── Fade-in item with delay ───────────────────────────────────────────────────
function FadeItem({
  delay,
  children,
  className = "",
}: {
  delay: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function PracticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionStats, setSessionStats] = useState<SessionStats>({
    reviewed: 0, again: 0, hard: 0, good: 0, easy: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [sessionType, setSessionType] = useState<"review" | "new" | "none">("review");
  const [colorTheme, setColorTheme] = useState("slate");
  const [deckTitle, setDeckTitle] = useState("");
  const [postStats, setPostStats] = useState<{ due: number; dueIn24h: number; streakDays: number } | null>(null);
  const [preSessionStats, setPreSessionStats] = useState<{ streakDays: number } | null>(null);
  const [levelUps, setLevelUps] = useState<LevelUp[]>([]);
  const [sessionPower, setSessionPower] = useState(0);
  const [activeToast, setActiveToast] = useState<{
    front: string;
    previousLabel: string;
    currentLabel: string;
    currentLevel: number;
    chatBoosted?: boolean;
    toastId: number;
  } | null>(null);

  const [focusMode, setFocusMode] = useState(false);
  const [focusSecs, setFocusSecs] = useState(0);
  const [focusExitMsg, setFocusExitMsg] = useState<string | null>(null);
  const [activeChatCounts, setActiveChatCounts] = useState<Record<string, number>>({});
  const [chattedCardIds, setChattedCardIds] = useState<Record<string, true>>({});
  const [chatBoostCardIds, setChatBoostCardIds] = useState<Record<string, true>>({});
  const [showChatHint, setShowChatHint] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);

  const requeueCounts = useRef<Map<string, number>>(new Map());
  const toastIdRef = useRef(0);
  const chatHintShownRef = useRef(false);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        const [practiceRes, deckRes, statsRes] = await Promise.all([
          fetch(`/api/practice/${id}`),
          fetch(`/api/decks/${id}`),
          fetch(`/api/decks/${id}/stats`),
        ]);
        const practiceData = await practiceRes.json();
        const deckData = await deckRes.json();
        const statsData = await statsRes.json();

        if (practiceRes.ok) {
          setCards(practiceData.cards);
          setSessionType(practiceData.sessionType);
          setColorTheme(practiceData.colorTheme ?? "slate");
          if (practiceData.sessionType === "none" || practiceData.cards.length === 0) {
            setSessionDone(true);
          }
        }
        if (deckRes.ok) {
          setDeckTitle(deckData.title ?? "");
        }
        if (statsRes.ok) {
          setPreSessionStats({ streakDays: statsData.streakDays ?? 0 });
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchCards();
  }, [id]);

  const handleCardReveal = useCallback(() => {
    if (chatHintShownRef.current) return;

    try {
      if (window.localStorage.getItem("hasSeenChatHint")) {
        chatHintShownRef.current = true;
        return;
      }

      window.localStorage.setItem("hasSeenChatHint", "true");
      chatHintShownRef.current = true;
      setShowChatHint(true);
    } catch {
      chatHintShownRef.current = true;
      setShowChatHint(true);
    }
  }, []);

  const dismissChatHint = useCallback(() => {
    setShowChatHint(false);
  }, []);

  const handleChatMessageCountChange = useCallback((cardId: string, count: number) => {
    setActiveChatCounts((prev) => ({ ...prev, [cardId]: count }));
    if (count > 0) {
      setChattedCardIds((prev) => ({ ...prev, [cardId]: true }));
    }
  }, []);

  // Focus timer — increments every second while focus mode is active
  useEffect(() => {
    if (!focusMode) return;
    const interval = setInterval(() => setFocusSecs((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [focusMode]);

  useEffect(() => {
    if (sessionStarted || sessionDone) return;
    const interval = setInterval(() => {
      setTipIndex((current) => (current + 1) % SESSION_TIPS.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [sessionDone, sessionStarted]);

  const toggleFocus = () => {
    if (focusMode) {
      const minutes = Math.floor(focusSecs / 60);
      if (minutes > 0) {
        setFocusExitMsg(`Focused for ${minutes} minute${minutes !== 1 ? "s" : ""}`);
        setTimeout(() => setFocusExitMsg(null), 3000);
      }
      setFocusSecs(0);
    }
    setFocusMode((f) => !f);
  };

  const handleRate = useCallback(
    (rating: "again" | "hard" | "good" | "easy", chatMessageCount = 0) => {
      const card = cards[currentIndex];
      if (!card) return;

      setShowChatHint(false);

      setSessionStats((prev) => ({
        reviewed: prev.reviewed + 1,
        again:  prev.again  + (rating === "again" ? 1 : 0),
        hard:   prev.hard   + (rating === "hard"  ? 1 : 0),
        good:   prev.good   + (rating === "good"  ? 1 : 0),
        easy:   prev.easy   + (rating === "easy"  ? 1 : 0),
      }));

      setActiveChatCounts((prev) => {
        const next = { ...prev };
        delete next[card.id];
        return next;
      });

      // Fire review — capture level-ups non-blocking
      fetch(`/api/cards/${card.id}/review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, chatMessageCount }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.chatBoosted) {
            setChatBoostCardIds((prev) => ({ ...prev, [card.id]: true }));
          }
          if (data.levelChange) {
            // Track for results screen
            setLevelUps((prev) => [
              ...prev,
              {
                front: card.front,
                newLabel: data.levelChange.currentLabel,
                newLevel: data.levelChange.current,
                chatBoosted: data.levelChange.chatBoosted,
              },
            ]);
            // Show toast
            setActiveToast({
              front: card.front,
              previousLabel: data.levelChange.previousLabel,
              currentLabel: data.levelChange.currentLabel,
              currentLevel: data.levelChange.current,
              chatBoosted: data.levelChange.chatBoosted,
              toastId: ++toastIdRef.current,
            });
          }
          if (data.pointsEarned > 0) {
            setSessionPower((prev) => prev + data.pointsEarned);
          }
        })
        .catch(console.error);

      if (rating === "again") {
        const count = requeueCounts.current.get(card.id) ?? 0;
        if (count < 2 && cards.length > 1) {
          requeueCounts.current.set(card.id, count + 1);
          setCards((prev) => [
            ...prev.slice(0, currentIndex),
            ...prev.slice(currentIndex + 1),
            card,
          ]);
          return;
        }
      }

      if (currentIndex + 1 >= cards.length) {
        setSessionDone(true);
        fetch(`/api/decks/${id}/stats`)
          .then((r) => r.json())
          .then((s) => setPostStats({ due: s.due ?? 0, dueIn24h: s.dueIn24h ?? 0, streakDays: s.streakDays ?? 0 }))
          .catch(() => {});
      } else {
        setCurrentIndex((i) => i + 1);
      }
    },
    [cards, currentIndex, id]
  );

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <main className="min-h-screen bg-stone-50 dark:bg-stone-900 flex items-center justify-center">
        <p className="text-stone-400 dark:text-stone-500">Loading session...</p>
      </main>
    );
  }

  // ── Pre-session ritual ─────────────────────────────────────────────────────
  if (!sessionStarted && !sessionDone && sessionType !== "none" && cards.length > 0) {
    const accentClass  = THEME_ACCENT[colorTheme]   ?? THEME_ACCENT.slate;
    const btnClass     = THEME_BTN[colorTheme]       ?? THEME_BTN.slate;
    const gradientClass = THEME_GRADIENT[colorTheme] ?? THEME_GRADIENT.slate;

    return (
      <main className={`min-h-screen bg-gradient-to-b ${gradientClass} flex items-center justify-center px-6`}>
        <div className="max-w-sm w-full text-center space-y-8">
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="text-xs uppercase tracking-widest text-stone-400 dark:text-stone-500 mb-2">
              {sessionType === "new" ? "New Cards" : "Review Session"}
            </p>
            <h1 className={`text-3xl font-bold ${accentClass} leading-tight`}>{deckTitle || "Study Session"}</h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.25 }}
            className="space-y-3"
          >
            <div className="text-5xl font-bold text-stone-800 dark:text-stone-100">
              {cards.length}
            </div>
            <p className="text-stone-500 dark:text-stone-400 text-sm">
              {sessionType === "new" ? "new cards to learn" : `card${cards.length !== 1 ? "s" : ""} due for review`}
            </p>
          </motion.div>

          {preSessionStats && preSessionStats.streakDays > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.35 }}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <p className="font-semibold">🔥 {preSessionStats.streakDays}-day streak active</p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                Keep the chain alive today to hold onto your collection momentum.
              </p>
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.45 }}
            className="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3 text-sm text-stone-600 backdrop-blur-sm dark:border-stone-700 dark:bg-stone-800/70 dark:text-stone-300"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">Session Tip</p>
            <AnimatePresence mode="wait">
              <motion.p
                key={tipIndex}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mt-2 min-h-[2.5rem] leading-relaxed"
              >
                {SESSION_TIPS[tipIndex]}
              </motion.p>
            </AnimatePresence>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.5 }}
          >
            <motion.button
              onClick={() => setSessionStarted(true)}
              animate={{ scale: [1, 1.03, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className={`${btnClass} text-white font-bold py-4 px-10 rounded-2xl text-lg shadow-lg transition-colors`}
            >
              Begin Session →
            </motion.button>
            <p className="text-xs text-stone-400 dark:text-stone-500 mt-4">
              Space to flip · 1/2/3/4 to rate · C to chat
            </p>
          </motion.div>
        </div>
      </main>
    );
  }

  // ── Session complete / No cards ────────────────────────────────────────────
  if (sessionDone || sessionType === "none") {
    const accuracy =
      sessionStats.reviewed > 0
        ? Math.round(((sessionStats.good + sessionStats.easy) / sessionStats.reviewed) * 100)
        : 0;
    const chattedCardCount = Object.keys(chattedCardIds).length;
    const chatBoostCardCount = Object.keys(chatBoostCardIds).length;

    const nextReviewLabel = postStats
      ? postStats.due > 0
        ? `${postStats.due} more cards due now`
        : postStats.dueIn24h > 0
        ? "Next review: Tomorrow"
        : "All caught up!"
      : null;

    if (sessionType === "none") {
      return (
        <main className="min-h-screen bg-stone-50 dark:bg-stone-900 flex flex-col items-center justify-center px-6">
          <div className="max-w-md w-full text-center space-y-6">
            <FadeItem delay={0}><div className="text-6xl">🎉</div></FadeItem>
            <FadeItem delay={0.2}>
              <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">All caught up!</h2>
              <p className="text-stone-500 dark:text-stone-400 mt-2">No cards due right now. Come back later!</p>
            </FadeItem>
            <FadeItem delay={0.4} className="flex gap-3 justify-center">
              <Link href={`/decks/${id}`} className="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 font-semibold py-3 px-6 rounded-xl transition-colors">
                View Deck
              </Link>
              <Link href="/" className="bg-amber-400 hover:bg-amber-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors">
                Home
              </Link>
            </FadeItem>
          </div>
        </main>
      );
    }

    return (
      <main className="min-h-screen bg-stone-50 dark:bg-stone-900 flex flex-col items-center justify-center px-6 py-12">
        <div className="max-w-md w-full space-y-5">

          {/* Session Complete header */}
          <FadeItem delay={0} className="text-center">
            <div className="text-5xl mb-3">{accuracy >= 80 ? "🏆" : accuracy >= 60 ? "👍" : "💪"}</div>
            <h2 className="text-2xl font-bold text-stone-800 dark:text-stone-100">Session Complete ✓</h2>
          </FadeItem>

          {/* Cards reviewed */}
          <FadeItem delay={0.4} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <span className="text-stone-500 dark:text-stone-400 text-sm">Cards reviewed</span>
              <span className="text-2xl font-bold text-stone-800 dark:text-stone-100">{sessionStats.reviewed}</span>
            </div>
          </FadeItem>

          {/* Accuracy */}
          <FadeItem delay={0.8} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-stone-500 dark:text-stone-400 text-sm">Accuracy</span>
              <span className={`text-2xl font-bold ${accuracy >= 70 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                {accuracy}%
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Forgot", value: sessionStats.again, color: "text-red-500" },
                { label: "Hard",   value: sessionStats.hard,  color: "text-amber-500" },
                { label: "Good",   value: sessionStats.good,  color: "text-green-500" },
                { label: "Easy",   value: sessionStats.easy,  color: "text-blue-500" },
              ].map((s) => (
                <div key={s.label} className="text-center">
                  <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-xs text-stone-400 dark:text-stone-500">{s.label}</div>
                </div>
              ))}
            </div>
          </FadeItem>

          {chattedCardCount > 0 && (
            <FadeItem delay={1.0} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-stone-700 dark:text-stone-100">
                    Chatted with {chattedCardCount} card{chattedCardCount !== 1 ? "s" : ""}
                  </p>
                  <p className="text-xs text-stone-400 dark:text-stone-500">
                    {chatBoostCardCount > 0
                      ? `Bonus XP applied on ${chatBoostCardCount} rated card${chatBoostCardCount !== 1 ? "s" : ""}`
                      : "Extra tutor support during this session"}
                  </p>
                </div>
                <span className="text-2xl">💬</span>
              </div>
            </FadeItem>
          )}

          {/* Knowledge Power earned */}
          {sessionPower > 0 && (
            <FadeItem delay={chattedCardCount > 0 ? 1.4 : 1.2} className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800 px-6 py-4">
              <div className="flex items-center justify-between">
                <span className="text-amber-700 dark:text-amber-400 text-sm font-medium">⚡ Knowledge Power earned</span>
                <span className="text-2xl font-bold text-amber-600 dark:text-amber-300">
                  +<CountingNumber target={sessionPower} duration={1} />
                </span>
              </div>
            </FadeItem>
          )}

          {/* Streak */}
          {postStats && postStats.streakDays > 0 && (
            <FadeItem delay={chattedCardCount > 0 ? 1.8 : 1.6} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 px-6 py-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="font-semibold text-stone-800 dark:text-stone-100">
                    {postStats.streakDays} day streak
                  </p>
                  <p className="text-xs text-stone-400 dark:text-stone-500">Keep it going — review tomorrow</p>
                </div>
              </div>
            </FadeItem>
          )}

          {/* Level-ups */}
          {levelUps.length > 0 && (
            <FadeItem delay={chattedCardCount > 0 ? 2.2 : 2.0} className="bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 px-6 py-4">
              <p className="text-sm font-semibold text-stone-700 dark:text-stone-200 mb-3">
                {levelUps.length} card{levelUps.length !== 1 ? "s" : ""} leveled up ↑
              </p>
              <div className="space-y-2">
                {levelUps.slice(0, 5).map((lu, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="text-stone-500 dark:text-stone-400 truncate flex-1 min-w-0">
                      &ldquo;{lu.front.length > 42 ? lu.front.slice(0, 42) + "…" : lu.front}&rdquo;
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-semibold ${LEVEL_COLOR[lu.newLevel] ?? "text-stone-400"}`}>
                        → {lu.newLabel}
                      </span>
                      {lu.chatBoosted && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                          Chat Bonus
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {levelUps.length > 5 && (
                  <p className="text-xs text-stone-400 dark:text-stone-500">+{levelUps.length - 5} more</p>
                )}
              </div>
            </FadeItem>
          )}

          {/* Next review */}
          {nextReviewLabel && (
            <FadeItem delay={levelUps.length > 0 ? (chattedCardCount > 0 ? 2.6 : 2.4) : (chattedCardCount > 0 ? 2.2 : 2.0)} className="text-center">
              <p className="text-sm text-stone-500 dark:text-stone-400 font-medium">{nextReviewLabel}</p>
            </FadeItem>
          )}

          {/* Actions */}
          <FadeItem delay={levelUps.length > 0 ? (chattedCardCount > 0 ? 3.0 : 2.8) : (chattedCardCount > 0 ? 2.6 : 2.4)} className="flex gap-3 justify-center pt-2">
            <Link
              href={`/decks/${id}`}
              className="bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              Back to Deck
            </Link>
            <Link
              href="/"
              className="bg-amber-400 hover:bg-amber-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
            >
              All Decks
            </Link>
          </FadeItem>
        </div>
      </main>
    );
  }

  // ── Practice session ───────────────────────────────────────────────────────
  const currentCard = cards[currentIndex];
  const progressPct = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;
  const ambientGradient = FOCUS_AMBIENT[colorTheme] ?? FOCUS_AMBIENT.slate;
  const stripeColor = FOCUS_STRIPE[colorTheme] ?? "bg-amber-400";

  return (
    <main
      className="min-h-screen transition-colors duration-700"
      style={
        focusMode
          ? { background: ambientGradient, backgroundSize: "400% 400%", animation: "ambientShift 30s ease infinite" }
          : undefined
      }
    >
      {/* Focus mode: minimal progress line at very top */}
      {focusMode && (
        <div className="fixed top-0 left-0 right-0 h-[2px] bg-white/10 z-40">
          <div
            className={`h-full ${stripeColor} transition-all duration-500`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}

      {/* Header — fades out in focus mode */}
      <AnimatePresence>
        {!focusMode && (
          <motion.header
            key="header"
            initial={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="bg-white dark:bg-stone-800 border-b border-stone-200 dark:border-stone-700"
          >
            <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
              <Link
                href={`/decks/${id}`}
                className="text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
              >
                ← Exit
              </Link>
              <span className="text-stone-300 dark:text-stone-600">|</span>
              <span className="text-sm text-stone-500 dark:text-stone-400 truncate">
                {deckTitle || (sessionType === "new" ? "New Cards" : "Review Session")}
              </span>
              <div className="ml-auto flex items-center gap-3 shrink-0">
                <span className="text-sm text-stone-400 dark:text-stone-500">
                  {sessionStats.reviewed} reviewed
                </span>
                <button
                  onClick={toggleFocus}
                  className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-700 dark:hover:text-stone-200 transition-colors px-2 py-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700"
                  title="Enter focus mode"
                >
                  Focus
                </button>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      {/* Focus mode exit button — subtle, top-right */}
      {focusMode && (
        <button
          onClick={toggleFocus}
          className="fixed top-4 right-4 z-40 text-xs text-white/40 hover:text-white/80 transition-colors px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10"
        >
          Exit Focus
        </button>
      )}

      {/* Card area */}
      <div className={`max-w-2xl mx-auto px-4 sm:px-6 ${focusMode ? "py-16 sm:py-20" : "py-8 sm:py-12"}`}>
        {currentCard && (
          <FlashCard
            key={`${currentCard.id}-${currentIndex}`}
            cardId={currentCard.id}
            front={currentCard.front}
            back={currentCard.back}
            type={currentCard.type}
            cardFormat={currentCard.cardFormat}
            options={currentCard.options}
            onRate={handleRate}
            chatMessageCount={activeChatCounts[currentCard.id] ?? 0}
            onChatMessageCountChange={(count) => handleChatMessageCountChange(currentCard.id, count)}
            onReveal={handleCardReveal}
            showChatHint={showChatHint}
            onDismissChatHint={dismissChatHint}
            cardNumber={currentIndex + 1}
            totalCards={cards.length}
            easeFactor={currentCard.easeFactor}
            interval={currentCard.interval}
            repetitions={currentCard.repetitions}
            difficulty={currentCard.difficulty}
            colorTheme={colorTheme}
            focusMode={focusMode}
          />
        )}
      </div>

      {/* Focus timer — bottom-right when in focus mode */}
      {focusMode && (
        <div className="fixed bottom-6 right-6 z-40 text-xs text-white/40 font-mono tabular-nums">
          {formatTime(focusSecs)}
        </div>
      )}

      {/* Focus exit message — brief flash */}
      <AnimatePresence>
        {focusExitMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-stone-800 dark:bg-stone-700 text-white text-sm font-medium px-5 py-2.5 rounded-full shadow-lg"
          >
            {focusExitMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level-up toast */}
      <AnimatePresence>
        {activeToast && (
          <LevelUpToast
            key={activeToast.toastId}
            front={activeToast.front}
            previousLabel={activeToast.previousLabel}
            currentLabel={activeToast.currentLabel}
            currentLevel={activeToast.currentLevel}
            chatBoosted={activeToast.chatBoosted}
            onDismiss={() => setActiveToast(null)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
