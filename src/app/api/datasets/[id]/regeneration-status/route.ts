import { NextResponse } from 'next/server';
import { getRegenerationPendingCount, getDataset } from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/datasets/[id]/regeneration-status
 *
 * Returns the count of images pending regeneration.
 * The frontend uses this to show "Resume Regeneration (X remaining)"
 * when a previous regeneration batch was interrupted.
 */
export async function GET(
  _request: Request,
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

    const pendingCount = getRegenerationPendingCount(id);

    return NextResponse.json({
      pendingCount,
      hasPendingRegeneration: pendingCount > 0,
    });
  } catch (error) {
    console.error('Error checking regeneration status:', error);
    return NextResponse.json(
      { error: 'Failed to check regeneration status' },
      { status: 500 }
    );
  }
}
