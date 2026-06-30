import { NextRequest, NextResponse } from 'next/server';
import {
  splitTriggerWord,
  reassembleCaption,
  splitTags,
  joinTags,
  looksLikeTags,
} from '@/lib/translate-helpers';

/**
 * POST /api/translate
 *
 * Translates caption text WITHOUT using any LLM or the Z-AI SDK.
 * This endpoint is a FALLBACK for browsers that do not support the
 * Chrome Translator API (on-device). When the Chrome API is available,
 * translation happens entirely client-side and this route is not called.
 *
 * Providers (in order):
 *   1. MyMemory (no API key, generous anonymous quota)
 *   2. Google Translate unofficial endpoint (fallback)
 *
 * Body:
 *   text: string                  - caption text to translate
 *   targetLang: string            - BCP-47 code, e.g. "es", "en", "ja"
 *   sourceLang?: string           - "auto" (default) or a BCP-47 code
 *   triggerWord?: string          - LoRA trigger word to preserve verbatim
 *
 * Response:
 *   { translatedText, provider, cached }
 */

// --- In-memory cache (survives across requests within the server process) ---
interface CacheEntry {
  translated: string;
  provider: string;
  timestamp: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h — translations don't change

function cacheKey(text: string, target: string, source: string): string {
  return `${source}::${target}::${text}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text: string = (body?.text ?? '').toString();
    const targetLang: string = (body?.targetLang ?? 'es').toString().slice(0, 8);
    const sourceLang: string = (body?.sourceLang ?? 'auto')
      .toString()
      .slice(0, 8);
    const triggerWord: string | undefined = body?.triggerWord
      ? body.triggerWord.toString()
      : undefined;

    if (!text.trim()) {
      return NextResponse.json(
        { translatedText: '', provider: 'noop', cached: false },
        { status: 200 }
      );
    }

    // Check cache first
    const key = cacheKey(text, targetLang, sourceLang);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(
        {
          translatedText: cached.translated,
          provider: cached.provider,
          cached: true,
        },
        { status: 200 }
      );
    }

    // Preserve trigger word: translate only the body
    const { trigger, separator, body: captionBody } = splitTriggerWord(
      text,
      triggerWord
    );

    let translatedBody = '';

    if (!captionBody.trim()) {
      // Only a trigger word, nothing to translate
      translatedBody = '';
    } else if (looksLikeTags(captionBody)) {
      // Tag-style: translate each tag individually for better quality.
      // Batch them into a single request per tag to respect MyMemory limits
      // while keeping tag boundaries.
      const tags = splitTags(captionBody);
      const translatedTags: string[] = [];
      for (const tag of tags) {
        const t = await translateWithFallback(tag, targetLang, sourceLang);
        translatedTags.push(t || tag);
      }
      translatedBody = joinTags(translatedTags);
    } else {
      // Natural language: translate as a single block
      translatedBody = await translateWithFallback(
        captionBody,
        targetLang,
        sourceLang
      );
    }

    const result = reassembleCaption(trigger, separator, translatedBody);

    // Store in cache
    cache.set(key, {
      translated: result,
      provider: 'remote',
      timestamp: Date.now(),
    });

    return NextResponse.json(
      { translatedText: result, provider: 'remote', cached: false },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Translation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// --- Providers ---

/**
 * MyMemory imposes a hard 500-char limit per request. Leave a small margin
 * for URL-encoding overhead (accented chars expand ~3x when percent-encoded).
 */
const MYMEMORY_MAX_BYTES = 480;

async function translateWithFallback(
  text: string,
  target: string,
  source: string
): Promise<string> {
  // 1. MyMemory (with chunking for long texts)
  try {
    const r = await translateMyMemoryChunked(text, target, source);
    if (r) return r;
  } catch {
    // fall through to Google
  }
  // 2. Google (unofficial) — no 500-char limit, handles long texts natively.
  try {
    const r = await translateGoogle(text, target, source);
    if (r) return r;
  } catch {
    // fall through
  }
  // Last resort: return original text unchanged so the UI still shows something.
  return text;
}

/**
 * Split a long text into chunks <= MYMEMORY_MAX_BYTES, trying to break on
 * sentence boundaries (., !, ?) or, failing that, on word boundaries.
 * Returns at least one chunk (which may exceed the limit only if a single
 * word/token is longer than the limit — rare for captions).
 */
function chunkText(text: string, maxBytes: number): string[] {
  // Use byte length to be safe with multibyte chars in the request URL.
  const byteLen = Buffer.byteLength(text, 'utf8');
  if (byteLen <= maxBytes) return [text];

  const chunks: string[] = [];
  // Split into sentences first, preserving the trailing punctuation/whitespace.
  const sentences = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text];

  let current = '';
  for (const sentence of sentences) {
    const candidate = current + sentence;
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
      current = candidate;
    } else {
      if (current) {
        chunks.push(current);
        current = '';
      }
      // If the single sentence is itself too long, split it on whitespace.
      if (Buffer.byteLength(sentence, 'utf8') > maxBytes) {
        const words = sentence.split(/(\s+)/);
        let wcur = '';
        for (const w of words) {
          if (Buffer.byteLength(wcur + w, 'utf8') <= maxBytes) {
            wcur += w;
          } else {
            if (wcur) chunks.push(wcur);
            wcur = w;
          }
        }
        if (wcur) current = wcur;
      } else {
        current = sentence;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text];
}

/**
 * Translate via MyMemory, splitting long inputs into chunks and reassembling.
 * Each chunk is a separate API call (subject to rate limits) but stays under
 * the 500-char hard limit.
 */
async function translateMyMemoryChunked(
  text: string,
  target: string,
  source: string
): Promise<string> {
  const chunks = chunkText(text, MYMEMORY_MAX_BYTES);
  const out: string[] = [];
  for (const chunk of chunks) {
    out.push(await translateMyMemoryOnce(chunk, target, source));
  }
  return out.join('');
}

/**
 * Single MyMemory request. Throws on the length-limit error so the caller can
 * decide to fall back to Google.
 */
async function translateMyMemoryOnce(
  text: string,
  target: string,
  source: string
): Promise<string> {
  const params = new URLSearchParams({
    q: text,
    langpair: `${source === 'auto' ? 'en' : source}|${target}`,
  });
  const url = `https://api.mymemory.translated.net/get?${params.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'dataset-manager/1.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const data = (await res.json()) as {
    responseData?: { translatedText?: string };
    responseStatus?: number;
  };
  const translated = data?.responseData?.translatedText;
  if (!translated) throw new Error('MyMemory empty response');
  // MyMemory returns "PLEASE SELECT TWO DISTINCT LANGUAGES" when the
  // auto-detected source language equals the target language. In that case
  // the text is already in the target language — return it unchanged.
  if (/PLEASE SELECT TWO DISTINCT LANGUAGES/i.test(translated)) {
    return text;
  }
  // Detect the 500-char length limit error explicitly.
  if (/QUERY LENGTH LIMIT EXCEEDED/i.test(translated)) {
    throw new Error('MyMemory: query length limit exceeded');
  }
  // MyMemory sometimes returns other error messages in the translatedText field
  if (/MYMEMORY WARNING|INVALID/i.test(translated)) {
    throw new Error(`MyMemory: ${translated}`);
  }
  return decodeEntities(translated);
}

/**
 * Google Translate unofficial endpoint.
 * No API key. Uses the public translate endpoint and parses the JSON array.
 */
async function translateGoogle(
  text: string,
  target: string,
  source: string
): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(
      text
    )}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  // Response shape: [ [ [translatedChunk, originalChunk, ...], ... ], ... ]
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Google: unexpected response shape');
  }
  const chunks = (data[0] as Array<Array<string>>)
    .map((seg) => seg?.[0])
    .filter(Boolean);
  return decodeEntities(chunks.join(''));
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
