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

    // Generate the caption
    const caption = await provider.generateCaption({
      imagePath: image.originalPath,
      vlmAnalysis: image.vlmAnalysis,
      colorInfo: image.colorInfo,
      imageDescription: imageDescriptionOverride ?? image.imageDescription,
      triggerWord: dataset.triggerWord,
      captionStyle: dataset.captionStyle,
      captionTemplate: dataset.captionTemplate,
      description: dataset.description,
      model: dataset.llmModel,
      endpoint: dataset.llmEndpoint,
    });

    if (!caption) {
      throw new Error('Provider returned an empty caption');
    }

    // Write caption file to disk + update metadata
    saveCaption(datasetId, filename, caption);
    updateImageMetadata(datasetId, filename, {
      status: 'captioned',
      errorMessage: '',
    });

    // Re-read updated image
    const updated = getImage(datasetId, filename);

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
