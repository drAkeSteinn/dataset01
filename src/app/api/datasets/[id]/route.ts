import { NextRequest, NextResponse } from 'next/server';
import {
  getDataset,
  updateDataset,
  deleteDataset,
  getDatasetStats,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/datasets/[id] - Return dataset with stats
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

    const stats = getDatasetStats(id);

    return NextResponse.json({
      ...dataset,
      stats,
    });
  } catch (error) {
    console.error('Error fetching dataset:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dataset' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/datasets/[id] - Update dataset settings
 */
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const allowedFields = [
      'name',
      'description',
      'triggerWord',
      'captionStyle',
      'captionTemplate',
      'llmProvider',
      'llmModel',
      'llmEndpoint',
    ] as const;

    const updates: Record<string, string> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const dataset = updateDataset(id, updates);

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(dataset);
  } catch (error) {
    console.error('Error updating dataset:', error);
    return NextResponse.json(
      { error: 'Failed to update dataset' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/datasets/[id] - Delete dataset and its folder
 */
export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const success = deleteDataset(id);

    if (!success) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    return NextResponse.json(
      { error: 'Failed to delete dataset' },
      { status: 500 }
    );
  }
}
