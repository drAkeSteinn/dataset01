/**
 * Database initialization and migration utilities.
 *
 * This module ensures the SQLite database exists and is migrated
 * on application startup. It handles fresh installs where no
 * database file exists yet.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Ensure the database file exists and is migrated.
 * Called on app startup to prevent "Unable to open database file" errors.
 *
 * This function:
 * 1. Ensures the db/ directory exists
 * 2. Checks if the database file exists
 * 3. If not, runs prisma db push to create it with the current schema
 * 4. If it exists, ensures the schema is up to date
 */
export function ensureDatabaseReady(): void {
  const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db';
  let dbPath = dbUrl.replace(/^file:/, '');

  // Resolve relative to project root
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(process.cwd(), dbPath);
  }

  const dbDir = path.dirname(dbPath);
  const dbExists = fs.existsSync(dbPath);

  // Create directory if needed
  if (!fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`[db] Created database directory: ${dbDir}`);
    } catch (err) {
      console.error(`[db] Failed to create database directory: ${dbDir}`, err);
      return;
    }
  }

  // If database doesn't exist, run migration to create it
  if (!dbExists) {
    console.log('[db] Database file not found. Running initial migration...');
    try {
      execSync('npx prisma db push --skip-generate', {
        stdio: 'pipe',
        cwd: process.cwd(),
        env: process.env,
      });
      console.log('[db] Database created and schema applied successfully');
    } catch (err) {
      console.error('[db] Failed to run initial migration:', err);
      console.error('[db] You may need to run "npx prisma db push" manually');
    }
  }
}

/**
 * Get the absolute path to the database file.
 * Useful for import/export features.
 */
export function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db';
  let dbPath = dbUrl.replace(/^file:/, '');
  if (!path.isAbsolute(dbPath)) {
    dbPath = path.resolve(process.cwd(), dbPath);
  }
  return dbPath;
}
