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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  const { data: imagesData } = useDatasetImages(activeDatasetId, 'all', 200);
  const [analysisOpen, setAnalysisOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const selectedImage = imagesData?.images.find((img) => img.id === selectedImageId) || null;

  return (
    <div className="flex h-full flex-col bg-background border-l">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Detail</h2>
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
              Select an image to view details
            </p>
          </div>
        </div>
      ) : (
        <ImageDetailContent
          key={selectedImage.id}
          image={selectedImage}
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
  analysisOpen,
  setAnalysisOpen,
}: {
  image: DatasetImage;
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

  const handleRegenerate = async () => {
    // Save description first if changed, then regenerate
    try {
      if (imageDescription !== (image.imageDescription || '')) {
        await updateCaption.mutateAsync({
          imageId: image.id,
          imageDescription,
        });
      }
      await regenerateCaption.mutateAsync({ imageId: image.id });
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <ScrollArea className="flex-1">
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
        </div>

        {/* Color info */}
        {image.colorInfo && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Colors</span>
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
              <span className="text-xs font-medium">Image Notes</span>
            </div>
            {descSaving && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </span>
            )}
            {descSaved && (
              <span className="text-[10px] text-emerald-600">Saved</span>
            )}
          </div>
          <Textarea
            value={imageDescription}
            onChange={handleDescriptionChange}
            onBlur={handleBlurDescription}
            placeholder="Add notes about this image to guide caption generation (e.g. 'focus on the red hair and cat ears', 'character is smiling', 'indoor bedroom scene')..."
            className="min-h-[70px] resize-y text-xs leading-relaxed"
          />
          <p className="text-[10px] text-muted-foreground">
            This description is sent to the LLM along with the dataset description to help generate a better caption for this specific image.
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
              VLM Analysis
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
              Regenerate
            </Button>
          </div>
          <CaptionEditor
            imageId={image.id}
            initialCaption={image.caption}
          />
          {regenerateCaption.isPending && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating caption using dataset provider...
            </p>
          )}
        </div>
      </div>
    </ScrollArea>
  );
}
