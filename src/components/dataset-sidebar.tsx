'use client';

import { useState } from 'react';
import { Plus, Search, Database, ImageIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppStore } from '@/stores/app-store';
import { useDatasets } from '@/hooks/use-datasets';
import { CreateDatasetDialog } from '@/components/create-dataset-dialog';
import { cn } from '@/lib/utils';

export function DatasetSidebar() {
  const { activeDatasetId, setActiveDatasetId } = useAppStore();
  const { data: datasets, isLoading } = useDatasets();
  const [search, setSearch] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const filteredDatasets = datasets?.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 p-4">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-semibold">Datasets</h2>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800"
          onClick={() => setShowCreateDialog(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
          <Input
            placeholder="Search datasets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 bg-zinc-900 border-zinc-800 pl-8 text-xs text-zinc-300 placeholder:text-zinc-600 focus-visible:ring-emerald-500/30"
          />
        </div>
      </div>

      {/* Dataset list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 px-2 pb-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
            </div>
          )}

          {filteredDatasets?.length === 0 && !isLoading && (
            <div className="px-2 py-8 text-center">
              <Database className="mx-auto h-8 w-8 text-zinc-700" />
              <p className="mt-2 text-xs text-zinc-500">
                {search ? 'No matching datasets' : 'No datasets yet'}
              </p>
              {!search && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-zinc-800"
                  onClick={() => setShowCreateDialog(true)}
                >
                  Create your first dataset
                </Button>
              )}
            </div>
          )}

          {filteredDatasets?.map((dataset) => (
            <button
              key={dataset.id}
              onClick={() => setActiveDatasetId(dataset.id)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                activeDatasetId === dataset.id
                  ? 'bg-emerald-600/20 text-emerald-100'
                  : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200'
              )}
            >
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md',
                  activeDatasetId === dataset.id
                    ? 'bg-emerald-600/30'
                    : 'bg-zinc-800'
                )}
              >
                <ImageIcon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium">
                  {dataset.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {dataset.triggerWord || 'No trigger word'}
                </p>
              </div>
              <Badge
                variant="secondary"
                className={cn(
                  'shrink-0 text-xs',
                  activeDatasetId === dataset.id
                    ? 'bg-emerald-600/30 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-400'
                )}
              >
                {dataset.imageCount}
              </Badge>
            </button>
          ))}
        </div>
      </ScrollArea>

      <CreateDatasetDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </div>
  );
}
