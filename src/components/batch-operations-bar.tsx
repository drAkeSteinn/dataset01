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
  BarChart3,
  Pause,
  Copy,
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
import { useDataset, useProviderHealth } from '@/hooks/use-datasets';
import { useImportFromFolder, useDatasetImages } from '@/hooks/use-images';
import { DatasetStatsDialog } from '@/components/dataset-stats-dialog';
import { DuplicatesDialog } from '@/components/duplicates-dialog';
import { useBatchOperation } from '@/hooks/use-batch-operation';
import { cn } from '@/lib/utils';

export function BatchOperationsBar() {
  const { activeDatasetId } = useAppStore();
  const { data: dataset } = useDataset(activeDatasetId);
  const { data: imagesData } = useDatasetImages(activeDatasetId, 'all', 500);
  const { batchOperation, startOperation, cancelOperation } = useBatchOperation();
  const importFromFolder = useImportFromFolder();

  // Track regeneration pending count for resume capability
  const [regenPendingCount, setRegenPendingCount] = useState(0);
  const [statsOpen, setStatsOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);

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

  const handleRetryFailed = async () => {
    if (!activeDatasetId) return;
    try {
      await startOperation(activeDatasetId, 'regenerate', { retryFailed: true } as { retryFailed: true });
    } catch (err) {
      console.error('Retry failed:', err);
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

  // Provider health indicator (green/red dot)
  const health = useProviderHealth(
    activeDatasetId,
    dataset?.llmProvider,
    dataset?.llmEndpoint,
    dataset?.llmModel
  );

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
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="shrink-0 text-[9px] text-muted-foreground gap-1 cursor-help">
                      <span
                        className={cn(
                          'inline-block h-1.5 w-1.5 rounded-full',
                          health.isLoading
                            ? 'bg-muted-foreground/40'
                            : health.data?.success
                            ? 'bg-emerald-500'
                            : 'bg-red-500'
                        )}
                      />
                      {providerLabel}{dataset.llmModel ? ` · ${dataset.llmModel}` : ''}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs max-w-[280px]">
                    {health.isLoading
                      ? 'Checking provider…'
                      : health.data?.success
                      ? `Provider reachable: ${health.data.message}`
                      : `Provider unreachable: ${health.data?.message || 'unknown error'}`}
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setStatsOpen(true)}
                    title="Estadísticas del dataset"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Ver estadísticas del dataset</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setDuplicatesOpen(true)}
                    title="Buscar duplicados"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Buscar imágenes duplicadas y similares</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <h1 className="text-sm text-muted-foreground">Ningún dataset seleccionado</h1>
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
                  Analizar
                  {dataset?.stats?.pending ? (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                      {dataset.stats.pending}
                    </Badge>
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Analizar imágenes con VLM para extraer descripciones de personajes</TooltipContent>
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
                  Generar
                  {dataset?.stats?.analyzed ? (
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                      {dataset.stats.analyzed}
                    </Badge>
                  ) : null}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Generar captions LoRA para imágenes analizadas</TooltipContent>
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
                    if (regenPendingCount > 0) return 'Reanudar';
                    if (selectedCount > 0) return 'Regenerar selección';
                    return 'Regenerar todas';
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
                  if (regenPendingCount > 0) return `Reanudar regeneración — quedan ${regenPendingCount} imagen(es)`;
                  if (selectedCount > 0) return `Regenerar solo ${selectedCount} imagen(es) seleccionada(s)`;
                  return 'Regenerar TODAS las imágenes. Selecciona con el checkbox para regenerar solo esas.';
                })()}
              </TooltipContent>
            </Tooltip>

            {(dataset?.stats?.error ?? 0) > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
                    onClick={handleRetryFailed}
                    disabled={!activeDatasetId || batchOperation.isRunning}
                  >
                    {batchOperation.isRunning && batchOperation.type === 'regenerate' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5" />
                    )}
                    Reintentar fallidas
                    <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px] bg-red-100 text-red-700">
                      {dataset?.stats?.error}
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Retry only the {dataset?.stats?.error} image(s) that failed in a previous run
                </TooltipContent>
              </Tooltip>
            )}

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
                  Importar
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
                  Descargar
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
                {batchOperation.type === 'analyze' ? 'Analizando' : 
                 batchOperation.type === 'regenerate' ? 'Regenerando' : 'Generando'}...
              </span>
              <span className="text-xs font-medium tabular-nums">
                {batchOperation.progress.processed}/{batchOperation.progress.total}
              </span>
            </div>
            <Progress value={progressPercent} className="w-32 h-1.5" />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50"
              onClick={cancelOperation}
              title="Pause the batch. Remaining images keep their 'pending' status so you can Resume later."
            >
              <Pause className="h-3 w-3 mr-1" />
              Pausar
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

      <DatasetStatsDialog
        open={statsOpen}
        onOpenChange={setStatsOpen}
        datasetId={activeDatasetId}
      />

      <DuplicatesDialog
        open={duplicatesOpen}
        onOpenChange={setDuplicatesOpen}
        datasetId={activeDatasetId}
      />
    </div>
  );
}
