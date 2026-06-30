import { create } from 'zustand';
import type { ImageStatus, BatchOperationState, BatchProgress, BatchResult, BatchError } from '@/types';

interface AppState {
  // Dataset selection
  activeDatasetId: string | null;
  setActiveDatasetId: (id: string | null) => void;

  // Image selection
  selectedImageId: string | null;
  setSelectedImageId: (id: string | null) => void;

  // Center view (gallery or tags)
  centerView: 'gallery' | 'tags';
  setCenterView: (view: 'gallery' | 'tags') => void;

  // Gallery filter
  galleryFilter: ImageStatus | 'all';
  setGalleryFilter: (filter: ImageStatus | 'all') => void;

  // Gallery sort order
  gallerySort: GallerySortKey;
  setGallerySort: (sort: GallerySortKey) => void;

  // Gallery zoom (columns: 3-6)
  galleryZoom: number;
  setGalleryZoom: (zoom: number) => void;

  // Lightbox (full-size image viewer)
  lightboxImageId: string | null;
  setLightboxImageId: (id: string | null) => void;

  // Caption highlight — when set, the detail panel highlights this text in the
  // caption editor (e.g. after clicking a search result in Tags > Search).
  captionHighlight: string | null;
  setCaptionHighlight: (text: string | null) => void;

  // Batch operation
  batchOperation: BatchOperationState;
  startBatchOperation: (type: 'analyze' | 'generate-captions' | 'regenerate', total: number) => void;
  updateBatchProgress: (progress: BatchProgress) => void;
  updateBatchCurrentFile: (filename: string) => void;
  addBatchResult: (result: BatchResult) => void;
  addBatchError: (error: BatchError) => void;
  finishBatchOperation: () => void;
  resetBatchOperation: () => void;
}

export type GallerySortKey =
  | 'name-asc'
  | 'name-desc'
  | 'date-newest'
  | 'date-oldest'
  | 'size-largest'
  | 'caption-longest'
  | 'caption-shortest';

const initialBatchState: BatchOperationState = {
  isRunning: false,
  type: null,
  progress: { processed: 0, total: 0 },
  currentFile: '',
  errors: [],
  results: [],
};

export const useAppStore = create<AppState>((set) => ({
  // Dataset selection
  activeDatasetId: null,
  setActiveDatasetId: (id) => set({ activeDatasetId: id, selectedImageId: null }),

  // Image selection
  selectedImageId: null,
  setSelectedImageId: (id) => set({ selectedImageId: id }),

  // Center view
  centerView: 'gallery',
  setCenterView: (view) => set({ centerView: view }),

  // Gallery filter
  galleryFilter: 'all',
  setGalleryFilter: (filter) => set({ galleryFilter: filter }),

  // Gallery sort
  gallerySort: 'name-asc',
  setGallerySort: (sort) => set({ gallerySort: sort }),

  // Gallery zoom
  galleryZoom: 4,
  setGalleryZoom: (zoom) => set({ galleryZoom: Math.min(6, Math.max(3, zoom)) }),

  // Lightbox
  lightboxImageId: null,
  setLightboxImageId: (id) => set({ lightboxImageId: id }),

  // Caption highlight
  captionHighlight: null,
  setCaptionHighlight: (text) => set({ captionHighlight: text }),

  // Batch operation
  batchOperation: initialBatchState,
  startBatchOperation: (type, total) =>
    set({
      batchOperation: {
        isRunning: true,
        type,
        progress: { processed: 0, total },
        currentFile: '',
        errors: [],
        results: [],
      },
    }),
  updateBatchProgress: (progress) =>
    set((state) => ({
      batchOperation: { ...state.batchOperation, progress },
    })),
  updateBatchCurrentFile: (filename) =>
    set((state) => ({
      batchOperation: { ...state.batchOperation, currentFile: filename },
    })),
  addBatchResult: (result) =>
    set((state) => ({
      batchOperation: {
        ...state.batchOperation,
        results: [...state.batchOperation.results, result],
      },
    })),
  addBatchError: (error) =>
    set((state) => ({
      batchOperation: {
        ...state.batchOperation,
        errors: [...state.batchOperation.errors, error],
      },
    })),
  finishBatchOperation: () =>
    set((state) => ({
      batchOperation: { ...state.batchOperation, isRunning: false },
    })),
  resetBatchOperation: () =>
    set({ batchOperation: initialBatchState }),
}));
