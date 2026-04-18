// Multi-provider LLM wrapper for flashcard generation
// Fallback chain: Groq → Together AI → OpenRouter → Ollama → HuggingFace
// All calls server-side only — API keys never exposed to client

import OpenAI from "openai";

export interface GeneratedCard {
  front: string;
  back: string;
  type: "concept" | "definition" | "relationship" | "application" | "edge_case";
  cardFormat?: "basic" | "mcq" | "fill_blank";
  options?: string[]; // [correct, wrong1, wrong2, wrong3] — only for MCQ cards
  difficulty?: 1 | 2 | 3;  // 1=recall, 2=understanding, 3=application/synthesis
}

export interface GenerationResult {
  cards: GeneratedCard[];
}

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Provider configs ──────────────────────────────────────────────────────────

interface ProviderConfig {
  name: string;
  baseURL: string;
  apiKey: string | undefined;
  cardModel: string;
  metaModel: string;
  enabled: boolean;
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    apiKey: process.env.GROQ_API_KEY,
    cardModel: "llama-3.3-70b-versatile",
    metaModel: "llama-3.1-8b-instant",
    enabled: !!process.env.GROQ_API_KEY,
  },
  {
    name: "Together AI",
    baseURL: "https://api.together.xyz/v1",
    apiKey: process.env.TOGETHER_API_KEY,
    cardModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    metaModel: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    enabled: !!process.env.TOGETHER_API_KEY,
  },
  {
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY,
    // Free-tier models — no credits needed.
    // openai/gpt-oss-120b:free: 120B GPT-architecture, best structured JSON in free tier.
    // google/gemma-4-26b-a4b-it:free: 26B active params, fast, good for short meta tasks.
    cardModel: "openai/gpt-oss-120b:free",
    metaModel: "google/gemma-4-26b-a4b-it:free",
    enabled: !!process.env.OPENROUTER_API_KEY,
  },
  {
    name: "Ollama",
    baseURL: "http://localhost:11434/v1",
    apiKey: "ollama", // Ollama ignores this but SDK needs a non-empty string
    cardModel: process.env.OLLAMA_CARD_MODEL || "llama3.2",
    metaModel: process.env.OLLAMA_META_MODEL || "llama3.2",
    enabled: process.env.OLLAMA_ENABLED === "true",
  },
  {
    name: "HuggingFace",
    baseURL: "https://api-inference.huggingface.co/v1",
    apiKey: process.env.HF_TOKEN,
    cardModel:
      process.env.HF_CARD_MODEL ||
      "meta-llama/Meta-Llama-3.1-70B-Instruct",
    metaModel:
      process.env.HF_META_MODEL ||
      "meta-llama/Meta-Llama-3.1-8B-Instruct",
    enabled: !!process.env.HF_TOKEN,
  },
];

function getEnabledProviders(): ProviderConfig[] {
  return PROVIDERS.filter((p) => p.enabled);
}

function getOpenRouterProvider(): ProviderConfig {
  const provider = PROVIDERS.find((p) => p.name === "OpenRouter");

  if (!provider || !provider.enabled || !provider.apiKey) {
    throw new Error("OpenRouter chat is not configured. Set OPENROUTER_API_KEY.");
  }

  return provider;
}

function getOpenRouterChatModelChain(defaultModel: string): string[] {
  const configured = process.env.OPENROUTER_CHAT_MODELS
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);

  const envPrimary = process.env.OPENROUTER_CHAT_MODEL?.trim();

  const defaults = [
    envPrimary || defaultModel,
    "openrouter/elephant-alpha",
    "openai/gpt-oss-20b:free",
    "google/gemma-4-26b-a4b-it:free",
    "meta-llama/llama-3.2-3b-instruct:free",
  ];

  return [...(configured ?? defaults)].filter(
    (model, index, models) => model.length > 0 && models.indexOf(model) === index
  );
}

function makeClient(provider: ProviderConfig): OpenAI {
  return new OpenAI({
    apiKey: provider.apiKey!,
    baseURL: provider.baseURL,
    ...(provider.name === "OpenRouter"
      ? {
          defaultHeaders: {
            "HTTP-Referer": "https://deckforge.app",
            "X-Title": "DeckForge",
          },
        }
      : {}),
  });
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const CARD_GENERATION_SYSTEM = `You are a master educator and flashcard designer. Think Richard Feynman meets an Anki expert who has reviewed thousands of student decks.

Your philosophy:
- Test understanding, not memorisation of phrasing
- Prefer "why" and "how" over bare "what" whenever possible
- Worked examples must show full reasoning steps, not just the answer
- Surface the tricky edge cases students always get wrong
- Make both sides self-contained — no "as mentioned above" or "see the text"
- One card = one testable idea. Dense ideas get split.

You are NOT a web scraper producing excerpts. You produce insight.

Bad card (DO NOT make these):
  Front: "What is a transaction?"
  Back: "A transaction is a sequence of operations."

Good card (AIM for these):
  Front: "What property of database transactions prevents a bank transfer from leaving money in limbo if the server crashes mid-transfer?"
  Back: "Atomicity. Either all operations in the transaction commit, or none do. If the server crashes after debiting Account A but before crediting Account B, the entire transaction rolls back — both accounts return to their original state."

Another good card:
  Front: "Why does TCP use a three-way handshake instead of two?"
  Back: "A two-way handshake only confirms the client can send and the server can receive. The third step (client ACKs the server's SYN-ACK) proves the server can also send and the client can receive — confirming the connection is bidirectional before any data flows."`;

const CARD_GENERATION_PROMPT = (chunk: string) => `Generate comprehensive flashcards from the study material below.

REQUIRED card type distribution (minimum counts):
- concept (3+): deep "what/why/how" questions on key ideas — not surface definitions
- definition (2+): precise definitions of technical terms, with distinguishing details
- relationship (2+): "How does X relate to Y?", "What's the difference between X and Y?", "Why does X cause Y?"
- application (2+): worked examples, "Walk me through...", "Given X, what happens when Y?"
- edge_case (2+): "What happens when...?", common misconceptions, failure modes, gotchas

Additional rules:
- Target 15–20 cards. Never fewer than 12. Scale up for dense, technical content.
- Front: specific, self-contained question. Never vague ("Explain X" → bad. "What does X guarantee that Y does not?" → good).
- Back: as long as needed for a complete answer. Worked examples can use multiple sentences or numbered steps.
- Cover ALL important terms and concepts in the text — do not cherry-pick only the obvious ones.
- Do not generate cards that require seeing the original text to answer.
- Each card tests exactly ONE concept.

OPTIONAL CARD FORMATS (add variety — use both across the deck):

1. MCQ (~20% of definition/concept cards): add "cardFormat": "mcq" and "options": ["correct answer", "plausible wrong 1", "plausible wrong 2", "plausible wrong 3"]. Wrong options must be from the same domain, plausibly confused. "back" still has full explanation.

2. Fill-in-blank (~15% of definition/concept cards): add "cardFormat": "fill_blank". The "front" must be a complete sentence with exactly one "___" where the key term belongs (e.g. "The _____ algorithm gives each task a fixed time slice in turn."). The "back" is only the word or phrase that fills the blank (e.g. "round-robin"). Keep the blank to 1-4 words.

All other cards use the default flip format (omit cardFormat and options).

DIFFICULTY RATING — required for every card:
- "difficulty": 1 — Straightforward recall: definitions, basic facts, direct lookup
- "difficulty": 2 — Requires understanding: relationships, explanations, comparisons
- "difficulty": 3 — Requires application: problem solving, edge cases, synthesis, multi-step reasoning

Respond ONLY with valid JSON:
{
  "cards": [
    {
      "front": "question",
      "back": "answer",
      "type": "concept",
      "difficulty": 2
    },
    {
      "front": "Which of the following best describes X?",
      "back": "Correct answer. X does Y because Z.",
      "type": "definition",
      "cardFormat": "mcq",
      "options": ["Correct answer", "Plausible distractor 1", "Plausible distractor 2", "Plausible distractor 3"],
      "difficulty": 1
    },
    {
      "front": "The _____ property ensures that a database transaction either completes fully or not at all.",
      "back": "atomicity",
      "type": "definition",
      "cardFormat": "fill_blank",
      "difficulty": 1
    }
  ]
}

TEXT:
${chunk}`;

const SYNTHESIS_SYSTEM = `You are an expert educator reviewing a complete set of flashcards generated from a study document. Your job is to find the gaps — concepts that span multiple sections, relationships between ideas that individual-section cards missed, and the "big picture" questions a student needs to answer to truly understand the material.`;

const SYNTHESIS_PROMPT = (cards: GeneratedCard[]) => `Below are flashcards generated section-by-section from a study document. Generate 6–10 additional synthesis cards that:

1. Connect concepts across different sections ("How does X from section A interact with Y from section B?")
2. Address the overall mental model ("What is the core tradeoff/principle that unifies everything in this material?")
3. Catch common misconceptions that arise from learning pieces in isolation
4. Add any important concept, definition, or edge case that the existing cards missed

Do NOT duplicate any existing card. These are ADDITION cards only.

Card types to use: concept, relationship, application, edge_case

Respond ONLY with valid JSON:
{
  "cards": [
    {
      "front": "question",
      "back": "answer",
      "type": "relationship"
    }
  ]
}

EXISTING CARDS (${cards.length} total):
${JSON.stringify(cards.map(c => ({ front: c.front, type: c.type })), null, 2)}`;

const DECK_META_PROMPT = (sampleCards: GeneratedCard[]) => `Given these flashcards generated from a study document, suggest:
1. A short, clear deck title (3-6 words)
2. A one-sentence description of what this deck covers (be specific — mention the main topics)
3. The primary subject area as a colorTheme:
   - "blue" for math / logic / statistics
   - "emerald" for science / biology / chemistry / physics / nature
   - "amber" for history / social studies / economics / psychology
   - "rose" for language / literature / writing / linguistics
   - "violet" for technology / computer science / programming / engineering
   - "slate" for general / mixed / other

Respond ONLY with valid JSON: { "title": "...", "description": "...", "colorTheme": "..." }

SAMPLE CARDS:
${JSON.stringify(sampleCards.slice(0, 8), null, 2)}`;

const CARD_CHAT_SYSTEM = (front: string, back: string) => `You are a friendly, patient tutor helping a student understand a concept from their flashcard.

THE FLASHCARD:
Front: ${front}
Back: ${back}

RULES:
- Be concise. Responses should be 2-4 sentences max unless the student asks for more detail.
- Use simple language. Explain like you're talking to someone who just learned this.
- If the student seems confused, try a different angle or analogy. Don't repeat the same explanation.
- If the student asks something unrelated to the card's topic, gently redirect: "That's interesting! But let's stay focused on this card. What else about it is unclear?"
- You can ask the student a quick follow-up question to check understanding, like a good tutor would.
- Never be condescending. Be warm.`;

// ── Core call with per-provider retry ────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Parse Groq/OpenRouter 429 error messages for retry-after seconds.
 * e.g. "Please try again in 2.325s." → 2.325
 */
function parse429WaitSecs(msg: string): number {
  const match = msg.match(/try again in (\d+\.?\d*)\s*s/i);
  return match ? parseFloat(match[1]) : 0;
}

function is429(msg: string): boolean {
  return msg.includes("429") || msg.toLowerCase().includes("rate limit");
}

async function callWithFallback(
  task: "cards" | "meta",
  buildMessages: (provider: ProviderConfig) => OpenAI.Chat.ChatCompletionMessageParam[],
  maxTokens: number
): Promise<string> {
  const providers = getEnabledProviders();

  if (providers.length === 0) {
    throw new Error(
      "No LLM providers configured. Set at least one of: GROQ_API_KEY, TOGETHER_API_KEY, OPENROUTER_API_KEY, HF_TOKEN, or OLLAMA_ENABLED=true"
    );
  }

  let lastError: unknown;

  for (const provider of providers) {
    const model = task === "cards" ? provider.cardModel : provider.metaModel;
    console.log(`[llm] trying ${provider.name} (${model})`);

    const client = makeClient(provider);
    const messages = buildMessages(provider);

    // Up to 2 retries on the same provider for short rate-limit waits
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model,
          max_tokens: maxTokens,
          messages,
          temperature: 0.3,
        });

        const text = response.choices[0]?.message?.content ?? "";
        console.log(`[llm] ${provider.name} succeeded`);
        return text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);

        if (is429(msg) && attempt < 2) {
          const waitSecs = parse429WaitSecs(msg);
          // Only retry same provider if the wait is short enough (≤ 8s)
          if (waitSecs > 0 && waitSecs <= 8) {
            const waitMs = Math.ceil((waitSecs + 0.5) * 1000);
            console.warn(`[llm] ${provider.name} rate-limited, waiting ${waitSecs}s then retrying...`);
            await sleep(waitMs);
            continue; // retry same provider
          }
        }

        // Non-429, non-retryable 429, or retries exhausted → try next provider
        console.warn(`[llm] ${provider.name} failed: ${msg.slice(0, 120)}`);
        lastError = err;
        break;
      }
    }
  }

  throw new Error(
    `All providers failed. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate flashcards from a single text chunk.
 * Tries providers in order: Groq → Together → OpenRouter → Ollama → HuggingFace
 */
export async function generateCardsFromChunk(chunk: string): Promise<GeneratedCard[]> {
  const text = await callWithFallback(
    "cards",
    () => [
      { role: "system", content: CARD_GENERATION_SYSTEM },
      { role: "user", content: CARD_GENERATION_PROMPT(chunk) },
    ],
    // 4000 tokens — enough for 15-20 cards (~150 tokens each).
    // Groq 413s when input + max_tokens exceeds payload limit; 6000 was too high.
    4000
  );

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed: GenerationResult = JSON.parse(jsonMatch[0]);
    return parsed.cards || [];
  } catch {
    console.error("[llm] JSON parse failed for cards:", text.slice(0, 200));
    return [];
  }
}

/**
 * Generate synthesis cards that connect concepts across chunks.
 * Catches cross-section relationships and big-picture gaps.
 */
export async function generateSynthesisCards(cards: GeneratedCard[]): Promise<GeneratedCard[]> {
  if (cards.length < 5) return [];

  const text = await callWithFallback(
    "cards",
    () => [
      { role: "system", content: SYNTHESIS_SYSTEM },
      { role: "user", content: SYNTHESIS_PROMPT(cards) },
    ],
    3000
  );

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed: GenerationResult = JSON.parse(jsonMatch[0]);
    return parsed.cards || [];
  } catch {
    console.error("[llm] JSON parse failed for synthesis cards:", text.slice(0, 200));
    return [];
  }
}

/**
 * Generate deck title, description, and colorTheme from sample cards.
 * Uses smaller/faster model per provider.
 */
export async function generateDeckMeta(
  cards: GeneratedCard[]
): Promise<{ title: string; description: string; colorTheme: string }> {
  const text = await callWithFallback(
    "meta",
    () => [{ role: "user", content: DECK_META_PROMPT(cards) }],
    300
  );

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { title: "Untitled Deck", description: "", colorTheme: "slate" };

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    // Validate colorTheme against allowed values
    const validThemes = ["blue", "emerald", "amber", "rose", "violet", "slate"];
    if (!validThemes.includes(parsed.colorTheme)) parsed.colorTheme = "slate";
    return {
      title: parsed.title || "Untitled Deck",
      description: parsed.description || "",
      colorTheme: parsed.colorTheme,
    };
  } catch {
    return { title: "Untitled Deck", description: "", colorTheme: "slate" };
  }
}

export async function chatWithCard(
  card: Pick<GeneratedCard, "front" | "back">,
  messages: TutorMessage[]
): Promise<string> {
  const safeMessages = messages
    .filter(
      (message): message is TutorMessage =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 1500),
    }));

  if (safeMessages.length === 0) {
    throw new Error("No chat messages provided");
  }

  const provider = getOpenRouterProvider();
  const chatModels = getOpenRouterChatModelChain(provider.metaModel);
  const [chatModel, ...fallbackModels] = chatModels;
  const chatMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: CARD_CHAT_SYSTEM(card.front, card.back) },
    ...safeMessages.map((message) => ({ role: message.role, content: message.content })),
  ];

  let lastError: unknown;

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      console.log(
        `[chat] using OpenRouter (${chatModel}${fallbackModels.length > 0 ? ` -> ${fallbackModels.join(" -> ")}` : ""})`
      );
      const response = await fetch(`${provider.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://deckforge.app",
          "X-Title": "DeckForge",
        },
        body: JSON.stringify({
          model: chatModel,
          max_tokens: 300,
          messages: chatMessages,
          temperature: 0.4,
          models: fallbackModels,
          provider: {
            allow_fallbacks: true,
            sort: "throughput",
          },
        }),
      });
      const payload = await response.json() as {
        model?: string;
        provider?: string;
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (!response.ok) {
        throw new Error(`${response.status} ${payload.error?.message || "OpenRouter request failed"}`);
      }

      const reply = payload.choices?.[0]?.message?.content?.trim();
      if (!reply) {
        throw new Error("OpenRouter returned an empty chat response.");
      }

      const usedModel = payload.model || chatModel;
      const usedProvider = payload.provider;
      console.log(
        `[chat] OpenRouter succeeded with ${usedModel}${usedProvider ? ` via ${usedProvider}` : ""}`
      );

      return reply;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = err;

      if (is429(msg) && attempt < 2) {
        const waitSecs = parse429WaitSecs(msg);
        const waitMs =
          waitSecs > 0 && waitSecs <= 8
            ? Math.ceil((waitSecs + 0.5) * 1000)
            : 1500 * (attempt + 1);
        console.warn(`[chat] OpenRouter rate-limited, waiting ${waitMs}ms then retrying...`);
        await sleep(waitMs);
        continue;
      }

      console.warn(`[chat] OpenRouter failed: ${msg.slice(0, 160)}`);
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
    }
  }

  throw new Error(
    `OpenRouter chat failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  );
}

/**
 * Normalise a card front to a dedup key.
 * Strips punctuation, stop words, and collapses whitespace so that
 * "What is X?" and "Define X" and "What does X mean?" all look similar.
 */
function normaliseFront(front: string): string {
  return front
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(what|is|are|the|a|an|does|do|how|why|when|where|which|define|explain|describe|difference|between|and|of|in|to|for|by)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deduplicate cards using fuzzy front normalisation.
 * Catches "What is X?" vs "Define X" vs "What does X mean?" duplicates.
 */
export function deduplicateCards(cards: GeneratedCard[]): GeneratedCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    const key = normaliseFront(card.front);
    if (key.length < 3) return true; // too short to dedup reliably
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
