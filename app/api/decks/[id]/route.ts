// GET /api/decks/[id] — Get deck with all cards
// DELETE /api/decks/[id] — Delete deck and all cards

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const deck = await prisma.deck.findUnique({
      where: { id },
      include: { cards: { orderBy: { createdAt: "asc" } } },
    });

    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    if (deck.userId && deck.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(deck);
  } catch (err) {
    console.error("[deck/get] error:", err);
    return NextResponse.json({ error: "Failed to fetch deck" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const deck = await prisma.deck.findUnique({ where: { id }, select: { userId: true } });
    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    if (deck.userId && deck.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.deck.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[deck/delete] error:", err);
    return NextResponse.json({ error: "Failed to delete deck" }, { status: 500 });
  }
}
