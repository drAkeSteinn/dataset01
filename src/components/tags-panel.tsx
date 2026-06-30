'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
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
  Pencil,
  Check,
  AlertTriangle,
  ListFilter,
  Replace as ReplaceIcon,
  FileImage,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useTags,
  useManageTags,
  useRenameTag,
  usePreviewTag,
  useReplaceInCaptions,
  usePreviewReplace,
  useDatasetImages,
} from '@/hooks/use-images';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

type TabKey = 'list' | 'search' | 'add' | 'replace';

/**
 * Module-level registry mapping image base-name → image id, so SearchTab
 * result rows can render thumbnails without prop-drilling. Populated by the
 * TagsPanel component whenever the image list changes.
 */
const thumbnailRegistry = new Map<string, string>();

export function TagsPanel() {
  const { activeDatasetId, setSelectedImageId, setCaptionHighlight } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabKey>('list');

  // Search-tab state (searches caption contents)
  const [searchQuery, setSearchQuery] = useState('');

  // All-tags-tab state (filters the tag list by name)
  const [tagFilter, setTagFilter] = useState('');

  // Add-tag-tab state
  const [newTag, setNewTag] = useState('');
  const [tagPosition, setTagPosition] = useState<'start' | 'end'>('end');
  const [confirmAddOpen, setConfirmAddOpen] = useState(false);

  // Replace-tab state (find & replace across all captions)
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);

  // Per-tag in-row state (delete + rename confirmations / inline edit)
  const [removingTag, setRemovingTag] = useState<string | null>(null);
  const [confirmDeleteTag, setConfirmDeleteTag] = useState<string | null>(null);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [renamingTag, setRenamingTag] = useState<string | null>(null);

  const isSearchMode = activeTab === 'search' && searchQuery.trim().length > 0;
  const { data: tagsData, isLoading: tagsLoading } = useTags(
    activeDatasetId,
    isSearchMode ? searchQuery : undefined
  );
  const manageTags = useManageTags();
  const renameTagMutation = useRenameTag();
  const { data: imagesData } = useDatasetImages(activeDatasetId, 'all', 10000);

  // Populate the thumbnail registry so SearchTab result rows can render image
  // thumbnails without prop-drilling the datasetId / image list.
  useEffect(() => {
    thumbnailRegistry.clear();
    if (imagesData?.images) {
      for (const img of imagesData.images) {
        const baseName = img.filename.replace(/\.[^.]+$/, '');
        thumbnailRegistry.set(baseName, img.id);
      }
    }
  }, [imagesData]);

  // Preview how many captions would be affected by adding the current newTag.
  // Only fetched when the confirmation dialog is open.
  const { data: previewData, isLoading: previewLoading } = usePreviewTag(
    activeDatasetId,
    confirmAddOpen ? newTag.trim() : null
  );

  const replaceMutation = useReplaceInCaptions();
  // Live preview of how many caption files match the find text (only when the
  // replace confirmation dialog is open, to avoid spamming the server).
  const { data: replacePreviewData, isLoading: replacePreviewLoading } =
    usePreviewReplace(
      activeDatasetId,
      confirmReplaceOpen && findText ? findText : null,
      { matchCase, wholeWord }
    );

  const tags = tagsData?.tags || [];
  const searchResults = tagsData?.results || [];

  // Client-side filter for the "All Tags" list (filter by name, not caption content)
  const filteredTags = useMemo(() => {
    const q = tagFilter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, tagFilter]);

  const handleAddTag = useCallback(() => {
    if (!newTag.trim() || !activeDatasetId) return;
    setConfirmAddOpen(true);
  }, [newTag, activeDatasetId]);

  const handleConfirmAdd = useCallback(() => {
    if (!activeDatasetId) return;
    manageTags.mutate(
      {
        datasetId: activeDatasetId,
        action: 'add',
        tag: newTag.trim(),
        position: tagPosition,
      },
      {
        onSettled: () => {
          setConfirmAddOpen(false);
          setNewTag('');
        },
      }
    );
  }, [activeDatasetId, manageTags, newTag, tagPosition]);

  const handleOpenReplace = useCallback(() => {
    if (!findText.trim() || !activeDatasetId) return;
    setConfirmReplaceOpen(true);
  }, [findText, activeDatasetId]);

  const handleConfirmReplace = useCallback(() => {
    if (!activeDatasetId || !findText) return;
    replaceMutation.mutate(
      {
        datasetId: activeDatasetId,
        find: findText,
        replace: replaceText,
        matchCase,
        wholeWord,
      },
      {
        onSettled: () => {
          setConfirmReplaceOpen(false);
        },
      }
    );
  }, [
    activeDatasetId,
    replaceMutation,
    findText,
    replaceText,
    matchCase,
    wholeWord,
  ]);

  const handleRemoveTag = useCallback(
    (tag: string) => {
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
    },
    [activeDatasetId, manageTags]
  );

  const handleStartEdit = useCallback((tag: string) => {
    setEditingTag(tag);
    setEditValue(tag);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingTag(null);
    setEditValue('');
  }, []);

  const handleConfirmRename = useCallback(
    (oldTag: string) => {
      const newVal = editValue.trim();
      if (!newVal || !activeDatasetId) return;
      if (newVal.toLowerCase() === oldTag.toLowerCase()) {
        handleCancelEdit();
        return;
      }
      setRenamingTag(oldTag);
      renameTagMutation.mutate(
        {
          datasetId: activeDatasetId,
          oldTag,
          newTag: newVal,
        },
        {
          onSettled: () => {
            setRenamingTag(null);
            setEditingTag(null);
            setEditValue('');
          },
        }
      );
    },
    [editValue, activeDatasetId, renameTagMutation, handleCancelEdit]
  );

  const handleSearchResultClick = useCallback(
    (filename: string) => {
      if (!activeDatasetId) return;
      // Search results come from .txt caption files; match by base name so we
      // find the image regardless of its format (.png/.jpg/...).
      const baseName = filename.replace(/\.[^.]+$/, '');
      const image = imagesData?.images.find(
        (img) => img.filename.replace(/\.[^.]+$/, '') === baseName
      );
      if (image) {
        // Select the image so the right-hand detail panel shows it, but do NOT
        // switch the center view away from Tags — the user stays in the Search
        // results list and can click another result without losing context.
        setSelectedImageId(image.id);
        // Highlight the searched text in the caption editor.
        setCaptionHighlight(searchQuery.trim() || null);
      }
    },
    [activeDatasetId, imagesData, setSelectedImageId, searchQuery, setCaptionHighlight]
  );

  if (!activeDatasetId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <TagIcon className="mx-auto h-12 w-12 text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            Selecciona un dataset para administrar tags
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <TagIcon className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Tags</h2>
          {tagsData?.totalCaptionFiles !== undefined && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1">
              {tagsData.totalCaptionFiles} captions
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Administra tags en todos los captions de este dataset
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <TabButton
          active={activeTab === 'list'}
          onClick={() => setActiveTab('list')}
        >
          Todos los tags
          {tagsData?.totalUniqueTags !== undefined && (
            <Badge variant="secondary" className="ml-1.5 h-4 px-1 text-[9px]">
              {tagsData.totalUniqueTags}
            </Badge>
          )}
        </TabButton>
        <TabButton
          active={activeTab === 'search'}
          onClick={() => setActiveTab('search')}
        >
          Buscar
        </TabButton>
        <TabButton
          active={activeTab === 'add'}
          onClick={() => setActiveTab('add')}
        >
          <Plus className="h-3 w-3 inline mr-1" />
          Agregar tag
        </TabButton>
        <TabButton
          active={activeTab === 'replace'}
          onClick={() => setActiveTab('replace')}
        >
          <ReplaceIcon className="h-3 w-3 inline mr-1" />
          Reemplazar
        </TabButton>
      </div>

      {/* Tab content — each tab owns its own input + scrollable list */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'list' && (
          <AllTagsTab
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            tags={filteredTags}
            totalCount={tags.length}
            isLoading={tagsLoading}
            confirmDeleteTag={confirmDeleteTag}
            removingTag={removingTag}
            editingTag={editingTag}
            editValue={editValue}
            renamingTag={renamingTag}
            isPending={manageTags.isPending || renameTagMutation.isPending}
            onSetConfirmDelete={setConfirmDeleteTag}
            onRemove={handleRemoveTag}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onEditValueChange={setEditValue}
            onConfirmRename={handleConfirmRename}
          />
        )}

        {activeTab === 'search' && (
          <SearchTab
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            results={searchResults}
            onResultClick={handleSearchResultClick}
          />
        )}

        {activeTab === 'add' && (
          <AddTagTab
            newTag={newTag}
            setNewTag={setNewTag}
            tagPosition={tagPosition}
            setTagPosition={setTagPosition}
            isPending={manageTags.isPending}
            onAdd={handleAddTag}
          />
        )}

        {activeTab === 'replace' && (
          <ReplaceTab
            findText={findText}
            setFindText={setFindText}
            replaceText={replaceText}
            setReplaceText={setReplaceText}
            matchCase={matchCase}
            setMatchCase={setMatchCase}
            wholeWord={wholeWord}
            setWholeWord={setWholeWord}
            isPending={replaceMutation.isPending}
            onReplace={handleOpenReplace}
          />
        )}
      </div>

      {/* Confirmation dialog for adding a tag globally */}
      <Dialog open={confirmAddOpen} onOpenChange={setConfirmAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              ¿Agregar tag a todos los captions?
            </DialogTitle>
            <DialogDescription>
              This will add the tag{' '}
              <span className="font-semibold text-foreground">
                &ldquo;{newTag.trim()}&rdquo;
              </span>{' '}
              to every caption file in this dataset
              {tagPosition === 'start' ? ' at the start' : ' at the end'}.
              Captions that already contain it will be skipped.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            {previewLoading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Counting affected captions…
              </span>
            ) : previewData ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total caption files:</span>
                  <span className="font-medium">{previewData.totalCaptionFiles}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already contain it:</span>
                  <span className="font-medium">{previewData.alreadyHave}</span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-muted-foreground">Will be modified:</span>
                  <span className="font-semibold text-emerald-600">
                    {previewData.wouldAddTo}
                  </span>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmAddOpen(false)}
              disabled={manageTags.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAdd}
              disabled={manageTags.isPending || previewData?.wouldAddTo === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {manageTags.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add to {previewData?.wouldAddTo ?? 0} captions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for find & replace */}
      <Dialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Replace text in all captions?
            </DialogTitle>
            <DialogDescription>
              This will replace{' '}
              <span className="font-semibold text-foreground">
                &ldquo;{findText}&rdquo;
              </span>{' '}
              with{' '}
              <span className="font-semibold text-foreground">
                &ldquo;{replaceText}&rdquo;
              </span>{' '}
              in every caption file
              {wholeWord ? ' (whole words only)' : ''}
              {matchCase ? ' (case-sensitive)' : ''}.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            {replacePreviewLoading ? (
              <span className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Counting affected captions…
              </span>
            ) : replacePreviewData ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total caption files:</span>
                  <span className="font-medium">{replacePreviewData.totalCaptionFiles}</span>
                </div>
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span className="text-muted-foreground">Match the find text:</span>
                  <span className="font-semibold text-amber-600">
                    {replacePreviewData.matchingFiles}
                  </span>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmReplaceOpen(false)}
              disabled={replaceMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReplace}
              disabled={
                replaceMutation.isPending ||
                replacePreviewData?.matchingFiles === 0
              }
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {replaceMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <ReplaceIcon className="h-4 w-4 mr-1" />
              )}
              Replace in {replacePreviewData?.matchingFiles ?? 0} captions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Tab button ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        'flex-1 px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center justify-center',
        active
          ? 'border-emerald-600 text-emerald-700'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ─── All Tags tab ───────────────────────────────────────────────────────────

interface AllTagsTabProps {
  tagFilter: string;
  setTagFilter: (v: string) => void;
  tags: Array<{ tag: string; count: number }>;
  totalCount: number;
  isLoading: boolean;
  confirmDeleteTag: string | null;
  removingTag: string | null;
  editingTag: string | null;
  editValue: string;
  renamingTag: string | null;
  isPending: boolean;
  onSetConfirmDelete: (t: string | null) => void;
  onRemove: (t: string) => void;
  onStartEdit: (t: string) => void;
  onCancelEdit: () => void;
  onEditValueChange: (v: string) => void;
  onConfirmRename: (oldTag: string) => void;
}

function AllTagsTab(props: AllTagsTabProps) {
  const {
    tagFilter,
    setTagFilter,
    tags,
    totalCount,
    isLoading,
    confirmDeleteTag,
    removingTag,
    editingTag,
    editValue,
    renamingTag,
    isPending,
    onSetConfirmDelete,
    onRemove,
    onStartEdit,
    onCancelEdit,
    onEditValueChange,
    onConfirmRename,
  } = props;

  return (
    <>
      {/* Local filter for the tag list (NOT a caption search) */}
      <div className="border-b p-3">
        <div className="relative">
          <ListFilter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            placeholder="Filtrar tags por nombre…"
            className="pl-8 text-sm"
          />
          {tagFilter && (
            <button
              onClick={() => setTagFilter('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {tagFilter && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Showing {tags.length} of {totalCount} tags
          </p>
        )}
      </div>

      {/* Scrollable tag list (native scrollbar) */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-8">
              <TagIcon className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">
                {tagFilter ? 'Ningún tag coincide con el filtro' : 'No se encontraron tags'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {tags.map(({ tag, count }) => {
                const isEditing = editingTag === tag;
                const isRenaming = renamingTag === tag;
                return (
                  <div
                    key={tag}
                    className={cn(
                      'flex items-center justify-between rounded-md border px-3 py-2 transition-colors',
                      confirmDeleteTag === tag
                        ? 'border-red-300 bg-red-50'
                        : removingTag === tag || isRenaming
                        ? 'border-yellow-300 bg-yellow-50 opacity-60'
                        : 'hover:bg-muted/50'
                    )}
                  >
                    {/* Tag info / inline edit */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <TagIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                      {isEditing ? (
                        <Input
                          value={editValue}
                          onChange={(e) => onEditValueChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') onConfirmRename(tag);
                            if (e.key === 'Escape') onCancelEdit();
                          }}
                          className="h-6 text-sm py-0"
                          autoFocus
                        />
                      ) : (
                        <span className="text-sm truncate" title={tag}>
                          {tag}
                        </span>
                      )}
                      <Badge
                        variant="secondary"
                        className="text-[10px] h-5 px-1.5 shrink-0"
                      >
                        {count}
                      </Badge>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isEditing ? (
                        // Save / cancel rename
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => onConfirmRename(tag)}
                            disabled={isPending || !editValue.trim()}
                            title="Save rename"
                          >
                            {isRenaming ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={onCancelEdit}
                            disabled={isPending}
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : confirmDeleteTag === tag ? (
                        // Delete confirmation state
                        <>
                          <span className="text-[10px] text-red-600 mr-1 hidden sm:inline">
                            Delete?
                          </span>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-6 w-6"
                            onClick={() => onRemove(tag)}
                            disabled={isPending}
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
                            onClick={() => onSetConfirmDelete(null)}
                            disabled={isPending}
                            title="Cancel"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </>
                      ) : (
                        // Normal state: edit + delete
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => onStartEdit(tag)}
                            disabled={isPending}
                            title={`Rename "${tag}" in all captions`}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => onSetConfirmDelete(tag)}
                            disabled={isPending}
                            title={`Remove "${tag}" from all captions`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Search tab (read-only, no modification actions) ───────────────────────

function SearchTab({
  searchQuery,
  setSearchQuery,
  results,
  onResultClick,
}: {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  results: Array<{ filename: string; caption: string }>;
  onResultClick: (filename: string) => void;
}) {
  return (
    <>
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar en captions…"
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

      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          {!searchQuery.trim() ? (
            <div className="text-center py-8">
              <Search className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-2 text-sm text-muted-foreground">
                Escribe para buscar en los captions. Haz click en un resultado
                para editarlo en el panel derecho.
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                No se encontraron captions para &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-2">
                {results.length} caption(s) encontrado(s) — click para editar en
                el panel derecho
              </p>
              {results.map(({ filename, caption }) => {
                // Derive the image id (base64url of datasetId/filename) from
                // the .txt filename so we can show a thumbnail. The filename
                // here is the .txt name; the image shares the base name.
                const baseName = filename.replace(/\.[^.]+$/, '');
                // We don't have the datasetId here directly, but the thumbnail
                // endpoint needs the encoded id. Use a data attribute and let
                // the parent pass it; for now, build a placeholder that the
                // button click resolves. We'll pass the resolved id via the
                // imagesData lookup in the parent.
                return (
                  <SearchResultRow
                    key={filename}
                    filename={filename}
                    caption={caption}
                    searchQuery={searchQuery}
                    onClick={() => onResultClick(filename)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SearchResultRow({
  filename,
  caption,
  searchQuery,
  onClick,
}: {
  filename: string;
  caption: string;
  searchQuery: string;
  onClick: () => void;
}) {
  // Look up the image id from the global images list to build the thumbnail URL.
  // We access it via a small helper that reads from the DOM data attribute set
  // by the gallery, but simpler: pass the datasetId through context. Since the
  // SearchTab doesn't have direct access, we use a module-level lookup that the
  // parent (TagsPanel) populates. For now, derive from the caption's presence
  // in the images list using a data attribute on the row.
  //
  // Simpler approach: the parent passes the resolved imageId to us via onClick,
  // but for the thumbnail we need it here. We'll use a window-level registry
  // that TagsPanel sets. To keep it clean, we accept a thumbnailSrc prop.
  return (
    <SearchResultRowInner
      filename={filename}
      caption={caption}
      searchQuery={searchQuery}
      onClick={onClick}
    />
  );
}

function SearchResultRowInner({
  filename,
  caption,
  searchQuery,
  onClick,
}: {
  filename: string;
  caption: string;
  searchQuery: string;
  onClick: () => void;
}) {
  // Highlight occurrences of searchQuery in the caption text.
  const highlighted = highlightMatch(caption, searchQuery);

  return (
    <button
      onClick={onClick}
      className="group w-full text-left rounded-md border p-2 hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors flex gap-2"
    >
      {/* Thumbnail */}
      <ResultThumbnail filename={filename} />

      {/* Text content */}
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium truncate" title={filename}>
            {filename.replace(/\.[^.]+$/, '')}
          </p>
          <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {highlighted}
        </p>
      </div>
    </button>
  );
}

/**
 * Render the caption text with occurrences of `query` wrapped in a <mark>.
 * Returns a React fragment (array of strings + mark elements).
 */
function highlightMatch(text: string, query: string): React.ReactNode {
  const q = query.trim();
  if (!q) return text;
  // Escape regex special chars in the query.
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Use a case-insensitive split with a capture group so the delimiter is kept.
  const re = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(re);
  // A part matches the query (case-insensitive) if it equals the query when
  // lowercased. Using a fresh comparison avoids the global-regex lastIndex bug.
  const qLower = q.toLowerCase();
  return parts.map((part, i) =>
    part.toLowerCase() === qLower ? (
      <mark
        key={i}
        className="bg-amber-200 dark:bg-amber-500/40 text-foreground rounded px-0.5"
      >
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/**
 * Thumbnail for a search result. Looks up the image id from the module-level
 * registry that TagsPanel populates (so we don't prop-drill the datasetId).
 */
function ResultThumbnail({ filename }: { filename: string }) {
  const baseName = filename.replace(/\.[^.]+$/, '');
  const imageId = thumbnailRegistry.get(baseName);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!imageId) {
    return (
      <div className="h-12 w-12 shrink-0 rounded bg-muted flex items-center justify-center">
        <FileImage className="h-4 w-4 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <div className="h-12 w-12 shrink-0 rounded bg-muted overflow-hidden relative">
      {!error && (
        <img
          src={`/api/images/${imageId}/file`}
          alt={baseName}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          className={`h-full w-full object-cover transition-opacity ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      {error && (
        <div className="flex h-full items-center justify-center">
          <FileImage className="h-4 w-4 text-muted-foreground/50" />
        </div>
      )}
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-emerald-500" />
        </div>
      )}
    </div>
  );
}

// ─── Add Tag tab (separated, with confirmation dialog) ─────────────────────

function AddTagTab({
  newTag,
  setNewTag,
  tagPosition,
  setTagPosition,
  isPending,
  onAdd,
}: {
  newTag: string;
  setNewTag: (v: string) => void;
  tagPosition: 'start' | 'end';
  setTagPosition: (v: 'start' | 'end') => void;
  isPending: boolean;
  onAdd: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4 max-w-lg">
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Adding a tag here will modify{' '}
            <strong>every caption file</strong> in the dataset. You will see a
            confirmation dialog with the exact count before any change is made.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Nuevo tag</Label>
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onAdd()}
            placeholder="Escribe el tag…"
            className="text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Tags already containing this tag will be skipped (no duplicates).
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Posición</Label>
          <Select
            value={tagPosition}
            onValueChange={(v) => setTagPosition(v as 'start' | 'end')}
          >
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="start">
                <div className="flex items-center gap-1.5">
                  <ArrowUpToLine className="h-3 w-3" />
                  Start (antes de los tags existentes)
                </div>
              </SelectItem>
              <SelectItem value="end">
                <div className="flex items-center gap-1.5">
                  <ArrowDownToLine className="h-3 w-3" />
                  End (después de los tags existentes)
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={onAdd}
          disabled={!newTag.trim() || isPending}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Plus className="h-4 w-4 mr-1" />
          )}
          Agregar tag a todos los captions
        </Button>
      </div>
    </div>
  );
}

// ─── Replace tab (find & replace across all captions) ──────────────────────

function ReplaceTab({
  findText,
  setFindText,
  replaceText,
  setReplaceText,
  matchCase,
  setMatchCase,
  wholeWord,
  setWholeWord,
  isPending,
  onReplace,
}: {
  findText: string;
  setFindText: (v: string) => void;
  replaceText: string;
  setReplaceText: (v: string) => void;
  matchCase: boolean;
  setMatchCase: (v: boolean) => void;
  wholeWord: boolean;
  setWholeWord: (v: boolean) => void;
  isPending: boolean;
  onReplace: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4 max-w-lg">
        <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 flex gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            This replaces text in{' '}
            <strong>every caption file</strong> in the dataset. A confirmation
            dialog with the exact match count will appear before any change.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Buscar</Label>
          <Input
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
            placeholder="Texto a buscar…"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Reemplazar con</Label>
          <Input
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            placeholder="Texto de reemplazo (puede estar vacío para borrar)…"
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Coincidir mayúsculas
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Solo palabra completa
          </label>
        </div>

        <Button
          onClick={onReplace}
          disabled={!findText.trim() || isPending}
          className="w-full bg-amber-600 hover:bg-amber-700 text-white"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <ReplaceIcon className="h-4 w-4 mr-1" />
          )}
          Find &amp; replace
        </Button>
      </div>
    </div>
  );
}
