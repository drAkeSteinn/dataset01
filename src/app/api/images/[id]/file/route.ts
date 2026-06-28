import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import {
  decodeImageId,
  getDatasetFolderPath,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/images/[id]/file - Stream image file from disk with proper Content-Type
 *
 * The `id` param is a base64url-encoded string of `datasetId/filename`.
 */
export async function GET(
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

    const filePath = path.join(getDatasetFolderPath(datasetId), filename);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Image file not found on disk' },
        { status: 404 }
      );
    }

    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';

    switch (ext) {
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.webp':
        contentType = 'image/webp';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.bmp':
        contentType = 'image/bmp';
        break;
    }

    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Error serving image file:', error);
    return NextResponse.json(
      { error: 'Failed to serve image file' },
      { status: 500 }
    );
  }
}
