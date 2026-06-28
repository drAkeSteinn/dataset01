import { NextRequest, NextResponse } from 'next/server';
import { getDatabasePath } from '@/lib/db-init';
import fs from 'fs';

/**
 * GET /api/database/status - Check database status
 * Returns whether the database exists and its size
 */
export async function GET() {
  try {
    const dbPath = getDatabasePath();
    const exists = fs.existsSync(dbPath);

    let size = 0;
    if (exists) {
      const stats = fs.statSync(dbPath);
      size = stats.size;
    }

    return NextResponse.json({
      exists,
      path: dbPath,
      size,
      sizeFormatted: formatFileSize(size),
    });
  } catch (error) {
    console.error('Error checking database status:', error);
    return NextResponse.json(
      { error: 'Failed to check database status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/database/import - Import a database file
 * Accepts multipart/form-data with a 'database' file field
 * Replaces the current database with the uploaded one
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('database') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No database file provided' },
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.db') && !file.name.endsWith('.sqlite')) {
      return NextResponse.json(
        { error: 'File must be a .db or .sqlite file' },
        { status: 400 }
      );
    }

    const dbPath = getDatabasePath();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Backup current database if it exists
    if (fs.existsSync(dbPath)) {
      const backupPath = dbPath + '.backup';
      fs.copyFileSync(dbPath, backupPath);
      console.log(`[db] Backed up current database to ${backupPath}`);
    }

    // Write the new database
    fs.writeFileSync(dbPath, buffer);
    console.log(`[db] Imported database (${formatFileSize(buffer.length)})`);

    return NextResponse.json({
      success: true,
      message: 'Database imported successfully. Please restart the application.',
      size: buffer.length,
    });
  } catch (error) {
    console.error('Error importing database:', error);
    return NextResponse.json(
      { error: 'Failed to import database' },
      { status: 500 }
    );
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
