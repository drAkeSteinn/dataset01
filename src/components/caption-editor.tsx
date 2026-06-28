'use client';

import { useState, useCallback, useRef } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { useUpdateCaption } from '@/hooks/use-images';

interface CaptionEditorProps {
  imageId: string;
  initialCaption: string;
}

export function CaptionEditor({ imageId, initialCaption }: CaptionEditorProps) {
  // Use a key-based approach: when imageId or initialCaption changes,
  // the component remounts with the new initial value.
  // This avoids the useEffect setState anti-pattern.
  return <CaptionEditorInner key={`${imageId}-${initialCaption}`} imageId={imageId} initialCaption={initialCaption} />;
}

function CaptionEditorInner({ imageId, initialCaption }: CaptionEditorProps) {
  const [caption, setCaption] = useState(initialCaption);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const updateCaption = useUpdateCaption();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wordCount = caption.trim() ? caption.trim().split(/\s+/).length : 0;
  const charCount = caption.length;

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

    // Debounced auto-save
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      saveCaption(value);
    }, 1000);
  };

  const handleBlur = () => {
    // Save on blur, cancel any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    saveCaption(caption);
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={caption}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="Enter caption text..."
        className="min-h-[120px] resize-y text-sm leading-relaxed"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {charCount} chars · {wordCount} words
        </span>
        <div className="flex items-center gap-1">
          {saveState === 'saving' && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
