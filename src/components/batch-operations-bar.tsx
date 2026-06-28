'use client';

import { useRef, useState, useEffect } from 'react';
import {
  ScanSearch,
  MessageSquareText,
  Download,
  Loader2,
  FolderOpen,
  RotateCcw,
  Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/stores/app-store';
import { useDataset } from '@/hooks/use-datasets';
import { useImportFromFolder, useDatasetImages } from '@/hooks/use-images';
import { useBatchOperation } from '@/hooks/use-batch-operation';

export function BatchOperationsBar() {
  const { activeDatasetId } = useAppStore();
  const { data: dataset } = useDataset(activeDatasetId);
  const { data: imagesData } = useDatasetImages(activeDatasetId, 'all', 500);
  const { batchOperation, startOperation, cancelOperation } = useBatchOperation();
  const importFromFolder = useImportFromFolder();

  // Track regeneration pending count for resume capability
  const [regenPendingCount, setRegenPendingCount] = useState(0);

  useEffect(() => {
    if (!activeDatasetId || batchOperation.isRunning) return;

    let cancelled = false;
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/datasets/${activeDatasetId}/regeneration-status`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setRegenPendingCount(data.pendingCount || 0);
        }
      } catch {
        // Ignore errors
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Check every 10s
    return () => { cancelled = true; clearInterval(interval); };
  }, [activeDatasetId, batchOperation.isRunning]);

  const handleAnalyze = async () => {
    if (!activeDatasetId) return;
    try {
      await startOperation(activeDatasetId, 'analyze');
    } catch (err) {
      console.error('Analysis failed:', err);
    }
  };

  const handleGenerateCaptions = async () => {
    if (!activeDatasetId) return;
    try {
      await startOperation(activeDatasetId, 'generate-captions');
    } catch (err) {
      console.error('Caption generation failed:', err);
    }
  };

  const handleRegenerateAll = async () => {
    if (!activeDatasetId) return;
    try {
      // Check if there are selected images
      const selectedCount = imagesData?.images?.filter(img => img.selectedForRegen).length || 0;
      if (selectedCount > 0) {
        // Regenerate only selected
        await startOperation(activeDatasetId, 'regenerate', { selectedOnly: true });
      } else {
        // Regenerate all
        await startOperation(activeDatasetId, 'regenerate');
      }
    } catch (err) {
      console.error('Regeneration failed:', err);
    }
  };

  const handleDownload = async () => {
    if (!activeDatasetId) return;
    try {
      const res = await fetch(`/api/datasets/${activeDatasetId}/download`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Download failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dataset?.name || 'dataset'}_dataset.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const handleImport = async () => {
    if (!activeDatasetId || !dataset?.imagePath) return;
    try {
      await importFromFolder.mutateAsync({
        datasetId: activeDatasetId,
        folderPath: dataset.imagePath,
      });
    } catch (err) {
      console.error('Import failed:', err);
    }
  };

  const progressPercent =
    batchOperation.progress.total > 0
      ? (batchOperation.progress.processed / batchOperation.progress.total) * 100
      : 0;

  const providerLabel = dataset?.llmProvider === 'zai' ? '' : 
    dataset?.llmProvider === 'ollama' ? 'Ollama' :
    dataset?.llmProvider === 'lmstudio' ? 'LM Studio' :
    dataset?.llmProvider === 'textgen' ? 'TextGen' : '';

  return (
    <div className="border-b bg-background">
      <div className="flex items-center gap-2 px-4 py-2">
        {/* Dataset name */}
        <div className="flex items-center gap-2 min-w-0">
          {dataset ? (
            <>
              <h1 className="text-sm font-semibold truncate">{dataset.name}</h1>
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {dataset.imageCount} images
              </Badge>
              {providerLabel && (
                <Badge variant="outline" className="shrink-0 text-[9px] text-muted-foreground">
                  {providerLabel}{dataset.llmModel ? ` · ${dataset.llmModel}` : ''}
                </Badge>
              )}
            </>
          ) : (
            <h1 className="text-sm text-muted-foreground">No dataset selected</h1>
          )}
        </div>

        <Separator orientation="vertical" className="mx-2 h-5" />

        {/* Action buttons */}
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleAnalyze}
                  disabled={!activeDatasetId || batchOperation.isRunning || (dataset?.stats?.pending ?? 0) === 0}
                >
                  {batchOperation.isRunning && batchOperation.type === 'analyze' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ScanSearch className="h-3.5 w-3.5" />
                  )}
                  Analyze
                  {dataset?.stats?.pending ? (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                      {dataset.stats.pending}
                    </Badge>
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Analyze images with VLM to extract character descriptions</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleGenerateCaptions}
                  disabled={!activeDatasetId || batchOperation.isRunning}
                >
                  {batchOperation.isRunning && batchOperation.type === 'generate-captions' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquareText className="h-3.5 w-3.5" />
                  )}
                  Generate
                  {dataset?.stats?.analyzed ? (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                      {dataset.stats.analyzed}
                    </Badge>
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generate LoRA captions for analyzed images</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-xs gap-1.5 ${
                    regenPendingCount > 0 ? 'border-amber-400 text-amber-600' :
                    (imagesData?.images?.filter(img => img.selectedForRegen).length || 0) > 0 ? 'border-amber-400 text-amber-600' : ''
                  }`}
                  onClick={handleRegenerateAll}
                  disabled={!activeDatasetId || batchOperation.isRunning}
                >
                  {batchOperation.isRunning && batchOperation.type === 'regenerate' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : regenPendingCount > 0 ? (
                    <Play className="h-3.5 w-3.5" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  {(() => {
                    const selectedCount = imagesData?.images?.filter(img => img.selectedForRegen).length || 0;
                    if (regenPendingCount > 0) return 'Resume';
                    if (selectedCount > 0) return 'Regenerate Selected';
                    return 'Regenerate All';
                  })()}
                  {regenPendingCount > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] bg-amber-100 text-amber-700">
                      {regenPendingCount}
                    </Badge>
                  )}
                  {regenPendingCount === 0 && (imagesData?.images?.filter(img => img.selectedForRegen).length || 0) > 0 && (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] bg-amber-100 text-amber-700">
                      {imagesData?.images?.filter(img => img.selectedForRegen).length}
                    </Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {(() => {
                  const selectedCount = imagesData?.images?.filter(img => img.selectedForRegen).length || 0;
                  if (regenPendingCount > 0) return `Resume regeneration — ${regenPendingCount} image(s) remaining`;
                  if (selectedCount > 0) return `Regenerate only ${selectedCount} selected image(s)`;
                  return 'Regenerate ALL images. Select images with checkbox to regenerate only those.';
                })()}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleImport}
                  disabled={!activeDatasetId || !dataset?.imagePath}
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Import
                </Button>
              </TooltipTrigger>
              <TooltipContent>Re-import images from the dataset folder</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleDownload}
                  disabled={!activeDatasetId || (dataset?.stats?.captioned ?? 0) === 0}
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download dataset as ZIP (images + caption .txt files)</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        {/* Progress indicator during batch operations */}
        {batchOperation.isRunning && (
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {batchOperation.type === 'analyze' ? 'Analyzing' : 
                 batchOperation.type === 'regenerate' ? 'Regenerating' : 'Generating'}...
              </span>
              <span className="text-xs font-medium tabular-nums">
                {batchOperation.progress.processed}/{batchOperation.progress.total}
              </span>
            </div>
            <Progress value={progressPercent} className="w-32 h-1.5" />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={cancelOperation}
            >
              Cancel
            </Button>
          </div>
        )}

        {/* Batch operation message */}
        {batchOperation.progress.message && !batchOperation.isRunning && (
          <span className="ml-auto text-xs text-muted-foreground">
            {batchOperation.progress.message}
          </span>
        )}
      </div>
    </div>
  );
}
