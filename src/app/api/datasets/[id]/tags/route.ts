import { NextRequest, NextResponse } from 'next/server';
import {
  getDataset,
  getAllTags,
  addTagToAll,
  removeTagFromAll,
  searchCaptions,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * GET /api/datasets/[id]/tags - List all tags in the dataset
 *
 * Reads all .txt caption files, splits by comma, and returns
 * a list of unique tags with their frequency count.
 *
 * Query params:
 *   search?: string - Filter tags by search query
 */
export async function GET(
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

    const { searchParams } = request.nextUrl;
    const search = searchParams.get('search');

    if (search) {
      // Search mode: find captions containing the query
      const results = searchCaptions(id, search);
      return NextResponse.json({
        type: 'search',
        query: search,
        results,
        count: results.length,
      });
    }

    // Default: list all tags with counts
    const tags = getAllTags(id);

    return NextResponse.json({
      type: 'tags',
      tags,
      totalUniqueTags: tags.length,
      totalImages: dataset.imageCount,
    });
  } catch (error) {
    console.error('Error listing tags:', error);
    return NextResponse.json(
      { error: 'Failed to list tags' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/datasets/[id]/tags - Add or remove a tag from all captions
 *
 * Body:
 *   action: 'add' | 'remove'
 *   tag: string             - The tag to add/remove
 *   position?: 'start' | 'end'  - For 'add': where to insert (default: 'end')
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
    const { action, tag, position } = body;

    if (!tag || typeof tag !== 'string') {
      return NextResponse.json(
        { error: 'Tag is required' },
        { status: 400 }
      );
    }

    if (action === 'add') {
      const pos = position === 'start' ? 'start' : 'end';
      const modified = addTagToAll(id, tag, pos);
      return NextResponse.json({
        success: true,
        action: 'add',
        tag,
        position: pos,
        modified,
        message: `Added "${tag}" to ${modified} caption(s) at the ${pos}`,
      });
    } else if (action === 'remove') {
      const modified = removeTagFromAll(id, tag);
      return NextResponse.json({
        success: true,
        action: 'remove',
        tag,
        modified,
        message: `Removed "${tag}" from ${modified} caption(s)`,
      });
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "add" or "remove".' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Error managing tags:', error);
    return NextResponse.json(
      { error: 'Failed to manage tags' },
      { status: 500 }
    );
  }
}
