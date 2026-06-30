/**
 * Lightweight CLIP-style token estimator.
 *
 * The real CLIP tokenizer (BPE) is heavy and not available without bundling
 * `@xenova/transformers`. For a live char/word counter this approximation is
 * good enough: CLIP averages roughly 1 token per 4 characters for English
 * text, but comma-separated tags and short words tokenize less efficiently
 * (each tag boundary tends to cost a token). We combine both signals.
 *
 * Returns an estimate labelled "≈" so the UI can make clear it's not exact.
 */

/**
 * Estimate the CLIP token count of a caption.
 *
 * Heuristic:
 *   - Base: charLength / 4 (rough average for English)
 *   - Tag penalty: +1 per comma separator (each tag boundary costs ~1 token)
 *   - Floor at word count for very short captions (CLIP never uses fewer than
 *     the word count for simple words)
 */
export function estimateClipTokens(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const charCount = trimmed.length;
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const commaCount = (trimmed.match(/,/g) || []).length;

  // Char-based estimate
  const charBased = Math.ceil(charCount / 4);
  // Tag boundary overhead (each comma adds roughly a token)
  const withTags = charBased + commaCount;
  // Floor at word count (CLIP tokenizes common words as ~1 token each)
  return Math.max(withTags, wordCount);
}

/**
 * A CLIP text encoder processes captions in chunks of 75 tokens. Anything
 * beyond that wraps into additional "chunks" — relevant for training since
 * very long captions get split and may dilute signal.
 */
export function clipTokenChunks(tokens: number): number {
  return Math.ceil(tokens / 75);
}

/**
 * Quality hint for a caption based on token count.
 *  - "short": < 10 tokens (might not describe enough)
 *  - "ok": 10–75 tokens (fits in one CLIP chunk, good range)
 *  - "long": > 75 tokens (spills into multiple chunks)
 */
export function captionTokenQuality(
  tokens: number
): { level: 'short' | 'ok' | 'long'; label: string } {
  if (tokens === 0) return { level: 'ok', label: '' };
  if (tokens < 10) return { level: 'short', label: 'short' };
  if (tokens <= 75) return { level: 'ok', label: 'ok' };
  return { level: 'long', label: `${Math.ceil(tokens / 75)} chunks` };
}
