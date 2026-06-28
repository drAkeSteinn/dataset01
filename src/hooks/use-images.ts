'use client';

import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { PaginatedImages, DatasetImage, ImageStatus } from '@/types';

async function fetchDatasetImages(
  datasetId: string,
  page: number,
  limit: number,
  status: ImageStatus | 'all'
): Promise<PaginatedImages> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  if (status !== 'all') {
    params.set('status', status);
  }
  const res = await fetch(`/api/datasets/${datasetId}/images?${params}`);
  if (!res.ok) throw new Error('Failed to fetch images');
  return res.json();
}

async function updateCaption({
  imageId,
  caption,
  imageDescription,
}: {
  imageId: string;
  caption?: string;
  imageDescription?: string;
}): Promise<DatasetImage> {
  const body: Record<string, string> = {};
  if (typeof caption === 'string') body.caption = caption;
  if (typeof imageDescription === 'string') body.imageDescription = imageDescription;

  const res = await fetch(`/api/images/${imageId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('Failed to update image');
  return res.json();
}

async function regenerateCaption({
  imageId,
  imageDescription,
}: {
  imageId: string;
  imageDescription?: string;
}): Promise<{ success: boolean; image: DatasetImage; caption: string }> {
  const res = await fetch(`/api/images/${imageId}/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(imageDescription !== undefined ? { imageDescription } : {}),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to regenerate caption');
  }
  return res.json();
}

async function deleteImage(imageId: string): Promise<void> {
  const res = await fetch(`/api/images/${imageId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to delete image');
  }
}

async function fetchTags(
  datasetId: string,
  search?: string
): Promise<{ type: string; tags?: Array<{ tag: string; count: number }>; results?: Array<{ filename: string; caption: string }>; totalUniqueTags?: number; count?: number }> {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  const res = await fetch(`/api/datasets/${datasetId}/tags?${params}`);
  if (!res.ok) throw new Error('Failed to fetch tags');
  return res.json();
}

async function manageTags({
  datasetId,
  action,
  tag,
  position,
}: {
  datasetId: string;
  action: 'add' | 'remove';
  tag: string;
  position?: 'start' | 'end';
}): Promise<{ success: boolean; modified: number; message: string }> {
  const res = await fetch(`/api/datasets/${datasetId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, tag, position }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to manage tags');
  }
  return res.json();
}

async function uploadImages({
  datasetId,
  files,
}: {
  datasetId: string;
  files: File[];
}): Promise<{ uploaded: number; images: Array<{ id: string; filename: string; datasetId: string; status: string }> }> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const res = await fetch(`/api/datasets/${datasetId}/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to upload images');
  }
  return res.json();
}

async function importFromFolder({
  datasetId,
  folderPath,
}: {
  datasetId: string;
  folderPath: string;
}): Promise<{ imported: number; skipped: number; total: number }> {
  const res = await fetch(`/api/datasets/${datasetId}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderPath }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to import images');
  }
  return res.json();
}

export function useDatasetImages(
  datasetId: string | null,
  status: ImageStatus | 'all' = 'all',
  limit = 50
) {
  return useQuery({
    queryKey: ['images', datasetId, status, limit],
    queryFn: () => fetchDatasetImages(datasetId!, 1, limit, status),
    enabled: !!datasetId,
  });
}

export function useDatasetImagesInfinite(
  datasetId: string | null,
  status: ImageStatus | 'all' = 'all',
  limit = 50
) {
  return useInfiniteQuery({
    queryKey: ['images-infinite', datasetId, status, limit],
    queryFn: ({ pageParam }) =>
      fetchDatasetImages(datasetId!, pageParam, limit, status),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: !!datasetId,
  });
}

export function useUpdateCaption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCaption,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['images-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dataset'] });
    },
  });
}

export function useRegenerateCaption() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: regenerateCaption,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['images-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['dataset'] });
      toast.success('Caption regenerated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useUploadImages() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: uploadImages,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['images-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      queryClient.invalidateQueries({ queryKey: ['dataset'] });
      toast.success(`Uploaded ${data.uploaded} image(s)`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useImportFromFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: importFromFolder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['images-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      queryClient.invalidateQueries({ queryKey: ['dataset'] });
    },
  });
}

export function useDeleteImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteImage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['images-infinite'] });
      queryClient.invalidateQueries({ queryKey: ['datasets'] });
      queryClient.invalidateQueries({ queryKey: ['dataset'] });
      toast.success('Image deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useTags(datasetId: string | null, search?: string) {
  return useQuery({
    queryKey: ['tags', datasetId, search],
    queryFn: () => fetchTags(datasetId!, search),
    enabled: !!datasetId,
  });
}

export function useManageTags() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: manageTags,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tags', variables.datasetId] });
      queryClient.invalidateQueries({ queryKey: ['images'] });
      queryClient.invalidateQueries({ queryKey: ['dataset'] });
      toast.success(data.message);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
