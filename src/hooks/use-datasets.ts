'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Dataset, CreateDatasetInput, UpdateDatasetInput } from '@/types';

async function fetchDatasets(): Promise<Dataset[]> {
  const res = await fetch('/api/datasets');
  if (!res.ok) throw new Error('Failed to fetch datasets');
  return res.json();
}

async function fetchDataset(id: string): Promise<Dataset> {
  const res = await fetch(`/api/datasets/${id}`);
  if (!res.ok) throw new Error('Failed to fetch dataset');
  return res.json();
}

async function createDataset(input: CreateDatasetInput): Promise<Dataset> {
  const res = await fetch('/api/datasets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to create dataset');
  }
  return res.json();
}

async function updateDataset({ id, ...input }: UpdateDatasetInput & { id: string }): Promise<Dataset> {
  const res = await fetch(`/api/datasets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to update dataset');
  }
  return res.json();
}

async function deleteDataset(id: string): Promise<void> {
  const res = await fetch(`/api/datasets/${id}?deleteFiles=true`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete dataset');
  }
}

export function useDatasets() {
  return useQuery({
    queryKey: ['datasets'],
    queryFn: fetchDatasets,
  });
}

export interface DatasetStats {
  datasetId: string;
  datasetName: string;
  totalImages: number;
  totalCaptionFiles: number;
  totalUniqueTags: number;
  captionLength: {
    min: number;
    max: number;
    avg: number;
    median: number;
    distribution: Array<{ label: string; count: number }>;
  };
  topTags: Array<{ tag: string; count: number }>;
  rareTagsCount: number;
  statusBreakdown: {
    total: number;
    pending: number;
    analyzing: number;
    analyzed: number;
    captioned: number;
    error: number;
  };
  dimensionBuckets: Record<string, number>;
  withoutCaption: number;
  withoutNotes: number;
  withVlmAnalysis: number;
}

async function fetchDatasetStats(id: string): Promise<DatasetStats> {
  const res = await fetch(`/api/datasets/${id}/stats`);
  if (!res.ok) throw new Error('Failed to fetch dataset stats');
  return res.json();
}

export function useDatasetStats(datasetId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['dataset-stats', datasetId],
    queryFn: () => fetchDatasetStats(datasetId!),
    enabled: !!datasetId && enabled,
  });
}

// --- Provider health check ---

async function testProviderHealth(
  provider: string,
  endpoint?: string,
  model?: string
): Promise<{ success: boolean; message: string }> {
  const res = await fetch('/api/llm/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, endpoint, model }),
  });
  if (!res.ok) {
    return { success: false, message: 'Health check failed' };
  }
  return res.json();
}

/**
 * Periodically checks whether the dataset's LLM provider is reachable.
 * Polls every 60s (the check is cheap). Returns null while loading.
 */
export function useProviderHealth(
  datasetId: string | null,
  provider: string | undefined,
  endpoint: string | undefined,
  model: string | undefined
) {
  return useQuery({
    queryKey: ['provider-health', datasetId, provider, endpoint, model],
    queryFn: () => testProviderHealth(provider!, endpoint, model),
    enabled: !!datasetId && !!provider,
    refetchInterval: 60000, // re-check every 60s
    staleTime: 45000,
    retry: false,
  });
}

// --- Duplicate detection ---

export interface DuplicateGroup {
  distance?: number;
  images: Array<{ id: string; filename: string }>;
}

export interface DatasetDuplicates {
  datasetId: string;
  totalImages: number;
  totalHashed: number;
  threshold: number;
  imageDuplicateGroups: DuplicateGroup[];
  captionDuplicateGroups: DuplicateGroup[];
  totalImageDuplicates: number;
  totalCaptionDuplicates: number;
}

async function fetchDatasetDuplicates(
  id: string,
  threshold: number
): Promise<DatasetDuplicates> {
  const res = await fetch(`/api/datasets/${id}/duplicates?threshold=${threshold}`);
  if (!res.ok) throw new Error('Failed to fetch duplicates');
  return res.json();
}

export function useDatasetDuplicates(
  datasetId: string | null,
  threshold: number,
  enabled = false
) {
  return useQuery({
    queryKey: ['dataset-duplicates', datasetId, threshold],
    queryFn: () => fetchDatasetDuplicates(datasetId!, threshold),
    enabled: !!datasetId && enabled,
    staleTime: 300000, // 5 min — hashing is expensive
  });
}

export function useDataset(id: string | null) {
  return useQuery({
    queryKey: ['dataset', id],
    queryFn: () => fetchDataset(id!),
    enabled: !!id,
    refetchInterval: 30000,
  });
}

export function useCreateDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Dataset created successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      queryClient.invalidateQueries({ queryKey: ['dataset'] });
      toast.success('Settings saved');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      toast.success('Dataset deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
