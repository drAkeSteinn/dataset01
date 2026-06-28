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
