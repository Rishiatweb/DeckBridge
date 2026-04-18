// GET /api/decks/[id]/stats — Mastery stats for a deck, including streak

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isDue } from "@/lib/sm2";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const [cards, reviewLogs] = await Promise.all([
      prisma.card.findMany({
        where: { deckId: id },
        select: { interval: true, repetitions: true, nextReviewDate: true },
      }),
      prisma.reviewLog.findMany({
        where: { card: { deckId: id } },
        select: { reviewedAt: true },
        orderBy: { reviewedAt: "desc" },
      }),
    ]);

    if (cards.length === 0) {
      return NextResponse.json({ error: "Deck not found or empty" }, { status: 404 });
    }

    // Mastery buckets
    const stats = cards.reduce(
      (acc, card) => {
        if (card.repetitions === 0) {
          acc.new += 1;
        } else if (card.interval >= 21) {
          acc.mastered += 1;
        } else {
          acc.learning += 1;
        }
        if (isDue(card.nextReviewDate)) acc.due += 1;
        return acc;
      },
      { new: 0, learning: 0, mastered: 0, due: 0 }
    );

    // Streak — consecutive days with at least one review, ending today
    const uniqueDays = new Set(
      reviewLogs.map((l) => new Date(l.reviewedAt).toISOString().split("T")[0])
    );
    let streakDays = 0;
    const today = new Date();
    for (let offset = 0; offset < 365; offset++) {
      const d = new Date(today);
      d.setDate(d.getDate() - offset);
      const dateStr = d.toISOString().split("T")[0];
      if (uniqueDays.has(dateStr)) {
        streakDays++;
      } else {
        break;
      }
    }

    // Next review: how many cards become due within the next 24 hours
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dueIn24h = await prisma.card.count({
      where: {
        deckId: id,
        nextReviewDate: { gt: new Date(), lte: in24h },
      },
    });

    return NextResponse.json({
      total: cards.length,
      ...stats,
      streakDays,
      dueIn24h,
    });
  } catch (err) {
    console.error("[stats] error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
