import { NextRequest, NextResponse } from 'next/server';
import {
  getDataset,
  saveUploadedFile,
  getImage,
  encodeImageId,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];

function isImageFilename(filename: string): boolean {
  const ext = '.' + filename.split('.').pop()?.toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * POST /api/datasets/[id]/upload - Upload image files (multipart/form-data)
 *
 * Form field: files[] (one or more image files)
 */
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    // Verify dataset exists
    const dataset = getDataset(id);
    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    // Accept both "files" and "files[]" field names
    const files = [
      ...formData.getAll('files'),
      ...formData.getAll('files[]'),
    ].filter((f) => f instanceof File) as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'No files provided. Use field name "files" or "files[]".' },
        { status: 400 }
      );
    }

    const savedImages: Array<{
      id: string;
      filename: string;
      datasetId: string;
      status: string;
    }> = [];
    let uploaded = 0;

    for (const file of files) {
      if (!(file instanceof File)) {
        continue;
      }

      const filename = file.name || `upload-${Date.now()}.png`;

      // Skip non-image files
      if (!isImageFilename(filename)) {
        continue;
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const savedName = saveUploadedFile(id, filename, buffer);
      const image = getImage(id, savedName);

      if (image) {
        savedImages.push({
          id: encodeImageId(id, savedName),
          filename: savedName,
          datasetId: id,
          status: image.status,
        });
      } else {
        savedImages.push({
          id: encodeImageId(id, savedName),
          filename: savedName,
          datasetId: id,
          status: 'pending',
        });
      }
      uploaded++;
    }

    return NextResponse.json(
      {
        uploaded,
        images: savedImages,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error uploading files:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}
