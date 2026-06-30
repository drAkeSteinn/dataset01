'use client';

import { useEffect } from 'react';
import { Images, Tag } from 'lucide-react';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { DatasetSidebar } from '@/components/dataset-sidebar';
import { GalleryGrid } from '@/components/gallery-grid';
import { ImageDetailPanel } from '@/components/image-detail-panel';
import { TagsPanel } from '@/components/tags-panel';
import { BatchOperationsBar } from '@/components/batch-operations-bar';
import { ProgressOverlay } from '@/components/progress-overlay';
import { Lightbox } from '@/components/lightbox';
import { useAppStore } from '@/stores/app-store';
import { useDatasets } from '@/hooks/use-datasets';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { activeDatasetId, setActiveDatasetId, centerView, setCenterView } = useAppStore();
  const { data: datasets } = useDatasets();

  // Auto-select the first dataset on mount
  useEffect(() => {
    if (!activeDatasetId && datasets && datasets.length > 0) {
      setActiveDatasetId(datasets[0].id);
    }
  }, [activeDatasetId, datasets, setActiveDatasetId]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Top bar */}
      <BatchOperationsBar />

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          {/* Left sidebar - Dataset list */}
          <ResizablePanel defaultSize={18} minSize={14} maxSize={25}>
            <DatasetSidebar />
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Center - Gallery or Tags */}
          <ResizablePanel defaultSize={48} minSize={30}>
            <div className="flex h-full flex-col">
              {/* View tabs */}
              <div className="flex border-b bg-background">
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                    centerView === 'gallery'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setCenterView('gallery')}
                >
                  <Images className="h-4 w-4" />
                  Galería
                </button>
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors',
                    centerView === 'tags'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setCenterView('tags')}
                >
                  <Tag className="h-4 w-4" />
                  Tags
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {centerView === 'gallery' ? <GalleryGrid /> : <TagsPanel />}
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right panel - Image detail */}
          <ResizablePanel defaultSize={34} minSize={25} maxSize={45}>
            <ImageDetailPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Progress overlay for batch operations */}
      <ProgressOverlay />

      {/* Full-size image viewer */}
      <Lightbox />
    </div>
  );
}
