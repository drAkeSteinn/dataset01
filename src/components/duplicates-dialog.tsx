'use client';

import { useState } from 'react';
import {
  Copy,
  Images,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useDatasetDuplicates,
  type DatasetDuplicates,
  type DuplicateGroup,
} from '@/hooks/use-datasets';
import { useAppStore } from '@/stores/app-store';
import { cn } from '@/lib/utils';

interface DuplicatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetId: string | null;
}

export function DuplicatesDialog({
  open,
  onOpenChange,
  datasetId,
}: DuplicatesDialogProps) {
  const [threshold, setThreshold] = useState(5);
  const { data, isLoading, isFetching } = useDatasetDuplicates(
    datasetId,
    threshold,
    open
  );
  const { setSelectedImageId, setCenterView } = useAppStore();

  const handleJumpToImage = (imageId: string) => {
    setSelectedImageId(imageId);
    setCenterView('gallery');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-amber-600" />
            Duplicados y similitudes
          </DialogTitle>
          <DialogDescription>
            Imágenes visualmente similares y captions idénticos. Útil para
            limpiar el dataset antes de entrenar.
          </DialogDescription>
        </DialogHeader>

        {/* Threshold control */}
        <div className="flex items-center gap-3 rounded-md border p-2.5">
          <span className="text-xs text-muted-foreground">
            Sensibilidad:
          </span>
          <input
            type="range"
            min={0}
            max={15}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
            className="flex-1"
          />
          <Badge variant="secondary" className="text-[10px]">
            distancia ≤ {threshold}
          </Badge>
          <span className="text-[10px] text-muted-foreground w-32">
            {threshold === 0
              ? 'solo duplicados exactos'
              : threshold <= 5
              ? 'muy similar'
              : threshold <= 10
              ? 'similar'
              : 'posiblemente relacionado'}
          </span>
        </div>

        {isLoading || isFetching ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Calculando hashes perceptuales ({data?.totalHashed ?? 0}/
              {data?.totalImages ?? '?'} imágenes)…
            </span>
          </div>
        ) : !data ? null : data.totalHashed === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No se pudieron procesar las imágenes.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-2">
              <SummaryCard
                icon={<Images className="h-3.5 w-3.5" />}
                label="Imágenes similares"
                value={data.totalImageDuplicates}
                groups={data.imageDuplicateGroups.length}
              />
              <SummaryCard
                icon={<Copy className="h-3.5 w-3.5" />}
                label="Captions idénticos"
                value={data.totalCaptionDuplicates}
                groups={data.captionDuplicateGroups.length}
              />
            </div>

            {data.totalImageDuplicates === 0 &&
              data.totalCaptionDuplicates === 0 && (
                <div className="text-center py-8">
                  <AlertTriangle className="mx-auto h-8 w-8 text-emerald-500" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    No se encontraron duplicados con la sensibilidad actual.
                  </p>
                </div>
              )}

            {/* Image duplicates */}
            {data.imageDuplicateGroups.length > 0 && (
              <DuplicateSection
                title="Imágenes similares"
                groups={data.imageDuplicateGroups}
                onJump={handleJumpToImage}
              />
            )}

            {/* Caption duplicates */}
            {data.captionDuplicateGroups.length > 0 && (
              <DuplicateSection
                title="Captions idénticos"
                groups={data.captionDuplicateGroups}
                onJump={handleJumpToImage}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  groups,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  groups: number;
}) {
  return (
    <div className="rounded-md border p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        <span className="text-[10px] text-muted-foreground">
          en {groups} grupo(s)
        </span>
      </div>
    </div>
  );
}

function DuplicateSection({
  title,
  groups,
  onJump,
}: {
  title: string;
  groups: DuplicateGroup[];
  onJump: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  return (
    <section>
      <h3 className="text-xs font-semibold mb-2">{title}</h3>
      <div className="space-y-1.5">
        {groups.map((group, gi) => {
          const isOpen = expanded[gi] ?? true;
          return (
            <div key={gi} className="rounded-md border overflow-hidden">
              <button
                onClick={() =>
                  setExpanded((s) => ({ ...s, [gi]: !isOpen }))
                }
                className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/50 transition-colors text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-3 w-3 shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                <span className="text-xs font-medium">
                  Grupo {gi + 1}
                </span>
                <Badge variant="secondary" className="text-[9px]">
                  {group.images.length} imágenes
                </Badge>
                {group.distance !== undefined && (
                  <Badge
                    variant="outline"
                    className="text-[9px] text-amber-600 border-amber-300"
                  >
                    distancia {group.distance}
                  </Badge>
                )}
              </button>
              {isOpen && (
                <div className="border-t bg-muted/20 p-1.5 space-y-1">
                  {group.images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => onJump(img.id)}
                      className="w-full flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors"
                    >
                      <span className="truncate" title={img.filename}>
                        {img.filename}
                      </span>
                      <span className="text-[9px] text-emerald-600 shrink-0">
                        ver →
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
