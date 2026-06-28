'use client';

import { useState } from 'react';
import { Trash2, Loader2, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDeleteImage } from '@/hooks/use-images';
import type { DatasetImage, ImageStatus } from '@/types';

interface GalleryImageCardProps {
  image: DatasetImage;
  isSelected: boolean;
  onSelect: () => void;
  onToggleSelect: (selected: boolean) => void;
}

const statusConfig: Record<ImageStatus, { label: string; className: string }> = {
  pending: {
    label: 'Pending',
    className: 'bg-zinc-500/80 text-white border-zinc-400',
  },
  analyzing: {
    label: 'Analyzing',
    className: 'bg-yellow-500/80 text-white border-yellow-400',
  },
  analyzed: {
    label: 'Analyzed',
    className: 'bg-sky-500/80 text-white border-sky-400',
  },
  captioned: {
    label: 'Captioned',
    className: 'bg-emerald-500/80 text-white border-emerald-400',
  },
  error: {
    label: 'Error',
    className: 'bg-red-500/80 text-white border-red-400',
  },
};

export function GalleryImageCard({ image, isSelected, onSelect, onToggleSelect }: GalleryImageCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteImage = useDeleteImage();
  const config = statusConfig[image.status];

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDelete(true);
  };

  const handleConfirmDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    deleteImage.mutate(image.id);
    setConfirmDelete(false);
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setConfirmDelete(false);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onToggleSelect(!image.selectedForRegen);
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative overflow-hidden rounded-lg border-2 transition-all duration-150 cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/10'
          : 'border-transparent hover:border-zinc-300',
        image.selectedForRegen && !isSelected && 'border-amber-400 ring-1 ring-amber-300/50'
      )}
    >
      {/* Image */}
      <div className="aspect-[3/4] w-full bg-muted">
        {!error && (
          <img
            src={`/api/images/${image.id}/file`}
            alt={image.filename}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setError(true)}
            className={cn(
              'h-full w-full object-cover transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0'
            )}
          />
        )}
        {error && (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-muted-foreground">Failed to load</span>
          </div>
        )}
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-emerald-500" />
          </div>
        )}
      </div>

      {/* Caption overlay */}
      {image.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-2 pt-6">
          <p className="line-clamp-2 text-[10px] leading-tight text-white/90">
            {image.caption}
          </p>
        </div>
      )}

      {/* Status badge */}
      <div className="absolute top-1.5 right-1.5">
        <Badge
          className={cn(
            'h-4 px-1.5 text-[9px] font-medium border backdrop-blur-sm',
            config.className
          )}
        >
          {config.label}
        </Badge>
      </div>

      {/* Selection checkbox (top-left, always visible) */}
      <button
        onClick={handleCheckboxClick}
        className={cn(
          'absolute top-1.5 left-1.5 h-6 w-6 rounded-full flex items-center justify-center transition-all border-2 backdrop-blur-sm',
          image.selectedForRegen
            ? 'bg-amber-500 border-amber-400 text-white shadow-md'
            : 'bg-black/40 border-white/60 text-transparent hover:bg-black/60 hover:border-white',
          !confirmDelete && 'opacity-0 group-hover:opacity-100',
          image.selectedForRegen && 'opacity-100'
        )}
        title={image.selectedForRegen ? 'Selected for regeneration' : 'Select for regeneration'}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
      </button>

      {/* Delete button (shows on hover, not during confirm, not when selected) */}
      {!confirmDelete && !image.selectedForRegen && (
        <Button
          size="icon"
          variant="destructive"
          className="absolute top-9 left-1.5 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleDeleteClick}
          disabled={deleteImage.isPending}
          title="Delete image"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}

      {/* Confirm delete overlay */}
      {confirmDelete && (
        <div
          className="absolute inset-0 bg-red-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-2 p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <AlertTriangle className="h-6 w-6 text-red-300" />
          <p className="text-[10px] text-white text-center font-medium">
            Delete this image?
          </p>
          <p className="text-[9px] text-red-200 text-center">
            .png and .txt will be removed
          </p>
          <div className="flex gap-1.5 mt-1">
            <Button
              size="sm"
              variant="destructive"
              className="h-6 px-2 text-[10px]"
              onClick={handleConfirmDelete}
              disabled={deleteImage.isPending}
            >
              {deleteImage.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                'Delete'
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] text-white hover:bg-white/20"
              onClick={handleCancelDelete}
              disabled={deleteImage.isPending}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
