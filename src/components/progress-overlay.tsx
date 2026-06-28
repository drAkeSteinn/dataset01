'use client';

import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { useAppStore } from '@/stores/app-store';
import { useBatchOperation } from '@/hooks/use-batch-operation';

export function ProgressOverlay() {
  const { batchOperation } = useAppStore();
  const { cancelOperation } = useBatchOperation();

  if (!batchOperation.isRunning) return null;

  const progressPercent =
    batchOperation.progress.total > 0
      ? (batchOperation.progress.processed / batchOperation.progress.total) * 100
      : 0;

  const typeLabel =
    batchOperation.type === 'analyze' ? 'VLM Analysis' : 'Caption Generation';

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Card className="w-80 shadow-xl border-emerald-200 bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">{typeLabel}</h4>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-red-500"
              onClick={cancelOperation}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Progress bar */}
          <Progress value={progressPercent} className="h-2 mb-2" />

          {/* Stats */}
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="tabular-nums">
              {batchOperation.progress.processed} / {batchOperation.progress.total} processed
            </span>
            <span className="tabular-nums font-medium">
              {Math.round(progressPercent)}%
            </span>
          </div>

          {/* Current file */}
          {batchOperation.currentFile && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="truncate">{batchOperation.currentFile}</span>
            </div>
          )}

          {/* Status message */}
          {batchOperation.progress.message && (
            <p className="text-xs text-muted-foreground mb-2">
              {batchOperation.progress.message}
            </p>
          )}

          {/* Error count */}
          {batchOperation.errors.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-red-500">
              <AlertTriangle className="h-3 w-3" />
              <span>{batchOperation.errors.length} error(s)</span>
            </div>
          )}

          {/* Results count */}
          {batchOperation.results.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              <span>{batchOperation.results.length} completed</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
