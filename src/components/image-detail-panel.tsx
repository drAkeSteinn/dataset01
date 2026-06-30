'use client';

import { useState, useMemo, useRef } from 'react';
import {
  Settings,
  ChevronDown,
  ChevronRight,
  Palette,
  FileImage,
  HardDrive,
  Maximize2,
  RotateCcw,
  Loader2,
  FileText,
  History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CaptionEditor } from '@/components/caption-editor';
import { DatasetSettingsDialog } from '@/components/dataset-settings-dialog';
import { useAppStore } from '@/stores/app-store';
import { useDataset } from '@/hooks/use-datasets';
import { useDatasetImages, useUpdateCaption, useRegenerateCaption } from '@/hooks/use-images';
import { cn } from '@/lib/utils';
import type { ImageStatus, ColorInfo, DatasetImage } from '@/types';

const statusConfig: Record<ImageStatus, { label: string; className: string }> = {
  pending: { label: 'Pending', className: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
  analyzing: { label: 'Analyzing', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  analyzed: { label: 'Analyzed', className: 'bg-sky-100 text-sky-700 border-sky-200' },
  captioned: { label: 'Captioned', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  error: { label: 'Error', className: 'bg-red-100 text-red-700 border-red-200' },
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function ColorSwatch({ colorInfo }: { colorInfo: string }) {
  const colors = useMemo(() => {
    try {
      return JSON.parse(colorInfo) as ColorInfo;
    } catch {
      return null;
    }
  }, [colorInfo]);

  if (!colors) return null;

  const avgColor = `rgb(${Math.round(colors.avgR)}, ${Math.round(colors.avgG)}, ${Math.round(colors.avgB)})`;

  return (
    <div className="flex items-center gap-2">
      <div
        className="h-6 w-6 rounded-full border border-border shadow-sm"
        style={{ backgroundColor: avgColor }}
        title={`Avg: RGB(${Math.round(colors.avgR)}, ${Math.round(colors.avgG)}, ${Math.round(colors.avgB)})`}
      />
      {colors.dominant && (
        <span className="text-xs text-muted-foreground">{colors.dominant}</span>
      )}
      {colors.palette && (
        <div className="flex gap-1">
          {colors.palette.slice(0, 5).map((color, i) => (
            <div
              key={i}
              className="h-4 w-4 rounded-full border border-border"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ImageDetailPanel() {
  const { activeDatasetId, selectedImageId } = useAppStore();
  const { data: dataset } = useDataset(activeDatasetId);
  const { data: imagesData } = useDatasetImages(activeDatasetId, 'all', 10000);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const selectedImage = imagesData?.images.find((img) => img.id === selectedImageId) || null;

  return (
    <div className="flex h-full flex-col bg-background border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Detalle</h2>
          {dataset && (
            <span className="text-xs text-muted-foreground">— {dataset.name}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowSettings(true)}
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>

      {!selectedImage ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <FileImage className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              Selecciona una imagen para ver sus detalles
            </p>
          </div>
        </div>
      ) : (
        <ImageDetailContent
          key={selectedImage.id}
          image={selectedImage}
          triggerWord={dataset?.triggerWord}
          analysisOpen={analysisOpen}
          setAnalysisOpen={setAnalysisOpen}
        />
      )}

      <DatasetSettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
      />
    </div>
  );
}

function ImageDetailContent({
  image,
  triggerWord,
  analysisOpen,
  setAnalysisOpen,
}: {
  image: DatasetImage;
  triggerWord?: string;
  analysisOpen: boolean;
  setAnalysisOpen: (v: boolean) => void;
}) {
  const config = statusConfig[image.status];
  const updateCaption = useUpdateCaption();
  const regenerateCaption = useRegenerateCaption();

  // Image description state (per-image notes for caption generation)
  // Component remounts on image change (via key prop), so initial state is always fresh
  const [imageDescription, setImageDescription] = useState(image.imageDescription || '');
  const [descSaving, setDescSaving] = useState(false);
  const [descSaved, setDescSaved] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Before/after caption history for the regenerate diff view.
  // previousCaption holds the caption that was there before the last regenerate.
  const [previousCaption, setPreviousCaption] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  // Per-image trigger word override (multi-concept support).
  const [triggerOverride, setTriggerOverride] = useState(image.triggerWordOverride || '');

  const handleSaveDescription = async (text?: string) => {
    const value = text ?? imageDescription;
    // Always save if there's content
    if (!value.trim()) return;

    setDescSaving(true);
    try {
      await updateCaption.mutateAsync({
        imageId: image.id,
        imageDescription: value,
      });
      setDescSaved(true);
      setTimeout(() => setDescSaved(false), 1500);
    } catch {
      // Error handled by mutation
    } finally {
      setDescSaving(false);
    }
  };

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setImageDescription(value);
    setDescSaved(false);

    // Debounced auto-save (1.5s after user stops typing)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      handleSaveDescription(value);
    }, 1500);
  };

  const handleBlurDescription = () => {
    // Save immediately on blur, cancel pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    handleSaveDescription();
  };

  const handleSaveTriggerOverride = async () => {
    if (triggerOverride === (image.triggerWordOverride || '')) return;
    try {
      await updateCaption.mutateAsync({
        imageId: image.id,
        triggerWordOverride: triggerOverride,
      });
    } catch {
      // handled by mutation
    }
  };

  const handleRegenerate = async () => {
    // Save description first if changed, then regenerate
    try {
      if (imageDescription !== (image.imageDescription || '')) {
        await updateCaption.mutateAsync({
          imageId: image.id,
          imageDescription,
        });
      }
      // Capture the current caption as "previous" for the before/after diff.
      const captionBefore = image.caption || '';
      const result = await regenerateCaption.mutateAsync({ imageId: image.id });
      // Show the diff only if the caption actually changed.
      if (captionBefore && result.caption && captionBefore !== result.caption) {
        setPreviousCaption(captionBefore);
        setShowDiff(true);
      }
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Image preview */}
        <div className="relative overflow-hidden rounded-lg border bg-muted">
            <img
            src={`/api/images/${image.id}/file`}
            alt={image.filename}
            className="w-full object-contain max-h-72"
          />
        </div>

        {/* File info */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium truncate" title={image.filename}>
            {image.filename}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn('text-xs', config.className)}>
              {config.label}
            </Badge>
            {image.width > 0 && image.height > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Maximize2 className="h-3 w-3" />
                {image.width} × {image.height}
              </span>
            )}
            {image.fileSize > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <HardDrive className="h-3 w-3" />
                {formatFileSize(image.fileSize)}
              </span>
            )}
          </div>

          {/* Per-image trigger word override (multi-concept support) */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-muted-foreground">
                Trigger word
              </span>
              {triggerOverride && triggerOverride !== (triggerWord || '') && (
                <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-300 text-amber-600 bg-amber-50">
                  override
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={triggerOverride}
                onChange={(e) => setTriggerOverride(e.target.value)}
                onBlur={handleSaveTriggerOverride}
                placeholder={triggerWord ? `(dataset) ${triggerWord}` : 'No trigger word'}
                className="flex-1 h-7 rounded-md border border-input bg-transparent px-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                title="Per-image trigger word override. Leave empty to use the dataset's trigger word."
              />
            </div>
            <p className="text-[9px] text-muted-foreground">
              Override the dataset trigger for this image (multi-concept support).
              Leave empty to use the dataset default.
            </p>
          </div>
        </div>

        {/* Color info */}
        {image.colorInfo && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Colores</span>
            </div>
            <ColorSwatch colorInfo={image.colorInfo} />
          </div>
        )}

        <Separator />

        {/* Image description (per-image notes for caption generation) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Notas de la imagen</span>
            </div>
            {descSaving && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Guardando...
              </span>
            )}
            {descSaved && (
              <span className="text-[10px] text-emerald-600">Guardado</span>
            )}
          </div>
          <Textarea
            value={imageDescription}
            onChange={handleDescriptionChange}
            onBlur={handleBlurDescription}
            placeholder="Agrega notas sobre esta imagen para guiar la generación del caption (ej. 'enfocar en el pelo rojo y orejas de gato', 'el personaje sonríe', 'escena interior de dormitorio')..."
            className="min-h-[70px] resize-y text-xs leading-relaxed"
          />
          <p className="text-[10px] text-muted-foreground">
            Esta descripción se envía al LLM junto con la descripción del dataset para ayudar a generar un mejor caption para esta imagen específica.
          </p>
        </div>

        <Separator />

        {/* VLM Analysis */}
        {image.vlmAnalysis && (
          <Collapsible open={analysisOpen} onOpenChange={setAnalysisOpen}>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              {analysisOpen ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              Análisis VLM
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {image.vlmAnalysis}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Error message */}
        {image.errorMessage && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-xs text-red-600">{image.errorMessage}</p>
          </div>
        )}

        <Separator />

        {/* Caption editor with regenerate button */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Caption</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs gap-1.5"
              onClick={handleRegenerate}
              disabled={regenerateCaption.isPending || updateCaption.isPending}
            >
              {regenerateCaption.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCcw className="h-3 w-3" />
              )}
              Regenerar
            </Button>
          </div>
          <CaptionEditor
            imageId={image.id}
            initialCaption={image.caption}
            triggerWord={triggerWord}
          />
          {regenerateCaption.isPending && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generando caption con el proveedor del dataset...
            </p>
          )}

          {/* Before/after diff view (shown after a regenerate that changed the caption) */}
          {previousCaption && showDiff && (
            <div className="rounded-md border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/20 p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-sky-700 dark:text-sky-300 flex items-center gap-1">
                  <History className="h-3 w-3" />
                  Before / After
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      // Revert: restore the previous caption
                      updateCaption.mutateAsync({
                        imageId: image.id,
                        caption: previousCaption,
                      });
                      setPreviousCaption(null);
                      setShowDiff(false);
                    }}
                    className="text-[9px] text-amber-600 hover:text-amber-700 underline"
                    title="Restore the previous caption"
                  >
                    Revert
                  </button>
                  <button
                    onClick={() => setShowDiff(false)}
                    className="text-[9px] text-muted-foreground hover:text-foreground ml-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1">
                <div className="rounded border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 p-1.5">
                  <p className="text-[9px] uppercase tracking-wide text-red-600 dark:text-red-400 mb-0.5">
                    Before
                  </p>
                  <p className="text-[10px] leading-relaxed text-muted-foreground line-clamp-3">
                    {previousCaption}
                  </p>
                </div>
                <div className="rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 p-1.5">
                  <p className="text-[9px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-0.5">
                    After
                  </p>
                  <p className="text-[10px] leading-relaxed text-foreground line-clamp-3">
                    {image.caption}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
