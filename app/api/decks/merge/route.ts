// POST /api/decks/merge — Merge multiple decks into a new one
// Body: { deckIds: string[], title?: string }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { deckIds, title } = (await req.json()) as { deckIds: string[]; title?: string };

    if (!deckIds || deckIds.length < 2) {
      return NextResponse.json({ error: "Provide at least 2 deck IDs to merge" }, { status: 400 });
    }

    // Fetch all source decks with cards
    const decks = await prisma.deck.findMany({
      where: { id: { in: deckIds } },
      include: { cards: { orderBy: { createdAt: "asc" } } },
    });

    if (decks.length < 2) {
      return NextResponse.json({ error: "One or more decks not found" }, { status: 404 });
    }

    const mergedTitle = title ?? decks.map((d) => d.title).join(" + ");
    const allCards = decks.flatMap((d) => d.cards);

    // Create merged deck — reset SM-2 state (fresh start for merged deck)
    const merged = await prisma.deck.create({
      data: {
        title: mergedTitle,
        description: `Merged from: ${decks.map((d) => d.title).join(", ")}`,
        sourceFileName: decks.map((d) => d.sourceFileName).join(", "),
        cards: {
          create: allCards.map((c) => ({
            front: c.front,
            back: c.back,
            type: c.type,
            cardFormat: c.cardFormat,
            options: c.options,
            // Preserve SM-2 state from original cards
            easeFactor: c.easeFactor,
            interval: c.interval,
            repetitions: c.repetitions,
            nextReviewDate: c.nextReviewDate,
          })),
        },
      },
      include: { cards: { select: { id: true } } },
    });

    return NextResponse.json({
      deckId: merged.id,
      title: merged.title,
      cardCount: merged.cards.length,
    });
  } catch (err) {
    console.error("[merge] error:", err);
    return NextResponse.json({ error: "Failed to merge decks" }, { status: 500 });
  }
}
