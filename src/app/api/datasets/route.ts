import { NextRequest, NextResponse } from 'next/server';
import {
  listDatasets,
  createDataset,
  importFromFolder,
} from '@/lib/file-storage';

/**
 * GET /api/datasets - Return all datasets with image count
 */
export async function GET() {
  try {
    const datasets = listDatasets();
    return NextResponse.json(datasets);
  } catch (error) {
    console.error('Error fetching datasets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch datasets' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/datasets - Create dataset, optionally import images from a folder path
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      name,
      description,
      triggerWord,
      captionStyle,
      captionTemplate,
      importPath,
      llmProvider,
      llmModel,
      llmEndpoint,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const dataset = createDataset({
      name,
      description: description || '',
      triggerWord: triggerWord || '',
      captionStyle: captionStyle || 'natural',
      captionTemplate: captionTemplate || '',
      llmProvider: llmProvider || 'zai',
      llmModel: llmModel || '',
      llmEndpoint: llmEndpoint || '',
    });

    // If an import path is provided, copy images from that folder
    let importedCount = 0;
    if (importPath) {
      try {
        const result = await importFromFolder(dataset.id, importPath);
        importedCount = result.imported;
      } catch (err) {
        console.error('Import failed:', err);
      }
    }

    return NextResponse.json(
      {
        ...dataset,
        importedCount,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating dataset:', error);
    return NextResponse.json(
      { error: 'Failed to create dataset' },
      { status: 500 }
    );
  }
}
