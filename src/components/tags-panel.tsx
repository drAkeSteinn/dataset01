'use client';

import { useState } from 'react';
import {
  Tag as TagIcon,
  Plus,
  Trash2,
  Search,
  Loader2,
  ArrowUpToLine,
  ArrowDownToLine,
  ExternalLink,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTags, useManageTags, useDatasetImages } from '@/hooks/use-images';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

export function TagsPanel() {
  const { activeDatasetId, setCenterView, setSelectedImageId } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [newTag, setNewTag] = useState('');
  const [tagPosition, setTagPosition] = useState<'start' | 'end'>('end');
  const [activeTab, setActiveTab] = useState<'list' | 'search'>('list');
  const [removingTag, setRemovingTag] = useState<string | null>(null);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);

  const { data: tagsData, isLoading: tagsLoading } = useTags(
    activeDatasetId,
    activeTab === 'search' && searchQuery ? searchQuery : undefined
  );
  const manageTags = useManageTags();
  const { data: imagesData } = useDatasetImages(activeDatasetId, 'all', 500);

  const handleAddTag = () => {
    if (!newTag.trim() || !activeDatasetId) return;
    manageTags.mutate({
      datasetId: activeDatasetId,
      action: 'add',
      tag: newTag.trim(),
      position: tagPosition,
    });
    setNewTag('');
  };

  const handleRemoveTag = (tag: string) => {
    if (!activeDatasetId) return;
    setRemovingTag(tag);
    manageTags.mutate(
      {
        datasetId: activeDatasetId,
        action: 'remove',
        tag,
      },
      {
        onSettled: () => {
          setRemovingTag(null);
          setConfirmDeleteTag(null);
        },
      }
    );
  };

  const handleSearchResultClick = (filename: string) => {
    if (!activeDatasetId) return;
    const image = imagesData?.images.find((img) => img.filename === filename);
    if (image) {
      setSelectedImageId(image.id);
      setCenterView('gallery');
    }
  };

  if (!activeDatasetId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <TagIcon className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Select a dataset to manage tags
          </p>
        </div>
      </div>
    );
  }

  const tags = tagsData?.tags || [];
  const searchResults = tagsData?.results || [];

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Tags</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Manage tags across all captions in this dataset
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'list'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('list')}
        >
          All Tags
          {tagsData?.totalUniqueTags !== undefined && (
            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">
              {tagsData.totalUniqueTags}
            </Badge>
          )}
        </button>
        <button
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'search'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
      </div>

      {/* Add tag section */}
      <div className="border-b p-4 space-y-3">
        <div className="space-y-2">
          <Label className="text-xs">Add Tag to All Captions</Label>
          <div className="flex gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
              placeholder="Enter tag..."
              className="flex-1 text-sm"
            />
            <Select value={tagPosition} onValueChange={(v) => setTagPosition(v as 'start' | 'end')}>
              <SelectTrigger className="w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="start">
                  <div className="flex items-center gap-1.5">
                    <ArrowUpToLine className="h-3 w-3" />
                    Start
                  </div>
                </SelectItem>
                <SelectItem value="end">
                  <div className="flex items-center gap-1.5">
                    <ArrowDownToLine className="h-3 w-3" />
                    End
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              onClick={handleAddTag}
              disabled={!newTag.trim() || manageTags.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {manageTags.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Adds to all .txt files. Tags already containing this tag will be skipped.
          </p>
        </div>
      </div>

      {/* Search bar (shown in search tab) */}
      {activeTab === 'search' && (
        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search captions..."
              className="pl-8 text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === 'list' ? (
          <div className="p-4">
            {tagsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-8">
                <TagIcon className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">No tags found</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {tags.map(({ tag, count }) => (
                  <div
                    key={tag}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-2 transition-colors',
                      confirmDeleteTag === tag
                        ? 'border-red-300 bg-red-50'
                        : removingTag === tag
                        ? 'border-yellow-300 bg-yellow-50 opacity-60'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    {/* Tag info */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TagIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate" title={tag}>{tag}</span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
                        {count}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {confirmDeleteTag === tag ? (
                        // Confirmation state
                        <>
                          <span className="text-[10px] text-red-600 mr-1 hidden sm:inline">Delete?</span>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-6 w-6"
                            onClick={() => handleRemoveTag(tag)}
                            disabled={manageTags.isPending}
                            title="Confirm delete"
                          >
                            {removingTag === tag ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setConfirmDeleteTag(null)}
                            disabled={manageTags.isPending}
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        // Normal state - delete button
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setConfirmDeleteTag(tag)}
                          disabled={manageTags.isPending}
                          title={`Remove "${tag}" from all captions`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            {!searchQuery ? (
              <div className="text-center py-8">
                <Search className="mx-auto h-8 w-8 text-muted-foreground/40" />
                <p className="mt-2 text-sm text-muted-foreground">
                  Type to search captions. Click a result to view the image.
                </p>
              </div>
            ) : searchResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  No captions found for &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">
                  {searchResults.length} caption(s) found — click to view in Gallery
                </p>
                {searchResults.map(({ filename, caption }) => (
                  <button
                    key={filename}
                    onClick={() => handleSearchResultClick(filename)}
                    className="group w-full text-left rounded-md border p-2.5 space-y-1.5 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium truncate" title={filename}>
                        {filename}
                      </p>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {caption}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
