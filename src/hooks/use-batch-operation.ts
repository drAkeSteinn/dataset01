'use client';

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/stores/app-store';
import type { BatchProgress, BatchResult, BatchError } from '@/types';

export function useBatchOperation() {
  const queryClient = useQueryClient();
  const abortControllerRef = useRef<AbortController | null>(null);
  const {
    batchOperation,
    startBatchOperation,
    updateBatchProgress,
    updateBatchCurrentFile,
    addBatchResult,
    addBatchError,
    finishBatchOperation,
    resetBatchOperation,
  } = useAppStore();

  const startOperation = useCallback(
    async (
      datasetId: string,
      type: 'analyze' | 'generate-captions' | 'regenerate',
      options?: { selectedOnly?: boolean; retryFailed?: boolean }
    ) => {
      // Cancel any existing operation
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const endpoint =
        type === 'analyze'
          ? `/api/datasets/${datasetId}/analyze`
          : `/api/datasets/${datasetId}/generate-captions`;

      // Build request body
      let body: Record<string, unknown> = {};
      if (type === 'regenerate') {
        body = { regenerate: true };
        if (options?.selectedOnly) {
          body.selectedOnly = true;
        }
        if (options?.retryFailed) {
          body.retryFailed = true;
        }
      }

      startBatchOperation(type, 0);

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: body && Object.keys(body).length > 0 ? { 'Content-Type': 'application/json' } : undefined,
          body: body && Object.keys(body).length > 0 ? JSON.stringify(body) : undefined,
          signal: abortController.signal,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          finishBatchOperation();
          throw new Error(data.error || `Failed to start ${type}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          finishBatchOperation();
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                const data = JSON.parse(line.slice(6));

                switch (currentEvent) {
                  case 'progress': {
                    const progress = data as BatchProgress;
                    updateBatchProgress(progress);
                    break;
                  }
                  case 'result': {
                    const result = data as BatchResult;
                    updateBatchCurrentFile(result.filename);
                    addBatchResult(result);
                    break;
                  }
                  case 'error': {
                    const error = data as BatchError;
                    updateBatchCurrentFile(error.filename);
                    addBatchError(error);
                    break;
                  }
                  case 'done': {
                    finishBatchOperation();
                    // Invalidate queries to refresh data
                    queryClient.invalidateQueries({ queryKey: ['images'] });
                    queryClient.invalidateQueries({ queryKey: ['images-infinite'] });
                    queryClient.invalidateQueries({ queryKey: ['datasets'] });
                    queryClient.invalidateQueries({ queryKey: ['dataset'] });
                    break;
                  }
                }
              } catch {
                // Ignore JSON parse errors
              }
              currentEvent = '';
            }
          }
        }

        finishBatchOperation();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          finishBatchOperation();
          return;
        }
        finishBatchOperation();
        throw error;
      }
    },
    [
      startBatchOperation,
      updateBatchProgress,
      updateBatchCurrentFile,
      addBatchResult,
      addBatchError,
      finishBatchOperation,
      queryClient,
    ]
  );

  const cancelOperation = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    // Mark as paused so the UI can show a "paused" message. The backend keeps
    // the regenerationPending flags for unprocessed images, so "Resume" works.
    useAppStore.getState().updateBatchProgress({
      ...useAppStore.getState().batchOperation.progress,
      message: 'Paused — click Resume to continue',
    });
    finishBatchOperation();
  }, [finishBatchOperation]);

  return {
    batchOperation,
    startOperation,
    cancelOperation,
    resetBatchOperation,
  };
}
