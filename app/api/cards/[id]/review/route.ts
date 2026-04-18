// PUT /api/cards/[id]/review — Update card after review with SM-2
// Body: { rating: "again" | "hard" | "good" | "easy", chatMessageCount?: number }
// Returns: updated card, levelChange (if rarity changed), pointsEarned, streakMultiplier, chat boost info

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateNextReview, ratingToQuality } from "@/lib/sm2";
import { getCardLevel, getChatBonus, pointsEarnedForReview } from "@/lib/gamification";

export const runtime = "nodejs";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { rating, chatMessageCount = 0 } = body as {
      rating: "again" | "hard" | "good" | "easy";
      chatMessageCount?: number;
    };

    if (!["again", "hard", "good", "easy"].includes(rating)) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }

    const card = await prisma.card.findUnique({ where: { id } });
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    const baseQuality = ratingToQuality(rating);
    const chatBonus = getChatBonus(Math.max(0, Math.floor(chatMessageCount)));
    const qualityScale = [1, 2, 4, 5] as const;
    const baseQualityIndex = qualityScale.indexOf(baseQuality as (typeof qualityScale)[number]);
    const boostedQualityIndex =
      baseQualityIndex >= 0
        ? Math.min(qualityScale.length - 1, baseQualityIndex + chatBonus)
        : qualityScale.length - 1;
    const quality = qualityScale[boostedQualityIndex];
    const chatBoosted = quality !== baseQuality;

    // Capture previous level before update
    const prevLevel = getCardLevel(card.repetitions, card.interval);

    const result = calculateNextReview(
      {
        easeFactor: card.easeFactor,
        interval: card.interval,
        repetitions: card.repetitions,
        nextReviewDate: card.nextReviewDate,
      },
      quality
    );

    const [updatedCard] = await prisma.$transaction([
      prisma.card.update({
        where: { id },
        data: {
          easeFactor: result.easeFactor,
          interval: result.interval,
          repetitions: result.repetitions,
          nextReviewDate: result.nextReviewDate,
        },
      }),
      prisma.reviewLog.create({
        data: { cardId: id, quality },
      }),
    ]);

    // Compute new level + points
    const newLevel = getCardLevel(result.repetitions, result.interval);

    // Streak: count consecutive days from review logs
    const allLogs = await prisma.reviewLog.findMany({
      select: { reviewedAt: true },
      orderBy: { reviewedAt: "desc" },
    });
    const reviewDates = new Set(allLogs.map((l) => l.reviewedAt.toISOString().split("T")[0]));
    let streakDays = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (reviewDates.has(d.toISOString().split("T")[0])) streakDays++;
      else break;
    }

    const { pointsEarned, streakMultiplier } = pointsEarnedForReview(
      card.repetitions,
      card.interval,
      result.repetitions,
      result.interval,
      streakDays
    );

    const levelChange =
      newLevel.level !== prevLevel.level
        ? {
            previous: prevLevel.level,
            current: newLevel.level,
            previousLabel: prevLevel.label,
            currentLabel: newLevel.label,
            chatBoosted,
          }
        : null;

    return NextResponse.json({
      card: updatedCard,
      nextReviewDate: result.nextReviewDate,
      interval: result.interval,
      repetitions: result.repetitions,
      levelChange,
      pointsEarned,
      streakMultiplier,
      chatBoosted,
      chatBonus,
    });
  } catch (err) {
    console.error("[review] error:", err);
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
  }
}
