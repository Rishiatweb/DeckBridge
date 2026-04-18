// GET /api/decks/[id] — Get deck with all cards
// DELETE /api/decks/[id] — Delete deck and all cards

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

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

    return NextResponse.json(deck);
  } catch (err) {
    console.error("[deck/get] error:", err);
    return NextResponse.json({ error: "Failed to fetch deck" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.deck.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[deck/delete] error:", err);
    return NextResponse.json({ error: "Failed to delete deck" }, { status: 500 });
  }
}
