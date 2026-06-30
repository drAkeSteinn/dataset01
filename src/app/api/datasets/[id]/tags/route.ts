import { NextRequest, NextResponse } from 'next/server';
import {
  getDataset,
  getAllTags,
  addTagToAll,
  removeTagFromAll,
  renameTagInAll,
  replaceInAllCaptions,
  previewReplaceInAllCaptions,
  searchCaptions,
  countCaptionsWithTag,
  countCaptionFiles,
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
    const previewTag = searchParams.get('preview');
    const replaceFind = searchParams.get('replaceFind');

    // Preview mode: how many captions already contain a tag (for the "Add Tag"
    // confirmation dialog, so the user sees how many will be affected / skipped).
    if (previewTag) {
      const totalCaptionFiles = countCaptionFiles(id);
      const alreadyHave = countCaptionsWithTag(id, previewTag);
      return NextResponse.json({
        type: 'preview',
        tag: previewTag,
        totalCaptionFiles,
        alreadyHave,
        wouldAddTo: Math.max(0, totalCaptionFiles - alreadyHave),
      });
    }

    // Find & replace preview: count matching files without modifying.
    if (replaceFind !== null) {
      const matchCase = searchParams.get('matchCase') === '1';
      const wholeWord = searchParams.get('wholeWord') === '1';
      const result = previewReplaceInAllCaptions(id, replaceFind, { matchCase, wholeWord });
      return NextResponse.json({ type: 'replace-preview', ...result });
    }

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
      totalCaptionFiles: countCaptionFiles(id),
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
 * PUT /api/datasets/[id]/tags - Rename a tag across all captions
 *
 * Body:
 *   oldTag: string - The tag to rename
 *   newTag: string - The new tag text
 */
export async function PUT(
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
    const { oldTag, newTag } = body;

    if (!oldTag || typeof oldTag !== 'string') {
      return NextResponse.json(
        { error: 'oldTag is required' },
        { status: 400 }
      );
    }
    if (!newTag || typeof newTag !== 'string') {
      return NextResponse.json(
        { error: 'newTag is required' },
        { status: 400 }
      );
    }

    const modified = renameTagInAll(id, oldTag, newTag);

    return NextResponse.json({
      success: true,
      action: 'rename',
      oldTag,
      newTag,
      modified,
      message: `Renamed "${oldTag}" → "${newTag}" in ${modified} caption(s)`,
    });
  } catch (error) {
    console.error('Error renaming tag:', error);
    return NextResponse.json(
      { error: 'Failed to rename tag' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/datasets/[id]/tags - Find & replace text across all captions
 *
 * Body:
 *   find: string       - Text to find (substring or whole word)
 *   replace: string    - Replacement text
 *   matchCase?: boolean - Default false (case-insensitive)
 *   wholeWord?: boolean - Default false (substring match)
 */
export async function PATCH(
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
    const { find, replace, matchCase, wholeWord } = body;

    if (typeof find !== 'string' || !find) {
      return NextResponse.json(
        { error: 'find is required and must be a non-empty string' },
        { status: 400 }
      );
    }
    if (typeof replace !== 'string') {
      return NextResponse.json(
        { error: 'replace is required and must be a string' },
        { status: 400 }
      );
    }

    const modified = replaceInAllCaptions(id, find, replace, {
      matchCase: !!matchCase,
      wholeWord: !!wholeWord,
    });

    return NextResponse.json({
      success: true,
      action: 'replace',
      find,
      replace,
      modified,
      message: `Replaced "${find}" → "${replace}" in ${modified} caption(s)`,
    });
  } catch (error) {
    console.error('Error in find & replace:', error);
    return NextResponse.json(
      { error: 'Failed to perform find & replace' },
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
