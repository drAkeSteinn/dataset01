'use client';

import { useEffect, useMemo, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useAppStore } from '@/stores/app-store';
import { useDatasetImages } from '@/hooks/use-images';

/**
 * Full-size image viewer (lightbox).
 *
 * Opened when `lightboxImageId` is set in the store. Supports:
 *   - Arrow keys ← / → to navigate
 *   - Escape to close
 *   - Click outside or X button to close
 *   - Download button
 */
export function Lightbox() {
  const {
    lightboxImageId,
    setLightboxImageId,
    activeDatasetId,
  } = useAppStore();
  const { data: imagesData } = useDatasetImages(activeDatasetId, 'all', 10000);

  const images = imagesData?.images || [];
  const currentIndex = useMemo(
    () => images.findIndex((img) => img.id === lightboxImageId),
    [images, lightboxImageId]
  );
  const image = currentIndex >= 0 ? images[currentIndex] : null;

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setLightboxImageId(images[currentIndex - 1].id);
    }
  }, [currentIndex, images, setLightboxImageId]);

  const goNext = useCallback(() => {
    if (currentIndex >= 0 && currentIndex < images.length - 1) {
      setLightboxImageId(images[currentIndex + 1].id);
    }
  }, [currentIndex, images, setLightboxImageId]);

  const close = useCallback(() => setLightboxImageId(null), [setLightboxImageId]);

  // Keyboard navigation
  useEffect(() => {
    if (!lightboxImageId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxImageId, close, goPrev, goNext]);

  if (!lightboxImageId || !image) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      {/* Top bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{image.filename}</p>
          <p className="text-[10px] text-white/60">
            {currentIndex + 1} / {images.length}
            {image.width > 0 && image.height > 0 && (
              <span className="ml-2">
                · {image.width} × {image.height}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <a
            href={`/api/images/${image.id}/file`}
            download={image.filename}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            title="Download"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            onClick={close}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            title="Close (Esc)"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Prev / Next */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          title="Previous (←)"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          title="Next (→)"
          aria-label="Next image"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Image */}
      <img
        src={`/api/images/${image.id}/file`}
        alt={image.filename}
        className="max-h-[90vh] max-w-[95vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
