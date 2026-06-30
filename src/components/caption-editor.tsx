'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Loader2, Check, Languages, Server, Cpu, Copy } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  estimateClipTokens,
  captionTokenQuality,
} from '@/lib/token-estimator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUpdateCaption } from '@/hooks/use-images';
import { useTranslation } from '@/hooks/use-translation';
import { useAppStore } from '@/stores/app-store';
import { SUPPORTED_LANGUAGES, getLanguageName } from '@/lib/translate-helpers';
import { cn } from '@/lib/utils';

interface CaptionEditorProps {
  imageId: string;
  initialCaption: string;
  /** LoRA trigger word — preserved verbatim in translations. */
  triggerWord?: string;
}

export function CaptionEditor({
  imageId,
  initialCaption,
  triggerWord,
}: CaptionEditorProps) {
  // Remount on image/caption change so internal state resets cleanly.
  return (
    <CaptionEditorInner
      key={`${imageId}-${initialCaption}`}
      imageId={imageId}
      initialCaption={initialCaption}
      triggerWord={triggerWord}
    />
  );
}

function CaptionEditorInner({
  imageId,
  initialCaption,
  triggerWord,
}: CaptionEditorProps) {
  const [caption, setCaption] = useState(initialCaption);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>(
    'idle'
  );
  const updateCaption = useUpdateCaption();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // When the user clicks a search result in Tags > Search, the store sets
  // `captionHighlight` to the searched text. We select & scroll to the first
  // occurrence in the textarea so the user can edit it immediately.
  const { captionHighlight, setCaptionHighlight } = useAppStore();

  useEffect(() => {
    if (!captionHighlight || !textareaRef.current) return;
    const ta = textareaRef.current;
    const idx = caption.toLowerCase().indexOf(captionHighlight.toLowerCase());
    if (idx >= 0) {
      ta.focus();
      ta.setSelectionRange(idx, idx + captionHighlight.length);
      // Scroll the selection into view.
      const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 16;
      const charHeight = Math.floor(idx / (ta.cols || 40)) * lineHeight;
      ta.scrollTop = Math.max(0, charHeight - ta.clientHeight / 2);
    }
    // Clear the highlight after applying so it doesn't re-trigger on re-renders.
    // Keep it set long enough for the selection to apply; clear on next tick.
    const t = setTimeout(() => setCaptionHighlight(null), 100);
    return () => clearTimeout(t);
  }, [captionHighlight, caption, setCaptionHighlight]);

  const wordCount = caption.trim() ? caption.trim().split(/\s+/).length : 0;
  const charCount = caption.length;
  const tokenEstimate = useMemo(() => estimateClipTokens(caption), [caption]);
  const tokenQuality = useMemo(
    () => captionTokenQuality(tokenEstimate),
    [tokenEstimate]
  );

  const saveCaption = useCallback(
    async (text: string) => {
      if (text === initialCaption) return;

      setSaveState('saving');
      try {
        await updateCaption.mutateAsync({ imageId, caption: text });
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1500);
      } catch {
        setSaveState('idle');
      }
    },
    [imageId, initialCaption, updateCaption]
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setCaption(value);
    setSaveState('idle');

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      saveCaption(value);
    }, 1000);
  };

  const handleBlur = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    saveCaption(caption);
  };

  return (
    <div className="space-y-2">
      <Textarea
        ref={textareaRef}
        value={caption}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Escribe el caption..."
        className="min-h-[120px] resize-y text-sm leading-relaxed"
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-[10px] text-muted-foreground">
            {charCount} chars · {wordCount} words
          </span>
          <span
            className={cn(
              'text-[10px] px-1.5 py-0.5 rounded border',
              tokenQuality.level === 'short' &&
                'border-amber-300 text-amber-600 bg-amber-50',
              tokenQuality.level === 'ok' &&
                'border-emerald-300 text-emerald-600 bg-emerald-50',
              tokenQuality.level === 'long' &&
                'border-sky-300 text-sky-600 bg-sky-50'
            )}
            title="Estimated CLIP tokens (approximate). Green = good range (10–75), amber = too short, blue = spans multiple 75-token chunks."
          >
            ≈{tokenEstimate} tokens{tokenQuality.label ? ` · ${tokenQuality.label}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {saveState === 'saving' && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Guardando...
            </span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <Check className="h-3 w-3" />
              Guardado
            </span>
          )}
        </div>
      </div>

      <TranslationPanel caption={caption} triggerWord={triggerWord} />
    </div>
  );
}

// ─── Translation panel ─────────────────────────────────────────────────────
// Always-visible read-only translation of the caption, shown directly below
// the caption editor. Defaults to Spanish so non-English speakers can read
// captions at a glance. Users can switch language via the compact selector.

function TranslationPanel({
  caption,
  triggerWord,
}: {
  caption: string;
  triggerWord?: string;
}) {
  const [targetLang, setTargetLang] = useState('es');
  const [copied, setCopied] = useState(false);

  const {
    engine,
    availability,
    detectionReason,
    chromeVersion,
    status,
    translated,
    error,
    translate,
    cancel,
  } = useTranslation({ triggerWord });

  // Always translate when the caption or target language changes.
  useEffect(() => {
    if (!caption.trim()) {
      cancel();
      return;
    }
    translate(caption, targetLang);
  }, [caption, targetLang, translate, cancel]);

  const handleCopy = async () => {
    if (!translated) return;
    try {
      await navigator.clipboard.writeText(translated);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  // Engine badge describing which translator is active.
  const engineBadge = (() => {
    if (status === 'translating') return null; // show spinner instead
    if (engine === 'native') {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="gap-1 text-[9px] px-1.5 py-0 h-4 border-emerald-300 text-emerald-700 bg-emerald-50"
            >
              <Cpu className="h-2.5 w-2.5" />
              On-device
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-[260px]">
            {detectionReason ||
              'Chrome Translator API (on-device, private, no network)'}
          </TooltipContent>
        </Tooltip>
      );
    }
    if (engine === 'remote') {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className="gap-1 text-[9px] px-1.5 py-0 h-4 border-sky-300 text-sky-700 bg-sky-50 cursor-help"
            >
              <Server className="h-2.5 w-2.5" />
              Remote
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs max-w-[300px]">
            <p className="mb-1">
              Usando MyMemory / Google (fallback remoto).
            </p>
            <p className="text-muted-foreground">
              {chromeVersion > 0
                ? `Chrome ${chromeVersion} detectado. `
                : 'Navegador no-Chrome. '}
              {detectionReason}
            </p>
          </TooltipContent>
        </Tooltip>
      );
    }
    return null;
  })();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-md border bg-muted/30">
        {/* Header row: label + language selector + engine badge */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b">
          <div className="flex items-center gap-1.5 min-w-0">
            <Languages className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-[11px] font-medium shrink-0">
              Traducción
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {engineBadge}
            <Select
              value={targetLang}
              onValueChange={(v) => setTargetLang(v)}
            >
              <SelectTrigger className="h-6 w-[110px] text-[11px] px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code} className="text-xs">
                    <span className="mr-1">{l.flag}</span>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Body: translation output or status */}
        <div className="px-2.5 py-2 min-h-[44px]">
          {status === 'translating' && (
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Traduciendo
              {engine === 'native' && availability === 'after-download' && (
                <span className="text-[10px]">(descargando modelo...)</span>
              )}
              ...
            </div>
          )}

          {status === 'error' && (
            <div className="text-[11px] text-red-600 py-1">
              {error || 'Error en la traducción'}
            </div>
          )}

          {(status === 'done' || status === 'idle') && translated && (
            <div className="space-y-1">
              <p
                data-testid="translation-output"
                className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap break-words"
              >
                {translated}
              </p>
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[9px] text-muted-foreground">
                  → {getLanguageName(targetLang)}
                  {triggerWord && (
                    <span className="ml-1">
                      · trigger &ldquo;{triggerWord}&rdquo; preservado
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy translation"
                >
                  {copied ? (
                    <>
                      <Check className="h-2.5 w-2.5 text-emerald-600" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-2.5 w-2.5" />
                      Copiar
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {status === 'idle' && !translated && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-1">
              La traducción aparecerá aquí automáticamente.
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
