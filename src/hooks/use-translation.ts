'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  splitTriggerWord,
  reassembleCaption,
  splitTags,
  joinTags,
  looksLikeTags,
} from '@/lib/translate-helpers';

/**
 * Chrome Translator API (on-device, no network, no API key).
 * Available in Chrome 138+ behind flags. Runs fully client-side.
 *
 * Spec: https://developer.chrome.com/docs/ai/translator-api
 *
 * We access it via a union of possible global locations because the API
 * surface moved between versions (translation / ai.translation / window.translation).
 */

// --- Minimal type definitions for the experimental API ---

type Availability = 'readily' | 'after-download' | 'no';

interface ChromeTranslator {
  translate: (input: string) => Promise<string>;
  destroy: () => void;
}

interface ChromeTranslatorFactory {
  createTranslator: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<ChromeTranslator>;
}

interface ChromeLanguageDetector {
  detect: (
    input: string
  ) => Promise<Array<{ detectedLanguage: string; confidence: number }>>;
  destroy: () => void;
}

interface ChromeTranslationAPI {
  createTranslator: ChromeTranslatorFactory['createTranslator'];
  canDetectLanguage?: () => Promise<{ available: Availability }>;
  createLanguageDetector?: () => Promise<ChromeLanguageDetector>;
}

declare global {
  interface Window {
    translation?: ChromeTranslationAPI;
    ai?: {
      translation?: ChromeTranslationAPI;
      translator?: ChromeTranslationAPI;
    };
  }
}

export interface TranslatorDetectionResult {
  /** Whether the API object is exposed on `window`. */
  apiPresent: boolean;
  /** Availability state once the API is present. */
  availability: Availability | null;
  /** Human-readable reason explaining the detection outcome. */
  reason: string;
  /** Which global location exposed the API, for diagnostics. */
  location: 'translation' | 'ai.translation' | 'ai.translator' | null;
}

/**
 * Find the Chrome Translator API across the various global locations it has
 * occupied across Chrome versions.
 */
function findTranslatorAPI(): {
  api: ChromeTranslationAPI | null;
  location: TranslatorDetectionResult['location'];
} {
  if (typeof window === 'undefined') {
    return { api: null, location: null };
  }
  if (window.translation?.createTranslator) {
    return { api: window.translation, location: 'translation' };
  }
  if (window.ai?.translation?.createTranslator) {
    return { api: window.ai.translation, location: 'ai.translation' };
  }
  if (window.ai?.translator?.createTranslator) {
    return { api: window.ai.translator, location: 'ai.translator' };
  }
  return { api: null, location: null };
}

/** Best-effort Chrome major version from the user agent (0 if unknown). */
function chromeMajorVersion(): number {
  if (typeof navigator === 'undefined') return 0;
  const m = navigator.userAgent.match(/Chrom(e|ium)\/(\d+)/);
  return m ? parseInt(m[2], 10) : 0;
}

/**
 * Detect whether the Chrome Translator API is available on-device.
 * Returns a diagnostic object explaining the outcome so the UI can show
 * actionable guidance (e.g. "enable chrome://flags/#translation-api").
 */
export async function detectTranslatorAPI(): Promise<TranslatorDetectionResult> {
  if (typeof window === 'undefined') {
    return {
      apiPresent: false,
      availability: null,
      reason: 'Server-side render — detection runs in the browser only.',
      location: null,
    };
  }

  const { api, location } = findTranslatorAPI();
  if (!api) {
    const v = chromeMajorVersion();
    if (v > 0 && v < 138) {
      return {
        apiPresent: false,
        availability: null,
        reason: `Chrome ${v} is too old — the Translator API requires Chrome 138+. Update Chrome.`,
        location: null,
      };
    }
    return {
      apiPresent: false,
      availability: null,
      reason:
        'Translator API not exposed. In Chrome, open chrome://flags/#translation-api, set it to "Enabled", relaunch, then reload this page.',
      location: null,
    };
  }

  try {
    if (api.canDetectLanguage) {
      const { available } = await api.canDetectLanguage();
      if (available === 'no') {
        return {
          apiPresent: true,
          availability: 'no',
          reason:
            'API present but no language model is available. Make sure the on-device models flag (chrome://flags/#optimization-guide-on-device-models) is enabled.',
          location,
        };
      }
      if (available === 'after-download') {
        return {
          apiPresent: true,
          availability: 'after-download',
          reason:
            'On-device model will be downloaded on first translation. The first request may take longer.',
          location,
        };
      }
      return {
        apiPresent: true,
        availability: 'readily',
        reason: 'Chrome Translator API is ready (on-device).',
        location,
      };
    }
    // canDetectLanguage missing — assume ready if createTranslator exists.
    return {
      apiPresent: true,
      availability: 'readily',
      reason: 'Chrome Translator API is ready (on-device).',
      location,
    };
  } catch {
    return {
      apiPresent: true,
      availability: null,
      reason: 'Translator API threw during availability check.',
      location,
    };
  }
}

export type TranslationEngine = 'native' | 'remote' | 'none';
export type TranslationStatus = 'idle' | 'translating' | 'done' | 'error';

interface TranslationResult {
  text: string;
  engine: TranslationEngine;
}

// --- Client-side cache (survives across hook instances within a session) ---
const clientCache = new Map<string, TranslationResult>();

function clientCacheKey(
  text: string,
  target: string,
  triggerWord?: string
): string {
  return `${target}::${triggerWord || ''}::${text}`;
}

// --- Hook options ---

interface UseTranslationOptions {
  debounceMs?: number;
  triggerWord?: string;
}

interface UseTranslationReturn {
  engine: TranslationEngine;
  availability: Availability | null;
  /** Why the native API is (or isn't) available — shown in the UI. */
  detectionReason: string;
  /** Chrome major version (0 if not Chrome). */
  chromeVersion: number;
  status: TranslationStatus;
  translated: string;
  error: string | null;
  /** Translate a caption. Debounced internally. */
  translate: (text: string, targetLang: string) => void;
  /** Immediately cancel any pending translation. */
  cancel: () => void;
}

export function useTranslation(
  options: UseTranslationOptions = {}
): UseTranslationReturn {
  const { debounceMs = 700, triggerWord } = options;

  const [engine, setEngine] = useState<TranslationEngine>('none');
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [detectionReason, setDetectionReason] = useState('Detectando traductor on-device…');
  // Lazy init: navigator is available on the client; safe no-op (returns 0) on SSR.
  const [chromeVersion] = useState(() => chromeMajorVersion());
  const [status, setStatus] = useState<TranslationStatus>('idle');
  const [translated, setTranslated] = useState('');
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const translatorRef = useRef<ChromeTranslator | null>(null);
  const cachedPairRef = useRef<{ source: string; target: string } | null>(null);

  // Detect the Chrome Translator API on mount.
  useEffect(() => {
    let cancelled = false;
    detectTranslatorAPI().then((result) => {
      if (cancelled) return;
      setAvailability(result.availability);
      setDetectionReason(result.reason);
      setEngine(
        result.availability === 'readily' || result.availability === 'after-download'
          ? 'native'
          : 'remote'
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Lazily create / reuse a native translator for a given language pair.
  const getNativeTranslator = useCallback(
    async (source: string, target: string): Promise<ChromeTranslator | null> => {
      const { api } = findTranslatorAPI();
      if (!api) return null;
      // Reuse existing translator if the language pair matches.
      if (
        translatorRef.current &&
        cachedPairRef.current?.source === source &&
        cachedPairRef.current?.target === target
      ) {
        return translatorRef.current;
      }
      // Tear down any previous translator.
      try {
        translatorRef.current?.destroy();
      } catch {
        // ignore
      }
      try {
        const t = await api.createTranslator({
          sourceLanguage: source,
          targetLanguage: target,
        });
        translatorRef.current = t;
        cachedPairRef.current = { source, target };
        return t;
      } catch {
        return null;
      }
    },
    []
  );

  // Cleanup translator on unmount.
  useEffect(() => {
    return () => {
      try {
        translatorRef.current?.destroy();
      } catch {
        // ignore
      }
      translatorRef.current = null;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const cancel = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    reqIdRef.current += 1; // invalidate any in-flight request
    setStatus('idle');
  }, []);

  // Returns the translated text + engine, or null to signal "fall back".
  // Does NOT touch React state — the caller is responsible for that.
  const doTranslateNative = useCallback(
    async (id: number, text: string, target: string): Promise<TranslationResult | null> => {
      // Detect source language on-device when possible.
      let source = 'en';
      try {
        const { api } = findTranslatorAPI();
        if (api?.createLanguageDetector) {
          const detector = await api.createLanguageDetector();
          const results = await detector.detect(text);
          detector.destroy();
          if (results?.[0]?.detectedLanguage) {
            source = results[0].detectedLanguage;
          }
        }
      } catch {
        // keep default 'en'
      }

      // If source == target, nothing to do.
      if (source === target) {
        if (reqIdRef.current !== id) return null;
        return { text, engine: 'native' };
      }

      const translator = await getNativeTranslator(source, target);
      if (!translator) return null; // fall back to remote
      if (reqIdRef.current !== id) return null;

      // Preserve trigger word + tag boundaries using the native translator.
      const { trigger, separator, body } = splitTriggerWord(text, triggerWord);
      let translatedBody = '';
      if (!body.trim()) {
        translatedBody = '';
      } else if (looksLikeTags(body)) {
        const tags = splitTags(body);
        const out: string[] = [];
        for (const tag of tags) {
          try {
            out.push(await translator.translate(tag));
          } catch {
            out.push(tag);
          }
          if (reqIdRef.current !== id) return null;
        }
        translatedBody = joinTags(out);
      } else {
        try {
          translatedBody = await translator.translate(body);
        } catch {
          return null;
        }
      }
      if (reqIdRef.current !== id) return null;
      const result = reassembleCaption(trigger, separator, translatedBody);
      return { text: result, engine: 'native' };
    },
    [triggerWord, getNativeTranslator]
  );

  // Throws on error; returns the translated text + engine on success.
  const doTranslateRemote = useCallback(
    async (id: number, text: string, target: string): Promise<TranslationResult> => {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          targetLang: target,
          sourceLang: 'auto',
          triggerWord,
        }),
      });
      if (reqIdRef.current !== id) {
        throw new Error('cancelled');
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { translatedText: string };
      return { text: data.translatedText, engine: 'remote' as const };
    },
    [triggerWord]
  );

  const translate = useCallback(
    (text: string, targetLang: string) => {
      // Cancel any pending debounced call.
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      const trimmed = text.trim();
      if (!trimmed) {
        setTranslated('');
        setStatus('idle');
        setError(null);
        return;
      }

      // Client cache lookup (avoids re-translating identical text).
      const key = clientCacheKey(trimmed, targetLang, triggerWord);
      const cached = clientCache.get(key);
      if (cached) {
        setTranslated(cached.text);
        setEngine(cached.engine);
        setStatus('done');
        setError(null);
        return;
      }

      setStatus('translating');
      setError(null);

      debounceRef.current = setTimeout(async () => {
        const id = ++reqIdRef.current;
        try {
          // Try native first when available.
          const canNative =
            availability === 'readily' || availability === 'after-download';
          let result: TranslationResult | null = null;
          if (canNative) {
            result = await doTranslateNative(id, trimmed, targetLang);
          }
          if (!result && reqIdRef.current === id) {
            result = await doTranslateRemote(id, trimmed, targetLang);
          }
          if (reqIdRef.current !== id) return; // superseded
          if (result) {
            setTranslated(result.text);
            setEngine(result.engine);
            setStatus('done');
            // Store in client cache.
            clientCache.set(key, result);
          }
        } catch (err) {
          if (reqIdRef.current !== id) return;
          const msg = err instanceof Error ? err.message : 'Translation failed';
          setError(msg);
          setStatus('error');
        }
      }, debounceMs);
    },
    [
      availability,
      debounceMs,
      doTranslateNative,
      doTranslateRemote,
      triggerWord,
    ]
  );

  return {
    engine,
    availability,
    detectionReason,
    chromeVersion,
    status,
    translated,
    error,
    translate,
    cancel,
  };
}
