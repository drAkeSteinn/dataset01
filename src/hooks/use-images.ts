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
  triggerWordOverride,
}: {
  imageId: string;
  caption?: string;
  imageDescription?: string;
  triggerWordOverride?: string;
}): Promise<DatasetImage> {
  const body: Record<string, string> = {};
  if (typeof caption === 'string') body.caption = caption;
  if (typeof imageDescription === 'string') body.imageDescription = imageDescription;
  if (typeof triggerWordOverride === 'string') body.triggerWordOverride = triggerWordOverride;

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
): Promise<{ type: string; tags?: Array<{ tag: string; count: number }>; results?: Array<{ filename: string; caption: string }>; totalUniqueTags?: number; totalCaptionFiles?: number; count?: number }> {
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

async function renameTag({
  datasetId,
  oldTag,
  newTag,
}: {
  datasetId: string;
  oldTag: string;
  newTag: string;
}): Promise<{ success: boolean; modified: number; message: string }> {
  const res = await fetch(`/api/datasets/${datasetId}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldTag, newTag }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to rename tag');
  }
  return res.json();
}

async function previewTag(
  datasetId: string,
  tag: string
): Promise<{ type: string; tag: string; totalCaptionFiles: number; alreadyHave: number; wouldAddTo: number }> {
  const res = await fetch(`/api/datasets/${datasetId}/tags?preview=${encodeURIComponent(tag)}`);
  if (!res.ok) throw new Error('Failed to preview tag');
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

export function useRenameTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: renameTag,
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

export function usePreviewTag(datasetId: string | null, tag: string | null) {
  return useQuery({
    queryKey: ['tags-preview', datasetId, tag],
    queryFn: () => previewTag(datasetId!, tag!),
    enabled: !!datasetId && !!tag && tag.trim().length > 0,
  });
}

async function replaceInCaptions({
  datasetId,
  find,
  replace,
  matchCase,
  wholeWord,
}: {
  datasetId: string;
  find: string;
  replace: string;
  matchCase?: boolean;
  wholeWord?: boolean;
}): Promise<{ success: boolean; modified: number; message: string }> {
  const res = await fetch(`/api/datasets/${datasetId}/tags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ find, replace, matchCase, wholeWord }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to replace text');
  }
  return res.json();
}

async function previewReplace(
  datasetId: string,
  find: string,
  options: { matchCase?: boolean; wholeWord?: boolean }
): Promise<{ type: string; totalCaptionFiles: number; matchingFiles: number }> {
  const params = new URLSearchParams({ replaceFind: find });
  if (options.matchCase) params.set('matchCase', '1');
  if (options.wholeWord) params.set('wholeWord', '1');
  const res = await fetch(`/api/datasets/${datasetId}/tags?${params}`);
  if (!res.ok) throw new Error('Failed to preview replace');
  return res.json();
}

export function useReplaceInCaptions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: replaceInCaptions,
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

export function usePreviewReplace(
  datasetId: string | null,
  find: string | null,
  options: { matchCase?: boolean; wholeWord?: boolean }
) {
  return useQuery({
    queryKey: ['replace-preview', datasetId, find, options.matchCase, options.wholeWord],
    queryFn: () => previewReplace(datasetId!, find!, options),
    enabled: !!datasetId && !!find && find.length > 0,
  });
}
