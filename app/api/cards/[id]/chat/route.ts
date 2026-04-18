import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatWithCard, TutorMessage } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 30;

interface ChatBody {
  cardId?: string;
  messages?: TutorMessage[];
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as ChatBody;

    if (body.cardId && body.cardId !== id) {
      return NextResponse.json({ error: "Card id mismatch" }, { status: 400 });
    }

    const messages = Array.isArray(body.messages)
      ? body.messages.filter(
          (message): message is TutorMessage =>
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            message.content.trim().length > 0
        )
      : [];

    if (messages.length === 0) {
      return NextResponse.json({ error: "At least one message is required" }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "user") {
      return NextResponse.json({ error: "Last chat message must come from the user" }, { status: 400 });
    }

    const card = await prisma.card.findUnique({
      where: { id },
      select: { front: true, back: true },
    });

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const reply = await chatWithCard(card, messages);

    await prisma.card.update({
      where: { id },
      data: {
        chatMessageCount: { increment: 2 },
      },
    });

    return NextResponse.json({
      reply,
      messageCount: messages.length + 1,
    });
  } catch (err) {
    console.error("[card-chat] error:", err);
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("429") ? 503 : 500;
    const error =
      status === 503
        ? "OpenRouter is busy right now. Try again in a moment."
        : "Hmm, I couldn't connect. Try again?";
    return NextResponse.json({ error }, { status });
  }
}
