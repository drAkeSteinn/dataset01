/**
 * Helpers for translation that preserve LoRA training artifacts:
 *  - Trigger word (e.g. "n1pl3fk") must NOT be translated
 *  - Tag-style captions (comma-separated) are translated per-tag for better quality
 *
 * These helpers are pure (no network) and shared by the API route and the client.
 */

export interface SupportedLanguage {
  code: string; // BCP-47 code used by Chrome Translator API
  name: string;
  flag: string;
}

/**
 * Languages supported by the Chrome Translator API.
 * BCP-47 codes are also understood by MyMemory / Google fallback endpoints.
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
];

export function getLanguageName(code: string): string {
  return SUPPORTED_LANGUAGES.find((l) => l.code === code)?.name ?? code;
}

/**
 * Split a caption into a leading trigger word token and the remaining body.
 *
 * LoRA captions typically look like: `n1pl3fk, anime art style, silver hair, ...`
 * The trigger word is the first comma-separated token and must be preserved verbatim.
 *
 * Returns { trigger, body } where `trigger` is "" if there is none.
 */
export function splitTriggerWord(
  caption: string,
  triggerWord?: string
): { trigger: string; separator: string; body: string } {
  const trimmed = caption.trim();
  if (!trimmed) return { trigger: '', separator: '', body: '' };

  // If an explicit trigger word is provided, strip it from the start if present.
  if (triggerWord && triggerWord.trim()) {
    const tw = triggerWord.trim();
    // Match trigger word at the start, optionally followed by a comma/separator
    const re = new RegExp(
      `^\\s*${escapeRegExp(tw)}\\s*(,|;|:|\\s+|$)`,
      'i'
    );
    const match = trimmed.match(re);
    if (match) {
      const sep = match[1] === '' ? ' ' : match[1];
      const body = trimmed.slice(match[0].length).trim();
      return { trigger: tw, separator: sep === ' ' ? ' ' : ', ', body };
    }
  }

  // Heuristic: first comma-separated token that looks like a token (no spaces,
  // short, alphanumeric) is treated as the trigger word.
  const firstComma = trimmed.indexOf(',');
  if (firstComma > 0) {
    const firstToken = trimmed.slice(0, firstComma).trim();
    const looksLikeTrigger =
      firstToken.length > 0 &&
      firstToken.length <= 32 &&
      /^[a-zA-Z0-9_-]+$/.test(firstToken) &&
      !/\s/.test(firstToken) &&
      // Avoid treating natural-language words like "The" as a trigger
      !COMMON_WORDS.has(firstToken.toLowerCase());
    if (looksLikeTrigger) {
      const body = trimmed.slice(firstComma + 1).trim();
      return { trigger: firstToken, separator: ', ', body };
    }
  }

  return { trigger: '', separator: '', body: trimmed };
}

/**
 * Re-attach the preserved trigger word to the translated body.
 */
export function reassembleCaption(
  trigger: string,
  separator: string,
  translatedBody: string
): string {
  const body = translatedBody.trim();
  if (!trigger) return body;
  if (!body) return trigger;
  const sep = separator || ', ';
  return `${trigger}${sep}${body}`;
}

/**
 * Split a tag-style body into individual tags, preserving whitespace position
 * is NOT needed — we only preserve the separator (comma).
 */
export function splitTags(body: string): string[] {
  if (!body.trim()) return [];
  // Split on commas, trim each tag, drop empties
  return body
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function joinTags(tags: string[]): string {
  return tags.join(', ');
}

/**
 * Detect whether a body looks like comma-separated tags vs natural language.
 * Tags: many short fragments separated by commas, few verbs.
 */
export function looksLikeTags(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  const tags = splitTags(trimmed);
  if (tags.length <= 1) return false;
  // If most fragments are <= 4 words, treat as tags
  const shortFragments = tags.filter((t) => t.split(/\s+/).length <= 4).length;
  return shortFragments / tags.length >= 0.6;
}

// --- internals ---

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Common English words that should NOT be mistaken for trigger words.
const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'it', 'is', 'are',
  'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'image', 'photo', 'picture', 'girl', 'boy', 'woman', 'man', 'character',
  'anime', 'art', 'style', 'with', 'wearing', 'holding', 'standing', 'sitting',
]);
