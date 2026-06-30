import { NextResponse } from 'next/server';
import { getDataset, listImages } from '@/lib/file-storage';
import { computePHash, hammingDistance } from '@/lib/perceptual-hash';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/datasets/[id]/duplicates - Find duplicate and near-duplicate images
 *
 * Uses perceptual hashing (pHash) to detect:
 *   - Exact image duplicates (hamming distance 0)
 *   - Near-duplicates / very similar images (distance <= threshold, default 5)
 *
 * Also detects exact caption duplicates (identical caption text across images).
 *
 * Returns:
 *   imageDuplicates: Array of groups of similar images
 *   captionDuplicates: Array of groups of images with identical captions
 *   totalImages, totalHashed
 */
export async function GET(
  request: Request,
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

    const url = new URL(request.url);
    const threshold = Math.min(
      20,
      Math.max(0, parseInt(url.searchParams.get('threshold') || '5', 10))
    );

    const images = listImages(id);

    // --- Image duplicates via pHash ---
    // Compute hash for each image (skipping those that fail).
    type Hashed = { id: string; filename: string; hash: string; caption: string };
    const hashed: Hashed[] = [];
    for (const img of images) {
      try {
        const hash = await computePHash(img.originalPath);
        hashed.push({
          id: img.id,
          filename: img.filename,
          hash,
          caption: img.caption || '',
        });
      } catch {
        // skip images that can't be hashed (corrupt, etc.)
      }
    }

    // Group images whose pairwise hamming distance <= threshold.
    const visited = new Set<number>();
    const imageGroups: Array<{
      distance: number;
      images: Array<{ id: string; filename: string }>;
    }> = [];

    for (let i = 0; i < hashed.length; i++) {
      if (visited.has(i)) continue;
      const group: Array<{ id: string; filename: string }> = [
        { id: hashed[i].id, filename: hashed[i].filename },
      ];
      visited.add(i);
      let minDist = Infinity;
      for (let j = i + 1; j < hashed.length; j++) {
        if (visited.has(j)) continue;
        const dist = hammingDistance(hashed[i].hash, hashed[j].hash);
        if (dist <= threshold) {
          group.push({ id: hashed[j].id, filename: hashed[j].filename });
          visited.add(j);
          minDist = Math.min(minDist, dist);
        }
      }
      if (group.length > 1) {
        imageGroups.push({ distance: minDist, images: group });
      }
    }

    // --- Caption duplicates (exact text match) ---
    const captionMap = new Map<string, Array<{ id: string; filename: string }>>();
    for (const h of hashed) {
      if (!h.caption.trim()) continue;
      // Normalize: trim + collapse whitespace for comparison.
      const key = h.caption.trim().replace(/\s+/g, ' ').toLowerCase();
      const arr = captionMap.get(key) || [];
      arr.push({ id: h.id, filename: h.filename });
      captionMap.set(key, arr);
    }
    const captionGroups = [...captionMap.values()]
      .filter((g) => g.length > 1)
      .map((images) => ({ images }));

    return NextResponse.json({
      datasetId: id,
      totalImages: images.length,
      totalHashed: hashed.length,
      threshold,
      imageDuplicateGroups: imageGroups,
      captionDuplicateGroups: captionGroups,
      totalImageDuplicates: imageGroups.reduce(
        (sum, g) => sum + g.images.length,
        0
      ),
      totalCaptionDuplicates: captionGroups.reduce(
        (sum, g) => sum + g.images.length,
        0
      ),
    });
  } catch (error) {
    console.error('Error detecting duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to detect duplicates' },
      { status: 500 }
    );
  }
}
