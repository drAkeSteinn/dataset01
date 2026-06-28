import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export const DATA_ROOT = process.env.DATA_ROOT || '/home/z/my-project/data';

/**
 * Get the filesystem path for a dataset's image directory.
 */
export function getDatasetPath(datasetId: string): string {
  return path.join(DATA_ROOT, datasetId);
}

/**
 * Ensure the dataset directory exists, creating it recursively if needed.
 */
export async function ensureDatasetDir(datasetId: string): Promise<string> {
  const dir = getDatasetPath(datasetId);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  return dir;
}

export interface ScannedImage {
  filename: string;
  imagePath: string;
  captionPath: string | null;
  existingCaption: string | null;
}

/**
 * Scan a directory for image files and pair them with .txt captions.
 * Looks for .png, .jpg, .jpeg files and matches .txt counterparts.
 */
export async function scanDatasetDir(dirPath: string): Promise<ScannedImage[]> {
  if (!existsSync(dirPath)) {
    return [];
  }

  const entries = await fs.readdir(dirPath);
  const imageExtensions = new Set(['.png', '.jpg', '.jpeg']);
  const imageFiles = entries.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return imageExtensions.has(ext);
  });

  const results: ScannedImage[] = [];

  for (const filename of imageFiles) {
    const imagePath = path.join(dirPath, filename);
    const baseName = path.basename(filename, path.extname(filename));
    const captionPath = path.join(dirPath, `${baseName}.txt`);
    let existingCaption: string | null = null;

    if (existsSync(captionPath)) {
      try {
        existingCaption = (await fs.readFile(captionPath, 'utf-8')).trim();
      } catch {
        existingCaption = null;
      }
    }

    results.push({
      filename,
      imagePath,
      captionPath: existsSync(captionPath) ? captionPath : null,
      existingCaption,
    });
  }

  return results;
}

/**
 * Write a caption .txt file next to the image file.
 */
export async function writeCaption(
  imagePath: string,
  caption: string
): Promise<void> {
  const ext = path.extname(imagePath);
  const captionPath = imagePath.replace(new RegExp(`\\${ext}$`), '.txt');
  await fs.writeFile(captionPath, caption, 'utf-8');
}

/**
 * Read the caption .txt file associated with an image.
 * Returns null if no caption file exists.
 */
export async function readCaption(imagePath: string): Promise<string | null> {
  const ext = path.extname(imagePath);
  const captionPath = imagePath.replace(new RegExp(`\\${ext}$`), '.txt');
  if (!existsSync(captionPath)) {
    return null;
  }
  try {
    return (await fs.readFile(captionPath, 'utf-8')).trim();
  } catch {
    return null;
  }
}

/**
 * Delete an image file and its associated .txt caption file.
 */
export async function deleteImageFiles(imagePath: string): Promise<void> {
  const ext = path.extname(imagePath);
  const captionPath = imagePath.replace(new RegExp(`\\${ext}$`), '.txt');

  const deletes: Promise<void>[] = [];
  if (existsSync(imagePath)) {
    deletes.push(fs.unlink(imagePath));
  }
  if (existsSync(captionPath)) {
    deletes.push(fs.unlink(captionPath));
  }
  await Promise.all(deletes);
}

/**
 * Delete an entire dataset directory and all its contents.
 */
export async function deleteDatasetDir(datasetId: string): Promise<void> {
  const dir = getDatasetPath(datasetId);
  if (existsSync(dir)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
