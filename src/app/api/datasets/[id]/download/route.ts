import { NextRequest, NextResponse } from 'next/server';
import { ZipArchive } from 'archiver';
import { createReadStream, existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { getDataset, getDatasetFolderPath } from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/datasets/[id]/download - Create streaming zip of ALL files in the dataset folder.
 *
 * Includes: images, .txt captions, dataset.json, metadata.json
 */
export async function GET(
  _request: NextRequest,
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

    const folderPath = getDatasetFolderPath(id);

    if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
      return NextResponse.json(
        { error: 'Dataset folder not found on disk' },
        { status: 404 }
      );
    }

    // Collect all files in the folder (non-recursive)
    const allFiles = readdirSync(folderPath).filter((f) => {
      const fullPath = path.join(folderPath, f);
      return existsSync(fullPath) && statSync(fullPath).isFile();
    });

    if (allFiles.length === 0) {
      return NextResponse.json(
        { error: 'No files available for download' },
        { status: 400 }
      );
    }

    // Create a zip archive
    const archive = new ZipArchive({ zlib: { level: 6 } });
    const chunks: Buffer[] = [];

    archive.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    const archivePromise = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      archive.on('error', (err: Error) => {
        reject(err);
      });
    });

    // Add every file in the folder to the archive
    for (const filename of allFiles) {
      const fullPath = path.join(folderPath, filename);
      archive.append(createReadStream(fullPath), { name: filename });
    }

    archive.finalize();

    const zipBuffer = await archivePromise;

    const sanitized = dataset.name.replace(/[^a-zA-Z0-9_-]/g, '_');

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${sanitized}_dataset.zip"`,
        'Content-Length': zipBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error creating download zip:', error);
    return NextResponse.json(
      { error: 'Failed to create download zip' },
      { status: 500 }
    );
  }
}
