"use client";

import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";

interface LevelUpToastProps {
  front: string;
  previousLabel: string;
  currentLabel: string;
  currentLevel: number;
  chatBoosted?: boolean;
  onDismiss: () => void;
}

const RARITY_COLOR: Record<number, string> = {
  1: "text-amber-500",
  2: "text-slate-400 dark:text-slate-300",
  3: "text-indigo-500",
  4: "text-pink-500",
};

// Confetti color palettes per new rarity level
const CONFETTI_PALETTES: Record<number, string[]> = {
  1: ["bg-amber-400", "bg-amber-300", "bg-yellow-300", "bg-amber-500"],
  2: ["bg-slate-400", "bg-slate-300", "bg-gray-300", "bg-slate-500"],
  3: ["bg-indigo-400", "bg-indigo-300", "bg-violet-400", "bg-indigo-500"],
  // Legendary: holographic mix
  4: ["bg-pink-400", "bg-teal-400", "bg-amber-400", "bg-violet-400", "bg-pink-300", "bg-teal-300", "bg-yellow-300"],
};

interface Particle {
  id: number;
  x: number;
  y: number;
  rotate: number;
  delay: number;
  color: string;
  round: boolean;
}

function generateParticles(level: number): Particle[] {
  const count = level === 4 ? 20 : 14;
  const palette = CONFETTI_PALETTES[level] ?? CONFETTI_PALETTES[1];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const radius = 38 + Math.random() * 55;
    return {
      id: i,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius - 25, // bias upward
      rotate: Math.random() * 360,
      delay: Math.random() * 0.2,
      color: palette[i % palette.length],
      round: Math.random() > 0.45,
    };
  });
}

export default function LevelUpToast({
  front,
  previousLabel,
  currentLabel,
  currentLevel,
  chatBoosted = false,
  onDismiss,
}: LevelUpToastProps) {
  // Auto-dismiss after 2s — runs once on mount (component remounts via key)
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(), 2000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  useEffect(() => {
    const handleKeydown = () => onDismiss();
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [onDismiss]);

  const particles = useMemo(() => generateParticles(currentLevel), [currentLevel]);
  const rarityColor = RARITY_COLOR[currentLevel] ?? "text-stone-400";
  const truncated = front.length > 42 ? front.slice(0, 42) + "…" : front;

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 cursor-pointer select-none"
      onClick={onDismiss}
      title="Click to dismiss"
    >
      {/* Confetti + card wrapper — relative so particles burst from card center */}
      <div className="relative flex items-center justify-center">

        {/* Confetti particles */}
        {particles.map((p) => (
          <motion.span
            key={p.id}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.3, rotate: p.rotate }}
            transition={{ duration: 0.75, ease: "easeOut", delay: p.delay }}
            className={`absolute w-2 h-2 ${p.color} ${p.round ? "rounded-full" : "rounded-sm"} pointer-events-none`}
          />
        ))}

        {/* Toast card */}
        <div className="relative bg-white dark:bg-stone-800 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-700 px-5 py-4 w-72">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">⬆️</span>
            <span className="font-bold text-stone-800 dark:text-stone-100 text-sm">Card Leveled Up!</span>
          </div>

          {/* Card front (truncated) */}
          <p className="text-xs text-stone-500 dark:text-stone-400 mb-3 leading-snug line-clamp-2">
            &ldquo;{truncated}&rdquo;
          </p>

          {/* Rarity transition */}
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-stone-400 dark:text-stone-500">{previousLabel}</span>
            <span className="text-stone-300 dark:text-stone-600">→</span>
            <span className={rarityColor}>{currentLabel}</span>
            {chatBoosted && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300">
                Chat Bonus
              </span>
            )}
          </div>

          {/* Dismiss hint */}
          <p className="text-xs text-stone-300 dark:text-stone-600 mt-2 text-right">tap to dismiss</p>
        </div>
      </div>
    </motion.div>
  );
}
