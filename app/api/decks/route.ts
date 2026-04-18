// GET /api/decks — List all decks with mastery stats and last-practiced date

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCardLevel } from "@/lib/gamification";

export const runtime = "nodejs";

export async function GET() {
  try {
    const now = new Date();

    const decks = await prisma.deck.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        cards: {
          select: {
            interval: true,
            repetitions: true,
            nextReviewDate: true,
            reviewLogs: {
              select: { reviewedAt: true },
              orderBy: { reviewedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    return NextResponse.json(
      decks.map((d) => {
        const mastered = d.cards.filter((c) => c.interval >= 21).length;
        const newCards = d.cards.filter((c) => c.repetitions === 0).length;
        const learning = d.cards.length - mastered - newCards;
        const due = d.cards.filter((c) => new Date(c.nextReviewDate) <= now).length;

        // Most recent review across all cards in this deck
        const lastPracticed =
          d.cards
            .flatMap((c) => c.reviewLogs.map((r) => r.reviewedAt))
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

        // Rarity breakdown
        const rarityBreakdown = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
        for (const c of d.cards) {
          const lvl = getCardLevel(c.repetitions, c.interval);
          const key = lvl.label.toLowerCase() as keyof typeof rarityBreakdown;
          rarityBreakdown[key]++;
        }

        return {
          id: d.id,
          title: d.title,
          description: d.description,
          colorTheme: d.colorTheme,
          sourceFileName: d.sourceFileName,
          createdAt: d.createdAt,
          cardCount: d.cards.length,
          mastered,
          learning,
          newCards,
          due,
          lastPracticed,
          rarityBreakdown,
        };
      })
    );
  } catch (err) {
    console.error("[decks] error:", err);
    return NextResponse.json({ error: "Failed to fetch decks" }, { status: 500 });
  }
}
