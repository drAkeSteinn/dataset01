import { NextResponse } from 'next/server';
import { getDatabasePath } from '@/lib/db-init';
import fs from 'fs';

/**
 * GET /api/database/export - Download the current database file
 * Returns the SQLite database file as a downloadable attachment
 */
export async function GET() {
  try {
    const dbPath = getDatabasePath();

    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Database file does not exist' },
        { status: 404 }
      );
    }

    const buffer = fs.readFileSync(dbPath);
    const filename = `tirano-captions-${new Date().toISOString().split('T')[0]}.db`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Error exporting database:', error);
    return NextResponse.json(
      { error: 'Failed to export database' },
      { status: 500 }
    );
  }
}
