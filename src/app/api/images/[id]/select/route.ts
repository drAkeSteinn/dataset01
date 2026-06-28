import { NextRequest, NextResponse } from 'next/server';
import {
  decodeImageId,
  updateImageMetadata,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/images/[id]/select - Toggle selectedForRegen flag
 *
 * Body:
 *   selected: boolean - true to select, false to deselect
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

    const body = await request.json();
    const selected = !!body.selected;

    updateImageMetadata(datasetId, filename, { selectedForRegen: selected });

    return NextResponse.json({
      success: true,
      selected,
    });
  } catch (error) {
    console.error('Error toggling selection:', error);
    return NextResponse.json(
      { error: 'Failed to toggle selection' },
      { status: 500 }
    );
  }
}
