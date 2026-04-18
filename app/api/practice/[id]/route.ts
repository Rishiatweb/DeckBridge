// GET /api/practice/[id] — Get due cards for practice session
// Returns cards where nextReviewDate <= now, shuffled, max 20

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "20");

    // Fetch deck for colorTheme alongside cards
    const [deck, dueCards] = await Promise.all([
      prisma.deck.findUnique({ where: { id }, select: { colorTheme: true } }),
      prisma.card.findMany({
        where: { deckId: id, nextReviewDate: { lte: new Date() } },
        orderBy: { nextReviewDate: "asc" },
        take: limit,
      }),
    ]);
    const colorTheme = deck?.colorTheme ?? "slate";

    // If no due cards, return new unseen cards
    if (dueCards.length === 0) {
      const newCards = await prisma.card.findMany({
        where: { deckId: id, repetitions: 0 },
        take: limit,
      });

      return NextResponse.json({
        cards: newCards,
        sessionType: newCards.length > 0 ? "new" : "none",
        colorTheme,
      });
    }

    return NextResponse.json({
      cards: dueCards,
      sessionType: "review",
      colorTheme,
    });
  } catch (err) {
    console.error("[practice] error:", err);
    return NextResponse.json({ error: "Failed to fetch practice cards" }, { status: 500 });
  }
}
