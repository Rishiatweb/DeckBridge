// Text chunking for PDF content before LLM processing

// 2000 token chunks (~8000 chars). Groq's on-demand tier 413s on payload > ~10KB
// when combined with the system prompt + max_tokens declaration in the request body.
// Chunks 1-2 often pass because sentence-boundary truncation makes them shorter;
// full-size chunks 3+ hit the limit. 2000 tokens keeps total payload safely under 10KB.
const CHUNK_SIZE = 2000;
const CHUNK_OVERLAP = 150; // overlap to avoid cutting concepts mid-thought

/**
 * Split text into overlapping chunks of ~2000 tokens (chars/4 approximation)
 */
export function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  // Clean up the text
  const cleaned = text
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  if (!cleaned) return [];

  // Use character count * 4 as token approximation
  const charChunkSize = chunkSize * 4;
  const charOverlap = overlap * 4;

  const chunks: string[] = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + charChunkSize, cleaned.length);
    let chunk = cleaned.slice(start, end);

    // Try to end at a sentence boundary
    if (end < cleaned.length) {
      const lastPeriod = chunk.lastIndexOf(". ");
      const lastNewline = chunk.lastIndexOf("\n\n");
      const boundary = Math.max(lastPeriod, lastNewline);
      if (boundary > charChunkSize * 0.5) {
        chunk = chunk.slice(0, boundary + 1);
      }
    }

    if (chunk.trim().length > 100) {
      chunks.push(chunk.trim());
    }

    const advance = chunk.length - charOverlap;
    if (advance <= 0) break;
    start += advance;
  }

  return chunks;
}
