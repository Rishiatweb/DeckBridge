// GET /api/stats — Global collection power breakdown across all decks
// Returns: totalScore, breakdown by rarity, streakBonus flag

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateCollectionPower } from "@/lib/gamification";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Fetch all cards with SM-2 state and review logs
    const cards = await prisma.card.findMany({
      select: {
        repetitions: true,
        interval: true,
        reviewLogs: {
          select: { reviewedAt: true },
          orderBy: { reviewedAt: "desc" },
          take: 1,
        },
      },
    });

    // Compute streak from all review logs across all cards
    const allLogs = await prisma.reviewLog.findMany({
      select: { reviewedAt: true },
      orderBy: { reviewedAt: "desc" },
    });

    const reviewDates = new Set(
      allLogs.map((l) => l.reviewedAt.toISOString().split("T")[0])
    );

    // Count consecutive days ending today
    let streakDays = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().split("T")[0];
      if (reviewDates.has(iso)) {
        streakDays++;
      } else {
        break;
      }
    }

    const power = calculateCollectionPower(
      cards.map((c) => ({ repetitions: c.repetitions, interval: c.interval })),
      streakDays
    );

    return NextResponse.json({
      ...power,
      streakDays,
      totalCards: cards.length,
    });
  } catch (err) {
    console.error("[stats] error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
