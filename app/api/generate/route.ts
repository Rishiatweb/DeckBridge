// POST /api/generate — Generate flashcards from text chunks, stream progress via SSE
// Body: { chunks: string[], fileName: string }
// Response: text/event-stream — events: batch_done, synthesis_done, meta_done, complete, error

import { NextRequest } from "next/server";
import { generateCardsFromChunk, generateSynthesisCards, generateDeckMeta, deduplicateCards, GeneratedCard } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { getUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 55;

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { chunks, fileName } = body as { chunks: string[]; fileName: string };

  if (!chunks || !Array.isArray(chunks) || chunks.length === 0) {
    return new Response(JSON.stringify({ error: "No text chunks provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!fileName) {
    return new Response(JSON.stringify({ error: "fileName required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(enc.encode(sseEvent(data)));
      };

      try {
        // Cap chunks — large PDFs: first + middle + last
        const MAX_CHUNKS = 25;
        const chunksToProcess =
          chunks.length <= MAX_CHUNKS
            ? chunks
            : [
                ...chunks.slice(0, 10),
                ...chunks.slice(
                  Math.floor(chunks.length / 2) - 3,
                  Math.floor(chunks.length / 2) + 3
                ),
                ...chunks.slice(-6),
              ].slice(0, MAX_CHUNKS);

        const totalBatches = Math.ceil(chunksToProcess.length / 2);
        const BATCH_SIZE = 2;
        const allCards: GeneratedCard[] = [];

        send({ type: "start", totalBatches, totalChunks: chunksToProcess.length });

        for (let i = 0; i < chunksToProcess.length; i += BATCH_SIZE) {
          const batchIndex = Math.floor(i / BATCH_SIZE) + 1;
          const batch = chunksToProcess.slice(i, i + BATCH_SIZE);
          console.log(`[generate] batch ${batchIndex}/${totalBatches}: chunks ${i + 1}-${Math.min(i + BATCH_SIZE, chunksToProcess.length)}`);

          const batchResults = await Promise.all(batch.map(generateCardsFromChunk));
          for (const cards of batchResults) allCards.push(...cards);

          send({
            type: "batch_done",
            batch: batchIndex,
            totalBatches,
            newCards: batchResults.reduce((s, c) => s + c.length, 0),
            totalCards: allCards.length,
          });
        }

        if (allCards.length === 0) {
          send({ type: "error", message: "No cards generated — PDF may have no extractable text" });
          controller.close();
          return;
        }

        // Synthesis pass
        if (chunksToProcess.length > 1) {
          send({ type: "synthesis_start" });
          const synthesisCards = await generateSynthesisCards(allCards);
          allCards.push(...synthesisCards);
          send({ type: "synthesis_done", added: synthesisCards.length, totalCards: allCards.length });
        }

        // Dedup
        const uniqueCards = deduplicateCards(allCards);

        // Meta
        send({ type: "meta_start" });
        const meta = await generateDeckMeta(uniqueCards);
        send({ type: "meta_done", title: meta.title });

        // Store
        const deck = await prisma.deck.create({
          data: {
            userId: user.id,
            title: meta.title,
            description: meta.description,
            colorTheme: meta.colorTheme ?? "slate",
            sourceFileName: fileName,
            cards: {
              create: uniqueCards.map((card) => ({
                front: card.front,
                back: card.back,
                type: card.type,
                cardFormat: card.cardFormat ?? "basic",
                options: JSON.stringify(card.options ?? []),
                difficulty: card.difficulty ?? 1,
              })),
            },
          },
          include: { cards: { select: { id: true } } },
        });

        send({
          type: "complete",
          deckId: deck.id,
          title: deck.title,
          description: deck.description,
          cardCount: deck.cards.length,
        });
      } catch (err) {
        console.error("[generate] error:", err);
        send({
          type: "error",
          message: err instanceof Error ? err.message : "Generation failed",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
