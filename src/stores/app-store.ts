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

  // Gallery zoom (columns: 3-6)
  galleryZoom: number;
  setGalleryZoom: (zoom: number) => void;

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

  // Gallery zoom
  galleryZoom: 4,
  setGalleryZoom: (zoom) => set({ galleryZoom: Math.min(6, Math.max(3, zoom)) }),

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
