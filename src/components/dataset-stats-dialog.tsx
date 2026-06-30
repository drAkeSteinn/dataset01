'use client';

import { BarChart3, Loader2, Tag as TagIcon, Image as ImageIcon, FileText, Layers } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useDatasetStats } from '@/hooks/use-datasets';
import { cn } from '@/lib/utils';

interface DatasetStatsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  datasetId: string | null;
}

export function DatasetStatsDialog({
  open,
  onOpenChange,
  datasetId,
}: DatasetStatsDialogProps) {
  const { data: stats, isLoading } = useDatasetStats(datasetId, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-600" />
            Estadísticas del dataset
          </DialogTitle>
          <DialogDescription>
            {stats ? stats.datasetName : 'Cargando…'} — métricas de calidad y
            cobertura del dataset para entrenamiento.
          </DialogDescription>
        </DialogHeader>

        {isLoading || !stats ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Overview cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatCard
                icon={<ImageIcon className="h-3.5 w-3.5" />}
                label="Imágenes"
                value={stats.totalImages}
              />
              <StatCard
                icon={<FileText className="h-3.5 w-3.5" />}
                label="Captions"
                value={stats.totalCaptionFiles}
              />
              <StatCard
                icon={<TagIcon className="h-3.5 w-3.5" />}
                label="Tags únicos"
                value={stats.totalUniqueTags}
              />
              <StatCard
                icon={<Layers className="h-3.5 w-3.5" />}
                label="Con VLM"
                value={stats.withVlmAnalysis}
              />
            </div>

            {/* Caption length distribution */}
            <section>
              <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                Longitud de caption (≈ tokens CLIP)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <MiniStat label="Mín" value={stats.captionLength.min} />
                <MiniStat label="Mediana" value={stats.captionLength.median} />
                <MiniStat label="Prom" value={stats.captionLength.avg} />
                <MiniStat label="Máx" value={stats.captionLength.max} />
              </div>
              <div className="space-y-1">
                {stats.captionLength.distribution.map((bucket) => {
                  const max = Math.max(
                    ...stats.captionLength.distribution.map((b) => b.count),
                    1
                  );
                  const pct = (bucket.count / max) * 100;
                  return (
                    <div key={bucket.label} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-20 text-right shrink-0">
                        {bucket.label}
                      </span>
                      <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-emerald-500/70"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums w-8 shrink-0">
                        {bucket.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Status breakdown */}
            <section>
              <h3 className="text-xs font-semibold mb-2">Desglose por estado</h3>
              <div className="flex flex-wrap gap-2">
                <StatusPill label="Pendientes" count={stats.statusBreakdown.pending} className="bg-zinc-100 text-zinc-700" />
                <StatusPill label="Analizando" count={stats.statusBreakdown.analyzing} className="bg-yellow-100 text-yellow-700" />
                <StatusPill label="Analizadas" count={stats.statusBreakdown.analyzed} className="bg-sky-100 text-sky-700" />
                <StatusPill label="Con caption" count={stats.statusBreakdown.captioned} className="bg-emerald-100 text-emerald-700" />
                <StatusPill label="Error" count={stats.statusBreakdown.error} className="bg-red-100 text-red-700" />
              </div>
            </section>

            {/* Top tags */}
            <section>
              <h3 className="text-xs font-semibold mb-2">Top 20 tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {stats.topTags.map(({ tag, count }) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px] gap-1"
                    title={tag}
                  >
                    <span className="truncate max-w-[140px]">{tag}</span>
                    <span className="text-muted-foreground">{count}</span>
                  </Badge>
                ))}
              </div>
            </section>

            {/* Cleanup candidates + coverage */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Candidatos a limpiar
                </p>
                <p className="text-2xl font-semibold tabular-nums">
                  {stats.rareTagsCount}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Tags appearing in only 1 caption
                </p>
              </div>
              <div className="rounded-md border p-3 space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  Cobertura faltante
                </p>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{stats.withoutCaption}</span>
                  <span className="text-muted-foreground"> sin caption</span>
                </p>
                <p className="text-sm">
                  <span className="font-semibold tabular-nums">{stats.withoutNotes}</span>
                  <span className="text-muted-foreground"> sin notas</span>
                </p>
              </div>
            </section>

            {/* Dimensions */}
            {Object.keys(stats.dimensionBuckets).length > 0 && (
              <section>
                <h3 className="text-xs font-semibold mb-2">Distribución de resolución</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.dimensionBuckets)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([tier, count]) => (
                      <StatusPill
                        key={tier}
                        label={tier}
                        count={count}
                        className="bg-muted text-foreground"
                      />
                    ))}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md border p-2.5 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 p-2 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium',
        className
      )}
    >
      {label}
      <span className="tabular-nums opacity-80">{count}</span>
    </span>
  );
}
