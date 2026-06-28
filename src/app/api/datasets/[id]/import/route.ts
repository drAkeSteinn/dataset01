import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { getDataset, importFromFolder } from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/datasets/[id]/import - Copy images from an external folder into the dataset folder
 *
 * Body: { folderPath: string }
 */
export async function POST(
  request: NextRequest,
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

    const body = await request.json();
    const { folderPath } = body;

    if (!folderPath || typeof folderPath !== 'string') {
      return NextResponse.json(
        { error: 'folderPath is required' },
        { status: 400 }
      );
    }

    if (!existsSync(folderPath)) {
      return NextResponse.json(
        { error: 'Folder path does not exist' },
        { status: 400 }
      );
    }

    let result;
    try {
      result = await importFromFolder(id, folderPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (result.imported === 0) {
      return NextResponse.json(
        { error: 'No images found in the specified folder' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      imported: result.imported,
      skipped: 0,
      total: result.imported,
    });
  } catch (error) {
    console.error('Error importing images:', error);
    return NextResponse.json(
      { error: 'Failed to import images' },
      { status: 500 }
    );
  }
}
