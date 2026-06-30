import { NextRequest, NextResponse } from 'next/server';
import { listImages, getDataset } from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/datasets/[id]/images - Return paginated images with optional status filter
 * Query params: page, limit, status
 */
export async function GET(
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

    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    // Allow large datasets to load in a single request. The previous cap of 500
    // silently truncated galleries with more images than that.
    const limit = Math.min(
      10000,
      Math.max(1, parseInt(searchParams.get('limit') || '20', 10))
    );
    const statusParam = searchParams.get('status');
    const status = statusParam && statusParam !== 'all' ? statusParam : undefined;

    // Fetch all images and filter in memory
    let images = listImages(id);

    if (status) {
      images = images.filter((img) => img.status === status);
    }

    const total = images.length;
    const start = (page - 1) * limit;
    const paged = images.slice(start, start + limit);

    return NextResponse.json({
      images: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    console.error('Error fetching images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}
