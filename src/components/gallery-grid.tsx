'use client';

import { useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ImagePlus, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { GalleryImageCard } from '@/components/gallery-image-card';
import { useAppStore } from '@/stores/app-store';
import { useDatasetImages, useUploadImages } from '@/hooks/use-images';
import { useDataset } from '@/hooks/use-datasets';

export function GalleryGrid() {
  const queryClient = useQueryClient();
  const { activeDatasetId, galleryFilter, setGalleryFilter, galleryZoom, setGalleryZoom, selectedImageId, setSelectedImageId } = useAppStore();
  const { data: dataset } = useDataset(activeDatasetId);
  const { data: imagesData, isLoading } = useDatasetImages(
    activeDatasetId,
    galleryFilter,
    200
  );
  const uploadImages = useUploadImages();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const images = imagesData?.images || [];

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

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [activeDatasetId, uploadImages]
  );

  const statusFilters: Array<{ value: typeof galleryFilter; label: string; count: number }> = [
    { value: 'all', label: 'All', count: dataset?.stats?.total || 0 },
    { value: 'pending', label: 'Pending', count: dataset?.stats?.pending || 0 },
    { value: 'analyzed', label: 'Analyzed', count: dataset?.stats?.analyzed || 0 },
    { value: 'captioned', label: 'Captioned', count: dataset?.stats?.captioned || 0 },
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
      {/* Filter bar */}
      <div className="flex items-center justify-between border-b px-4 py-2.5">
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

        <div className="flex items-center gap-3">
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
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* Gallery grid */}
      <div className="flex-1 overflow-y-auto">
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
            <h3 className="mt-4 text-lg font-medium">No images yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload images or import from a folder to get started
            </p>
            {activeDatasetId && (
              <Button
                className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Upload Images
              </Button>
            )}
          </div>
        )}

        {!isLoading && images.length > 0 && (
          <div className={`grid ${colClasses[galleryZoom]} gap-2 p-4`}>
            {images.map((image) => (
              <GalleryImageCard
                key={image.id}
                image={image}
                isSelected={selectedImageId === image.id}
                onSelect={() => setSelectedImageId(image.id)}
                onToggleSelect={async (selected) => {
                  try {
                    await fetch(`/api/images/${image.id}/select`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ selected }),
                    });
                    // Invalidate to refresh
                    queryClient.invalidateQueries({ queryKey: ['images'] });
                  } catch (err) {
                    console.error('Failed to toggle selection:', err);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
