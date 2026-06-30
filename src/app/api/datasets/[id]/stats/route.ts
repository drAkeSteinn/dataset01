import { NextResponse } from 'next/server';
import {
  getDataset,
  listImages,
  getAllTags,
  countCaptionFiles,
} from '@/lib/file-storage';
import { estimateClipTokens } from '@/lib/token-estimator';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/datasets/[id]/stats - Aggregate statistics for a dataset
 *
 * Returns:
 *   - captionLength: { min, max, avg, median, distribution }
 *   - topTags: top 20 tags by frequency
 *   - rareTagsCount: tags that appear in only 1 caption (cleanup candidates)
 *   - statusBreakdown: counts per status
 *   - dimensionBuckets: count of images grouped by resolution tier
 */
export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    const dataset = getDataset(id);
    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const images = listImages(id);
    const tags = getAllTags(id);
    const totalCaptionFiles = countCaptionFiles(id);

    // --- Caption length stats (in CLIP tokens, approximated) ---
    const captionedImages = images.filter((img) => img.caption && img.caption.trim());
    const tokenCounts = captionedImages.map((img) => estimateClipTokens(img.caption));
    const tokenStats = tokenCounts.length
      ? {
          min: Math.min(...tokenCounts),
          max: Math.max(...tokenCounts),
          avg: Math.round(
            tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length
          ),
          median: median(tokenCounts),
          distribution: bucketize(tokenCounts, [
            0, 10, 20, 30, 50, 75, 100, 150, 200,
          ]),
        }
      : { min: 0, max: 0, avg: 0, median: 0, distribution: [] as Array<{ label: string; count: number }> };

    // --- Tags ---
    const topTags = tags.slice(0, 20);
    const rareTags = tags.filter((t) => t.count === 1);

    // --- Status breakdown ---
    const statusBreakdown = {
      total: images.length,
      pending: 0,
      analyzing: 0,
      analyzed: 0,
      captioned: 0,
      error: 0,
    };
    for (const img of images) {
      const s = img.status as keyof typeof statusBreakdown;
      if (s in statusBreakdown) statusBreakdown[s]++;
    }

    // --- Dimension buckets ---
    const dimensionBuckets: Record<string, number> = {};
    for (const img of images) {
      if (img.width > 0 && img.height > 0) {
        const tier = resolutionTier(img.width, img.height);
        dimensionBuckets[tier] = (dimensionBuckets[tier] || 0) + 1;
      }
    }

    // --- Without caption / without notes ---
    const withoutCaption = images.filter((img) => !img.caption?.trim()).length;
    const withoutNotes = images.filter(
      (img) => !img.imageDescription?.trim()
    ).length;
    const withVlm = images.filter((img) => !!img.vlmAnalysis?.trim()).length;

    return NextResponse.json({
      datasetId: id,
      datasetName: dataset.name,
      totalImages: images.length,
      totalCaptionFiles,
      totalUniqueTags: tags.length,
      captionLength: tokenStats,
      topTags,
      rareTagsCount: rareTags.length,
      statusBreakdown,
      dimensionBuckets,
      withoutCaption,
      withoutNotes,
      withVlmAnalysis: withVlm,
    });
  } catch (error) {
    console.error('Error computing dataset stats:', error);
    return NextResponse.json(
      { error: 'Failed to compute stats' },
      { status: 500 }
    );
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function bucketize(
  values: number[],
  edges: number[]
): Array<{ label: string; count: number }> {
  const buckets = edges.map((edge, i) => {
    const next = edges[i + 1];
    return {
      label: next ? `${edge}–${next}` : `${edge}+`,
      count: 0,
    };
  });
  for (const v of values) {
    for (let i = 0; i < edges.length; i++) {
      const next = edges[i + 1];
      if (next === undefined ? v >= edges[i] : v >= edges[i] && v < next) {
        buckets[i].count++;
        break;
      }
    }
  }
  return buckets;
}

function resolutionTier(w: number, h: number): string {
  const long = Math.max(w, h);
  if (long < 512) return '<512px';
  if (long < 768) return '512–767px';
  if (long < 1024) return '768–1023px';
  if (long < 1536) return '1024–1535px';
  return '1536px+';
}
