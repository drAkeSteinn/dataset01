import { NextRequest, NextResponse } from 'next/server';
import { getProvider } from '@/lib/providers';
import { existsSync } from 'fs';
import {
  decodeImageId,
  getDataset,
  getImage,
  saveCaption,
  updateImageMetadata,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

// ─── Per-process regeneration queue ─────────────────────────────────────────
//
// Single-image regenerations triggered from the detail panel are serialized
// across the whole server process. If a user clicks "Regenerate" on image A,
// then switches to image B and clicks again, B waits in the queue until A
// finishes. This prevents concurrent calls to the LLM provider (especially
// ZAI) which would otherwise trigger HTTP 429 rate-limit errors.
//
// The queue is a simple promise chain: each request awaits the previous one.

let regenerationChain: Promise<unknown> = Promise.resolve();

async function withRegenerationLock<T>(task: () => Promise<T>): Promise<T> {
  // Chain this task after the previous one. We catch errors on the chain
  // itself so a failure in one task never blocks subsequent tasks.
  const run = regenerationChain.then(task, task);
  // Keep the chain going even if this task rejects.
  regenerationChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * POST /api/images/[id]/regenerate - Regenerate caption for a single image
 *
 * The `id` param is a base64url-encoded string of `datasetId/filename`.
 *
 * Uses the dataset's configured LLM provider and settings.
 * Includes the image's per-image description (if set) in the prompt.
 *
 * Body (optional):
 *   imageDescription?: string - Override the stored image description for this generation
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    let datasetId: string;
    let filename: string;
    try {
      ({ datasetId, filename } = decodeImageId(id));
    } catch {
      return NextResponse.json(
        { error: 'Invalid image ID format' },
        { status: 400 }
      );
    }

    const dataset = getDataset(datasetId);
    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const image = getImage(datasetId, filename);
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    if (!existsSync(image.originalPath)) {
      return NextResponse.json(
        { error: 'Image file not found on disk' },
        { status: 404 }
      );
    }

    // Get optional override for image description
    let imageDescriptionOverride: string | undefined;
    try {
      const body = await request.json();
      if (typeof body.imageDescription === 'string') {
        imageDescriptionOverride = body.imageDescription;
      }
    } catch {
      // No body, use stored description
    }

    // Get the provider
    const providerId = dataset.llmProvider || 'zai';
    const provider = getProvider(providerId);

    // Generate the caption inside the per-process lock so concurrent
    // single-image regenerations are serialized (prevents provider rate-limit
    // errors when the user clicks "Regenerate" on several images in a row).
    const { caption, updated } = await withRegenerationLock(async () => {
      const generated = await provider.generateCaption({
        imagePath: image.originalPath,
        vlmAnalysis: image.vlmAnalysis,
        colorInfo: image.colorInfo,
        imageDescription: imageDescriptionOverride ?? image.imageDescription,
        triggerWord: image.triggerWordOverride || dataset.triggerWord,
        captionStyle: dataset.captionStyle,
        captionTemplate: dataset.captionTemplate,
        description: dataset.description,
        systemPromptOverride: dataset.systemPromptOverride,
        model: dataset.llmModel,
        endpoint: dataset.llmEndpoint,
      });

      if (!generated) {
        throw new Error('Provider returned an empty caption');
      }

      // Write caption file to disk + update metadata
      saveCaption(datasetId, filename, generated);
      updateImageMetadata(datasetId, filename, {
        status: 'captioned',
        errorMessage: '',
      });

      // Re-read updated image
      return { caption: generated, updated: getImage(datasetId, filename) };
    });

    return NextResponse.json({
      success: true,
      image: updated,
      caption,
    });
  } catch (error) {
    console.error('Error regenerating caption:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Try to mark the image status to error
    try {
      const { datasetId, filename } = decodeImageId(id);
      updateImageMetadata(datasetId, filename, {
        status: 'error',
        errorMessage: `Caption regeneration failed: ${message}`,
      });
    } catch {
      // Ignore metadata update failure
    }

    return NextResponse.json(
      { error: `Failed to regenerate caption: ${message}` },
      { status: 500 }
    );
  }
}
