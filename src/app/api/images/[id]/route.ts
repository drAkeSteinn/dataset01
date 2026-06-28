import { NextRequest, NextResponse } from 'next/server';
import {
  decodeImageId,
  getImage,
  saveCaption,
  updateImageMetadata,
  deleteImage,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * PUT /api/images/[id] - Update caption and/or image description
 *
 * The `id` param is a base64url-encoded string of `datasetId/filename`.
 *
 * Body:
 *   caption?: string          - Update caption text (writes .txt file on disk)
 *   imageDescription?: string - Update per-image description used for caption generation
 */
export async function PUT(
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

    const image = getImage(datasetId, filename);

    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const body = await request.json();

    // Update caption if provided (writes .txt file on disk)
    if (typeof body.caption === 'string') {
      saveCaption(datasetId, filename, body.caption);
      // Update status based on whether caption is non-empty
      const newStatus = body.caption.trim() ? 'captioned' : 'analyzed';
      updateImageMetadata(datasetId, filename, { status: newStatus });
    }

    // Update image description if provided
    if (typeof body.imageDescription === 'string') {
      updateImageMetadata(datasetId, filename, {
        imageDescription: body.imageDescription,
      });
    }

    // Re-read the updated image to return fresh state
    const updated = getImage(datasetId, filename);

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating image:', error);
    return NextResponse.json(
      { error: 'Failed to update image' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/images/[id] - Delete an image and its associated files
 *
 * Removes:
 * - The image file (.png, .jpg, etc.)
 * - The .txt caption file (if it exists)
 * - The metadata entry in metadata.json
 */
export async function DELETE(
  _request: NextRequest,
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

    const image = getImage(datasetId, filename);
    if (!image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    const deleted = deleteImage(datasetId, filename);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Nothing was deleted' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Deleted ${filename} and associated files`,
    });
  } catch (error) {
    console.error('Error deleting image:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}
