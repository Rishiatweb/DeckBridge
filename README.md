# DeckForge

Upload a PDF. Get a smart flashcard deck. Master it with spaced repetition.

Built for the Cuemath AI Builder Challenge (April 15–18, 2026).

---

## What It Does

1. Drop a PDF (textbook chapter, lecture notes, anything)
2. AI reads it and generates a comprehensive flashcard deck — concepts, definitions, relationships, worked examples, edge cases
3. Practice with card flip + SM-2 spaced repetition (keyboard shortcuts: Space to flip, 1/2/3/4 to rate)
4. Track mastery: see what you've mastered, what's shaky, what's due — with streak tracking

The differentiator is **ingestion quality**: cards feel teacher-written, not bot-scraped.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js (App Router) + Tailwind CSS |
| PDF extraction | `pdf-parse` |
| LLM | Multi-provider fallback: Groq → Together AI → OpenRouter → Ollama → HuggingFace |
| Database | SQLite via Prisma |
| Spaced repetition | SM-2 algorithm (TypeScript, modified) |
| Deployment | Vercel |

---

## Card Generation Pipeline

```
PDF upload
  → text extraction (pdf-parse)
  → chunking (~3000 token chunks, sentence-boundary aware)
  → parallel batch generation (2 chunks at a time)
     → per chunk: 15–20 cards, 5 types enforced
  → synthesis pass (cross-chunk relationships + big-picture gaps)
  → fuzzy deduplication (stop-word normalised)
  → deck stored in SQLite
```

### Card Types

- **concept** — deep "what/why/how" questions on key ideas
- **definition** — precise definitions with distinguishing details
- **relationship** — "How does X relate to Y?", contrasts, cause-and-effect
- **application** — worked examples, step-by-step reasoning
- **edge_case** — failure modes, misconceptions, gotchas

### Generation Quality

Cards are generated with a Feynman-style teaching persona:
- Tests understanding, not memorisation of phrasing
- Shows full reasoning in worked examples (not just the answer)
- Surfaces the tricky edge cases students always get wrong
- Rejects shallow cards explicitly (bad example in prompt = taste signal for the model)

### Multi-Provider LLM Fallback

No single API dependency. Providers tried in order, with 429 retry (sleep + retry same provider if wait ≤ 8s):

| # | Provider | Card model | Meta model |
|---|---|---|---|
| 1 | Groq | llama-3.3-70b-versatile | llama-3.1-8b-instant |
| 2 | Together AI | Meta-Llama-3.1-70B-Instruct-Turbo | Meta-Llama-3.1-8B-Instruct-Turbo |
| 3 | OpenRouter | openai/gpt-oss-120b:**free** | google/gemma-4-26b-a4b-it:**free** |
| 4 | Ollama | configurable (default: llama3.2) | configurable |
| 5 | HuggingFace | Meta-Llama-3.1-70B-Instruct | Meta-Llama-3.1-8B-Instruct |

OpenRouter uses free-tier models — no credits needed. Nemotron-70B is best-in-class for structured JSON among free models.

---

## Spaced Repetition (SM-2, modified)

Each card tracks `easeFactor`, `interval`, `repetitions`, `nextReviewDate`.

| Rating | Key | SM-2 effect |
|---|---|---|
| Again | `1` | Full reset: interval=1, repetitions=0 |
| Hard | `2` | Penalise only: interval × 0.5 (min 1), easeFactor − 0.15. Progress preserved. |
| Good | `3` | Standard advance: 1 → 6 → interval × EF |
| Easy | `4` | Standard advance + 1.3× bonus |

Key deviation from standard SM-2: **Hard does not reset** — "I struggled but recalled it" ≠ "I forgot it". Matches Anki's behaviour.

Session behaviour:
- "Again" cards re-queue to end of session (max 2× per card) for immediate re-practice
- Keyboard: `Space`/`Enter` = flip, `1`/`2`/`3`/`4` = rate
- Rating buttons show next-review preview: "tomorrow", "3 days", "2 weeks"

---

## Deck Management

### Browse & search
- Search bar filters decks by title or source filename (client-side, instant)
- 4-way sort: **Due first** (default) · **Newest** · **Last practiced** · **A–Z**
- Deck count updates when filtered: "3 of 7 decks"

### Pick up where you left off
- Default sort puts the most urgent deck (highest due count) top-left
- Global amber banner when cards are due: shows total due count + direct "Continue" button to the most urgent deck

### Per-card metadata
- "studied today" / "studied 2d ago" / "added Mar 5" on each deck card — `lastPracticed` from ReviewLog

---

## Mastery & Progress

### Mastery buckets
- **New** — never reviewed (`repetitions === 0`)
- **Learning** — reviewed, interval < 21 days
- **Mastered** — interval ≥ 21 days (fading into long-term memory)

### What's shown
- **Home page**: segmented mastery bar per deck card (green=mastered, amber=learning), due badge, practice button highlights when cards are due
- **Deck page**: headline % mastered, full segmented bar, 🔥 streak badge, ⏰ due-now count, next-24h preview, per-card status indicators
- **Session complete**: updated streak, remaining due count, next-due-in-24h

---

## Setup

```bash
cd deckforge
npm install
cp .env.example .env.local
# Add at least one provider API key (GROQ_API_KEY is free and fast)
npx prisma generate
npx prisma db push
npm run dev
```

### Environment Variables

```env
# At least one required:
GROQ_API_KEY=
TOGETHER_API_KEY=
OPENROUTER_API_KEY=
HF_TOKEN=

# Optional (local Ollama):
OLLAMA_ENABLED=true
OLLAMA_CARD_MODEL=llama3.2
OLLAMA_META_MODEL=llama3.2

DATABASE_URL="file:./dev.db"
```

---

## Project Structure

```
deckforge/
├── app/
│   ├── page.tsx                    # Homepage — upload zone + deck list with mastery bars
│   ├── decks/[id]/page.tsx         # Deck view — mastery dashboard + card list
│   ├── practice/[id]/page.tsx      # Practice — flip, rate, re-queue, session stats
│   └── api/
│       ├── upload/route.ts         # PDF upload + extraction + chunking
│       ├── generate/route.ts       # Card generation orchestration
│       ├── decks/route.ts          # List decks (with inline mastery stats)
│       ├── decks/[id]/route.ts     # Get / delete deck
│       ├── decks/[id]/stats/       # Mastery stats + streak + dueIn24h
│       ├── cards/[id]/review/      # SM-2 review update + ReviewLog
│       └── practice/[id]/          # Due cards for practice session
├── components/
│   ├── UploadZone.tsx              # Drag-and-drop PDF upload
│   ├── DeckCard.tsx                # Home page card: mastery bar + due badge
│   └── FlashCard.tsx               # Flip animation + keyboard shortcuts + interval previews
├── lib/
│   ├── claude.ts                   # Multi-provider LLM wrapper, prompts, 429 retry
│   ├── chunker.ts                  # Sentence-boundary-aware text chunking
│   ├── sm2.ts                      # SM-2 algorithm + getNextReviewLabel
│   └── db.ts                       # Prisma client
└── prisma/
    └── schema.prisma               # Deck / Card / ReviewLog models
```

---

## Deployment

Connect GitHub repo to Vercel. Add at least one provider key as an environment variable. Deploy.

For persistent storage across Vercel deploys, use Supabase (Postgres) or PlanetScale instead of SQLite — update `DATABASE_URL` and Prisma provider accordingly.

API keys are server-side only — never in client bundles.
