'use client';

import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, ZoomIn, ZoomOut, ArrowUpDown, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GalleryImageCard } from '@/components/gallery-image-card';
import { useAppStore, type GallerySortKey } from '@/stores/app-store';
import { useDatasetImages, useUploadImages } from '@/hooks/use-images';
import { useDataset } from '@/hooks/use-datasets';
import { toast } from 'sonner';
import type { DatasetImage } from '@/types';

const SORT_OPTIONS: Array<{ value: GallerySortKey; label: string }> = [
  { value: 'name-asc', label: 'Name (A→Z)' },
  { value: 'name-desc', label: 'Name (Z→A)' },
  { value: 'date-newest', label: 'Newest first' },
  { value: 'date-oldest', label: 'Oldest first' },
  { value: 'size-largest', label: 'Largest file' },
  { value: 'caption-longest', label: 'Longest caption' },
  { value: 'caption-shortest', label: 'Shortest caption' },
];

function sortImages(images: DatasetImage[], sort: GallerySortKey): DatasetImage[] {
  const arr = [...images];
  switch (sort) {
    case 'name-asc':
      return arr.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
    case 'name-desc':
      return arr.sort((a, b) => b.filename.localeCompare(a.filename, undefined, { numeric: true }));
    case 'date-newest':
      return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case 'date-oldest':
      return arr.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case 'size-largest':
      return arr.sort((a, b) => b.fileSize - a.fileSize);
    case 'caption-longest':
      return arr.sort((a, b) => (b.caption?.length || 0) - (a.caption?.length || 0));
    case 'caption-shortest':
      return arr.sort((a, b) => (a.caption?.length || 0) - (b.caption?.length || 0));
    default:
      return arr;
  }
}

export function GalleryGrid() {
  const queryClient = useQueryClient();
  const {
    activeDatasetId,
    galleryFilter,
    setGalleryFilter,
    gallerySort,
    setGallerySort,
    galleryZoom,
    setGalleryZoom,
    selectedImageId,
    setSelectedImageId,
    setLightboxImageId,
  } = useAppStore();
  const { data: dataset } = useDataset(activeDatasetId);
  const { data: imagesData, isLoading } = useDatasetImages(
    activeDatasetId,
    galleryFilter,
    10000
  );
  const uploadImages = useUploadImages();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const images = useMemo(
    () => sortImages(imagesData?.images || [], gallerySort),
    [imagesData?.images, gallerySort]
  );

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !activeDatasetId) return;

      try {
        await uploadImages.mutateAsync({
          datasetId: activeDatasetId,
          files: Array.from(files),
        });
      } catch {
        // Error handled by mutation
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [activeDatasetId, uploadImages]
  );

  // --- Drag & drop ---
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (!activeDatasetId) return;

      const items = e.dataTransfer.items;
      const files: File[] = [];

      if (items && items.length > 0) {
        // Use webkitGetAsEntry to support folder drag-and-drop
        const entries: FileSystemEntry[] = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.();
            if (entry) {
              entries.push(entry);
            } else {
              const f = item.getAsFile();
              if (f) files.push(f);
            }
          }
        }
        if (entries.length > 0) {
          const collected = await collectFilesFromEntries(entries);
          files.push(...collected);
        }
      } else {
        const droppedFiles = e.dataTransfer.files;
        if (droppedFiles) {
          for (let i = 0; i < droppedFiles.length; i++) {
            files.push(droppedFiles[i]);
          }
        }
      }

      // Filter to image files only
      const imageFiles = files.filter((f) => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        return ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'avif', 'bmp', 'gif', 'svg'].includes(ext || '');
      });

      if (imageFiles.length === 0) {
        toast.error('No image files found in drop');
        return;
      }

      try {
        await uploadImages.mutateAsync({
          datasetId: activeDatasetId,
          files: imageFiles,
        });
      } catch {
        // handled by mutation
      }
    },
    [activeDatasetId, uploadImages]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if leaving the container itself (not a child)
    if (e.currentTarget === e.target) {
      setIsDragOver(false);
    }
  }, []);

  // --- Keyboard navigation (arrows to move selection) ---
  useEffect(() => {
    if (images.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      // Don't interfere when typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      // Don't interfere when a dialog is open
      if (document.querySelector('[role="dialog"]')) return;

      if (!selectedImageId) return;

      const idx = images.findIndex((img) => img.id === selectedImageId);
      if (idx < 0) return;

      let nextIdx: number | null = null;
      if (e.key === 'ArrowRight') {
        nextIdx = idx + 1 < images.length ? idx + 1 : null;
      } else if (e.key === 'ArrowLeft') {
        nextIdx = idx - 1 >= 0 ? idx - 1 : null;
      } else if (e.key === 'ArrowDown') {
        nextIdx = idx + galleryZoom < images.length ? idx + galleryZoom : null;
      } else if (e.key === 'ArrowUp') {
        nextIdx = idx - galleryZoom >= 0 ? idx - galleryZoom : null;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        setSelectedImageId(images[nextIdx].id);
        // Scroll the new card into view
        requestAnimationFrame(() => {
          const card = document.querySelector(`[data-image-id="${images[nextIdx!].id}"]`);
          card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [images, selectedImageId, setSelectedImageId, galleryZoom]);

  const statusFilters: Array<{ value: typeof galleryFilter; label: string; count: number }> = [
    { value: 'all', label: 'Todas', count: dataset?.stats?.total || 0 },
    { value: 'pending', label: 'Pendientes', count: dataset?.stats?.pending || 0 },
    { value: 'analyzed', label: 'Analizadas', count: dataset?.stats?.analyzed || 0 },
    { value: 'captioned', label: 'Con caption', count: dataset?.stats?.captioned || 0 },
    { value: 'error', label: 'Error', count: dataset?.stats?.error || 0 },
  ];

  const colClasses: Record<number, string> = {
    3: 'grid-cols-3',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
    6: 'grid-cols-6',
  };

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Filter + sort bar */}
      <div className="flex items-center justify-between border-b px-4 py-2.5 gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {statusFilters.map((filter) => (
            <Button
              key={filter.value}
              variant={galleryFilter === filter.value ? 'default' : 'ghost'}
              size="sm"
              className={
                galleryFilter === filter.value
                  ? 'h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-xs'
                  : 'h-7 text-xs text-muted-foreground'
              }
              onClick={() => setGalleryFilter(filter.value)}
            >
              {filter.label}
              <Badge
                variant="secondary"
                className={`ml-1.5 h-4 min-w-4 px-1 text-[10px] ${
                  galleryFilter === filter.value
                    ? 'bg-emerald-500/30 text-emerald-100'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {filter.count}
              </Badge>
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <Select value={gallerySort} onValueChange={(v) => setGallerySort(v as GallerySortKey)}>
            <SelectTrigger className="h-7 w-[150px] text-xs gap-1">
              <ArrowUpDown className="h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Zoom controls */}
          <div className="flex items-center gap-2">
            <ZoomOut className="h-3.5 w-3.5 text-muted-foreground" />
            <Slider
              value={[galleryZoom]}
              onValueChange={([v]) => setGalleryZoom(v)}
              min={3}
              max={6}
              step={1}
              className="w-20"
            />
            <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
          </div>

          {/* Upload button */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={!activeDatasetId || uploadImages.isPending}
          >
            {uploadImages.isPending ? (
              <div className="mr-1.5 h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-emerald-500" />
            ) : (
              <ImagePlus className="mr-1.5 h-3.5 w-3.5" />
            )}
            Subir
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/jpg,image/webp,image/avif,image/bmp,image/gif,image/svg+xml,image/jfif"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* Gallery grid with drag & drop */}
      <div
        className="flex-1 overflow-y-auto relative"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-20 m-4 rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50/90 dark:bg-emerald-950/40 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <UploadCloud className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Suelta imágenes o una carpeta para subir
              </p>
            </div>
          </div>
        )}

        {isLoading && (
          <div className={`grid ${colClasses[galleryZoom]} gap-2 p-4`}>
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
            ))}
          </div>
        )}

        {!isLoading && images.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="rounded-full bg-muted p-4">
              <ImagePlus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-medium">Aún no hay imágenes</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sube imágenes o importa desde una carpeta para empezar
            </p>
            {activeDatasetId && (
              <Button
                className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Subir imágenes
              </Button>
            )}
          </div>
        )}

        {!isLoading && images.length > 0 && (
          <div className={`grid ${colClasses[galleryZoom]} gap-2 p-4`}>
            {images.map((image) => (
              <div key={image.id} data-image-id={image.id}>
                <GalleryImageCard
                  image={image}
                  isSelected={selectedImageId === image.id}
                  onSelect={() => setSelectedImageId(image.id)}
                  onOpenLightbox={() => setLightboxImageId(image.id)}
                  onToggleSelect={async (selected) => {
                    try {
                      await fetch(`/api/images/${image.id}/select`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ selected }),
                      });
                      queryClient.invalidateQueries({ queryKey: ['images'] });
                    } catch (err) {
                      console.error('Failed to toggle selection:', err);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helpers for folder drag & drop ---

async function collectFilesFromEntries(
  entries: FileSystemEntry[]
): Promise<File[]> {
  const files: File[] = [];
  const stack: FileSystemEntry[] = [...entries];
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) => {
        (entry as FileSystemFileEntry).file(resolve, () => resolve(null));
      });
      if (file) files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children = await new Promise<FileSystemEntry[]>((resolve) => {
        const all: FileSystemEntry[] = [];
        const readBatch = () => {
          reader.readEntries(
            (batch) => {
              if (batch.length === 0) {
                resolve(all);
              } else {
                all.push(...batch);
                readBatch();
              }
            },
            () => resolve(all)
          );
        };
        readBatch();
      });
      stack.push(...children);
    }
  }
  return files;
}
