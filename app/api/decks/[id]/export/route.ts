// GET /api/decks/[id]/export — Download deck as JSON file

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const deck = await prisma.deck.findUnique({
      where: { id },
      include: { cards: { orderBy: { createdAt: "asc" } } },
    });

    if (!deck) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }

    const exportData = {
      title: deck.title,
      description: deck.description,
      sourceFileName: deck.sourceFileName,
      exportedAt: new Date().toISOString(),
      cards: deck.cards.map((c) => ({
        front: c.front,
        back: c.back,
        type: c.type,
        cardFormat: c.cardFormat,
        options: c.options !== "[]" ? JSON.parse(c.options) : undefined,
      })),
    };

    const fileName = `${deck.title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("[deck/export] error:", err);
    return NextResponse.json({ error: "Failed to export deck" }, { status: 500 });
  }
}
