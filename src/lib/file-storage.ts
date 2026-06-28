/**
 * File-based dataset storage.
 *
 * Each dataset is a folder under DATA_ROOT containing:
 * - dataset.json     → Dataset metadata (name, triggerWord, provider, etc.)
 * - metadata.json    → Per-image metadata (VLM analysis, color info, status)
 * - *.png / *.jpg    → Image files
 * - *.txt             → Caption files (same name as image)
 *
 * The filesystem is the single source of truth. No database needed.
 * This makes datasets portable: just copy the folder to another machine.
 */

import fs from 'fs';
import path from 'path';

// DATA_ROOT defaults to ./data/datasets relative to project root
const DATA_ROOT = process.env.DATA_ROOT || path.resolve(process.cwd(), 'data', 'datasets');

// Ensure DATA_ROOT exists
export function ensureDataRoot(): void {
  if (!fs.existsSync(DATA_ROOT)) {
    fs.mkdirSync(DATA_ROOT, { recursive: true });
  }
}

/**
 * Get the absolute path to DATA_ROOT.
 */
export function getDataRoot(): string {
  ensureDataRoot();
  return DATA_ROOT;
}

/**
 * Slugify a name to use as a folder name.
 * "My Cool Dataset!" → "my-cool-dataset"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 60) || 'untitled';
}

/**
 * Generate a unique folder name for a dataset.
 * If the slug already exists, append a number.
 */
function uniqueFolderName(name: string): string {
  const base = slugify(name);
  let folder = base;
  let counter = 1;
  while (fs.existsSync(path.join(DATA_ROOT, folder))) {
    folder = `${base}-${counter}`;
    counter++;
  }
  return folder;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DatasetFile {
  id: string;              // Folder name (used as identifier)
  name: string;
  description: string;
  triggerWord: string;
  captionStyle: string;
  captionTemplate: string;
  llmProvider: string;
  llmModel: string;
  llmEndpoint: string;
  imagePath: string;       // Absolute path to the dataset folder
  imageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImageFile {
  id: string;              // `${datasetId}/${filename}` (base64url encoded for API)
  datasetId: string;
  filename: string;
  originalPath: string;    // Absolute path to image file
  caption: string;
  vlmAnalysis: string;
  colorInfo: string;
  imageDescription: string;
  status: string;          // pending | analyzing | analyzed | captioned | error
  errorMessage: string;
  regenerationPending: boolean;  // True when this image needs caption regeneration
  selectedForRegen: boolean;     // True when user selected this image for regeneration
  width: number;
  height: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

interface DatasetMeta {
  name: string;
  description: string;
  triggerWord: string;
  captionStyle: string;
  captionTemplate: string;
  llmProvider: string;
  llmModel: string;
  llmEndpoint: string;
  createdAt: string;
  updatedAt: string;
}

interface ImageMeta {
  vlmAnalysis?: string;
  colorInfo?: string;
  imageDescription?: string;
  status?: string;
  errorMessage?: string;
  regenerationPending?: boolean;
  selectedForRegen?: boolean;
  width?: number;
  height?: number;
  fileSize?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface MetadataFile {
  [filename: string]: ImageMeta;
}

// ─── Encoding helpers ────────────────────────────────────────────────────────

/**
 * Encode an image ID from dataset folder + filename.
 * Uses base64url to avoid special character issues in URLs.
 */
export function encodeImageId(datasetId: string, filename: string): string {
  return Buffer.from(`${datasetId}/${filename}`).toString('base64url');
}

/**
 * Decode an image ID back to { datasetId, filename }.
 */
export function decodeImageId(imageId: string): { datasetId: string; filename: string } {
  const decoded = Buffer.from(imageId, 'base64url').toString('utf-8');
  const slashIdx = decoded.indexOf('/');
  if (slashIdx === -1) {
    throw new Error('Invalid image ID format');
  }
  return {
    datasetId: decoded.substring(0, slashIdx),
    filename: decoded.substring(slashIdx + 1),
  };
}

// ─── Dataset operations ──────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];

function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function readDatasetMeta(folderPath: string): DatasetMeta | null {
  const metaPath = path.join(folderPath, 'dataset.json');
  if (!fs.existsSync(metaPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeDatasetMeta(folderPath: string, meta: DatasetMeta): void {
  fs.writeFileSync(path.join(folderPath, 'dataset.json'), JSON.stringify(meta, null, 2));
}

function readMetadataFile(folderPath: string): MetadataFile {
  const metaPath = path.join(folderPath, 'metadata.json');
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeMetadataFile(folderPath: string, metadata: MetadataFile): void {
  fs.writeFileSync(path.join(folderPath, 'metadata.json'), JSON.stringify(metadata, null, 2));
}

function countImages(folderPath: string): number {
  try {
    return fs.readdirSync(folderPath).filter(isImageFile).length;
  } catch {
    return 0;
  }
}

/**
 * List all datasets (folders with dataset.json) in DATA_ROOT.
 * Follows symlinks so linked folders work too.
 */
export function listDatasets(): DatasetFile[] {
  ensureDataRoot();
  const entries = fs.readdirSync(DATA_ROOT, { withFileTypes: true });
  const datasets: DatasetFile[] = [];

  for (const entry of entries) {
    // Check if it's a directory OR a symlink to a directory
    const fullPath = path.join(DATA_ROOT, entry.name);
    let isDir = entry.isDirectory();
    if (!isDir && entry.isSymbolicLink()) {
      try {
        isDir = fs.statSync(fullPath).isDirectory();
      } catch {
        // Broken symlink, skip
        continue;
      }
    }
    if (!isDir) continue;

    const meta = readDatasetMeta(fullPath);
    if (!meta) continue; // Skip folders without dataset.json

    datasets.push({
      id: entry.name,
      name: meta.name,
      description: meta.description || '',
      triggerWord: meta.triggerWord || '',
      captionStyle: meta.captionStyle || 'natural',
      captionTemplate: meta.captionTemplate || '',
      llmProvider: meta.llmProvider || 'zai',
      llmModel: meta.llmModel || '',
      llmEndpoint: meta.llmEndpoint || '',
      imagePath: fullPath,
      imageCount: countImages(fullPath),
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || new Date().toISOString(),
    });
  }

  // Sort by createdAt descending
  datasets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return datasets;
}

/**
 * Get a single dataset by folder name (id).
 */
export function getDataset(datasetId: string): DatasetFile | null {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
    return null;
  }
  const meta = readDatasetMeta(folderPath);
  if (!meta) return null;

  return {
    id: datasetId,
    name: meta.name,
    description: meta.description || '',
    triggerWord: meta.triggerWord || '',
    captionStyle: meta.captionStyle || 'natural',
    captionTemplate: meta.captionTemplate || '',
    llmProvider: meta.llmProvider || 'zai',
    llmModel: meta.llmModel || '',
    llmEndpoint: meta.llmEndpoint || '',
    imagePath: folderPath,
    imageCount: countImages(folderPath),
    createdAt: meta.createdAt || new Date().toISOString(),
    updatedAt: meta.updatedAt || new Date().toISOString(),
  };
}

/**
 * Create a new dataset folder with dataset.json.
 */
export function createDataset(params: {
  name: string;
  description?: string;
  triggerWord?: string;
  captionStyle?: string;
  captionTemplate?: string;
  llmProvider?: string;
  llmModel?: string;
  llmEndpoint?: string;
}): DatasetFile {
  ensureDataRoot();
  const folderName = uniqueFolderName(params.name);
  const folderPath = path.join(DATA_ROOT, folderName);
  fs.mkdirSync(folderPath, { recursive: true });

  const now = new Date().toISOString();
  const meta: DatasetMeta = {
    name: params.name,
    description: params.description || '',
    triggerWord: params.triggerWord || '',
    captionStyle: params.captionStyle || 'natural',
    captionTemplate: params.captionTemplate || '',
    llmProvider: params.llmProvider || 'zai',
    llmModel: params.llmModel || '',
    llmEndpoint: params.llmEndpoint || '',
    createdAt: now,
    updatedAt: now,
  };
  writeDatasetMeta(folderPath, meta);

  return getDataset(folderName)!;
}

/**
 * Update dataset metadata.
 */
export function updateDataset(
  datasetId: string,
  updates: Partial<{
    name: string;
    description: string;
    triggerWord: string;
    captionStyle: string;
    captionTemplate: string;
    llmProvider: string;
    llmModel: string;
    llmEndpoint: string;
  }>
): DatasetFile | null {
  const folderPath = path.join(DATA_ROOT, datasetId);
  const meta = readDatasetMeta(folderPath);
  if (!meta) return null;

  const updated: DatasetMeta = {
    ...meta,
    ...Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    ),
    updatedAt: new Date().toISOString(),
  };
  writeDatasetMeta(folderPath, updated);

  return getDataset(datasetId);
}

/**
 * Delete a dataset folder entirely.
 */
export function deleteDataset(datasetId: string): boolean {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return false;
  fs.rmSync(folderPath, { recursive: true, force: true });
  return true;
}

// ─── Image operations ────────────────────────────────────────────────────────

/**
 * List all images in a dataset folder.
 */
export function listImages(datasetId: string): ImageFile[] {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return [];

  const metadata = readMetadataFile(folderPath);
  const files = fs.readdirSync(folderPath).filter(isImageFile).sort();

  return files.map((filename) => {
    const imagePath = path.join(folderPath, filename);
    const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));
    const stat = fs.statSync(imagePath);

    // Read caption from .txt file
    let caption = '';
    if (fs.existsSync(txtPath)) {
      try {
        caption = fs.readFileSync(txtPath, 'utf-8').trim();
      } catch {}
    }

    const meta = metadata[filename] || {};

    return {
      id: encodeImageId(datasetId, filename),
      datasetId,
      filename,
      originalPath: imagePath,
      caption,
      vlmAnalysis: meta.vlmAnalysis || '',
      colorInfo: meta.colorInfo || '',
      imageDescription: meta.imageDescription || '',
      status: caption ? (meta.status || 'captioned') : (meta.status || 'pending'),
      errorMessage: meta.errorMessage || '',
      regenerationPending: meta.regenerationPending || false,
      selectedForRegen: meta.selectedForRegen || false,
      width: meta.width || 0,
      height: meta.height || 0,
      fileSize: stat.size,
      createdAt: meta.createdAt || stat.birthtime.toISOString(),
      updatedAt: meta.updatedAt || stat.mtime.toISOString(),
    };
  });
}

/**
 * Get a single image by dataset + filename.
 */
export function getImage(datasetId: string, filename: string): ImageFile | null {
  const folderPath = path.join(DATA_ROOT, datasetId);
  const imagePath = path.join(folderPath, filename);
  if (!fs.existsSync(imagePath)) return null;

  const metadata = readMetadataFile(folderPath);
  const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));
  const stat = fs.statSync(imagePath);

  let caption = '';
  if (fs.existsSync(txtPath)) {
    try {
      caption = fs.readFileSync(txtPath, 'utf-8').trim();
    } catch {}
  }

  const meta = metadata[filename] || {};

  return {
    id: encodeImageId(datasetId, filename),
    datasetId,
    filename,
    originalPath: imagePath,
    caption,
    vlmAnalysis: meta.vlmAnalysis || '',
    colorInfo: meta.colorInfo || '',
    imageDescription: meta.imageDescription || '',
    status: caption ? (meta.status || 'captioned') : (meta.status || 'pending'),
    errorMessage: meta.errorMessage || '',
    regenerationPending: meta.regenerationPending || false,
    selectedForRegen: meta.selectedForRegen || false,
    width: meta.width || 0,
    height: meta.height || 0,
    fileSize: stat.size,
    createdAt: meta.createdAt || stat.birthtime.toISOString(),
    updatedAt: meta.updatedAt || stat.mtime.toISOString(),
  };
}

/**
 * Save a caption to a .txt file alongside the image.
 */
export function saveCaption(datasetId: string, filename: string, caption: string): void {
  const folderPath = path.join(DATA_ROOT, datasetId);
  const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));
  fs.writeFileSync(txtPath, caption);
}

/**
 * Update image metadata (VLM analysis, color info, description, status).
 */
export function updateImageMetadata(
  datasetId: string,
  filename: string,
  updates: Partial<ImageMeta>
): void {
  const folderPath = path.join(DATA_ROOT, datasetId);
  const metadata = readMetadataFile(folderPath);

  metadata[filename] = {
    ...metadata[filename],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  writeMetadataFile(folderPath, metadata);
}

/**
 * Save an uploaded file to the dataset folder.
 */
export function saveUploadedFile(
  datasetId: string,
  filename: string,
  buffer: Buffer
): string {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }

  // Avoid overwriting: if file exists, append a number
  let finalName = filename;
  let counter = 1;
  while (fs.existsSync(path.join(folderPath, finalName))) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    finalName = `${base}-${counter}${ext}`;
    counter++;
  }

  const filePath = path.join(folderPath, finalName);
  fs.writeFileSync(filePath, buffer);
  return finalName;
}

/**
 * Delete an image and its associated files (.txt caption, metadata entry).
 * Removes: the image file, the .txt caption file, and the metadata entry.
 */
export function deleteImage(datasetId: string, filename: string): boolean {
  const folderPath = path.join(DATA_ROOT, datasetId);
  const imagePath = path.join(folderPath, filename);
  const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));

  let deletedSomething = false;

  // Delete image file
  if (fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
    deletedSomething = true;
  }

  // Delete .txt caption file
  if (fs.existsSync(txtPath)) {
    fs.unlinkSync(txtPath);
    deletedSomething = true;
  }

  // Remove from metadata.json
  const metadata = readMetadataFile(folderPath);
  if (metadata[filename]) {
    delete metadata[filename];
    writeMetadataFile(folderPath, metadata);
    deletedSomething = true;
  }

  return deletedSomething;
}

// ─── Tag management ──────────────────────────────────────────────────────────

/**
 * Parse all .txt captions in a dataset and extract individual tags.
 * Tags are split by comma. Returns a map of tag → count (how many images use it).
 */
export function getAllTags(datasetId: string): { tag: string; count: number }[] {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return [];

  const files = fs.readdirSync(folderPath).filter(isImageFile);
  const tagCounts = new Map<string, number>();

  for (const filename of files) {
    const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));
    if (!fs.existsSync(txtPath)) continue;

    try {
      const content = fs.readFileSync(txtPath, 'utf-8').trim();
      if (!content) continue;

      // Split by comma and clean each tag
      const tags = content
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const seen = new Set<string>();
      for (const tag of tags) {
        if (!seen.has(tag)) {
          seen.add(tag);
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
    } catch {}
  }

  // Convert to array and sort by count (descending), then alphabetically
  return Array.from(tagCounts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * Add a tag to all .txt captions in a dataset.
 * @param position 'start' or 'end'
 * @returns Number of .txt files modified
 */
export function addTagToAll(
  datasetId: string,
  tag: string,
  position: 'start' | 'end'
): number {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return 0;

  const cleanTag = tag.trim();
  if (!cleanTag) return 0;

  const files = fs.readdirSync(folderPath).filter(isImageFile);
  let modified = 0;

  for (const filename of files) {
    const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));

    let content = '';
    if (fs.existsSync(txtPath)) {
      try {
        content = fs.readFileSync(txtPath, 'utf-8').trim();
      } catch {}
    }

    // Check if tag already exists in the content
    const existingTags = content.split(',').map((t) => t.trim().toLowerCase());
    if (existingTags.includes(cleanTag.toLowerCase())) {
      continue; // Skip if tag already present
    }

    let newContent: string;
    if (position === 'start') {
      newContent = content ? `${cleanTag}, ${content}` : cleanTag;
    } else {
      newContent = content ? `${content}, ${cleanTag}` : cleanTag;
    }

    fs.writeFileSync(txtPath, newContent);
    modified++;
  }

  return modified;
}

/**
 * Remove a tag from all .txt captions in a dataset.
 * @returns Number of .txt files modified
 */
export function removeTagFromAll(datasetId: string, tag: string): number {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return 0;

  const cleanTag = tag.trim().toLowerCase();
  if (!cleanTag) return 0;

  const files = fs.readdirSync(folderPath).filter(isImageFile);
  let modified = 0;

  for (const filename of files) {
    const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));
    if (!fs.existsSync(txtPath)) continue;

    try {
      const content = fs.readFileSync(txtPath, 'utf-8').trim();
      if (!content) continue;

      // Split, filter out the tag (case-insensitive), rejoin
      const tags = content.split(',').map((t) => t.trim());
      const filtered = tags.filter((t) => t.toLowerCase() !== cleanTag);

      if (filtered.length !== tags.length) {
        // Tag was found and removed
        const newContent = filtered.join(', ');
        fs.writeFileSync(txtPath, newContent);
        modified++;
      }
    } catch {}
  }

  return modified;
}

/**
 * Search for .txt files containing a specific tag or text.
 * @returns Array of { filename, caption } matching the search
 */
export function searchCaptions(
  datasetId: string,
  query: string
): { filename: string; caption: string }[] {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return [];

  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery) return [];

  const files = fs.readdirSync(folderPath).filter(isImageFile);
  const results: { filename: string; caption: string }[] = [];

  for (const filename of files) {
    const txtPath = path.join(folderPath, filename.replace(/\.[^.]+$/, '.txt'));
    if (!fs.existsSync(txtPath)) continue;

    try {
      const content = fs.readFileSync(txtPath, 'utf-8').trim();
      if (content.toLowerCase().includes(cleanQuery)) {
        results.push({ filename, caption: content });
      }
    } catch {}
  }

  return results;
}

/**
 * Scan an external folder and import its images into a dataset.
 * Copies images and .txt captions into the dataset folder.
 */
export async function importFromFolder(
  datasetId: string,
  sourceFolder: string
): Promise<{ imported: number; skipped: number }> {
  if (!fs.existsSync(sourceFolder)) {
    throw new Error(`Source folder not found: ${sourceFolder}`);
  }

  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Dataset folder not found: ${datasetId}`);
  }

  const files = fs.readdirSync(sourceFolder);
  const imageFiles = files.filter(isImageFile);

  let imported = 0;
  let skipped = 0;

  for (const filename of imageFiles) {
    const srcPath = path.join(sourceFolder, filename);
    const dstPath = path.join(folderPath, filename);

    // Copy image
    fs.copyFileSync(srcPath, dstPath);

    // Copy .txt caption if it exists
    const txtName = filename.replace(/\.[^.]+$/, '.txt');
    const srcTxt = path.join(sourceFolder, txtName);
    if (fs.existsSync(srcTxt)) {
      fs.copyFileSync(srcTxt, path.join(folderPath, txtName));
    }

    imported++;
  }

  return { imported, skipped };
}

/**
 * Get dataset stats (counts by status).
 */
export function getDatasetStats(datasetId: string): {
  total: number;
  pending: number;
  analyzed: number;
  captioned: number;
  error: number;
} {
  const images = listImages(datasetId);
  const stats = { total: 0, pending: 0, analyzed: 0, captioned: 0, error: 0 };
  stats.total = images.length;
  for (const img of images) {
    switch (img.status) {
      case 'pending':
      case 'analyzing':
        stats.pending++;
        break;
      case 'analyzed':
        stats.analyzed++;
        break;
      case 'captioned':
        stats.captioned++;
        break;
      case 'error':
        stats.error++;
        break;
    }
  }
  return stats;
}

/**
 * Get the folder path for a dataset.
 */
export function getDatasetFolderPath(datasetId: string): string {
  return path.join(DATA_ROOT, datasetId);
}

// ─── Regeneration tracking ───────────────────────────────────────────────────

/**
 * Mark all images in a dataset as pending regeneration.
 * Only sets the flag for images that don't already have it set,
 * so if called again after an interruption, it won't reset already-completed images.
 *
 * Returns the total number of images marked for regeneration (including any
 * that were already pending from a previous interrupted run).
 */
export function markAllForRegeneration(datasetId: string): number {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return 0;

  const metadata = readMetadataFile(folderPath);
  const files = fs.readdirSync(folderPath).filter(isImageFile);

  let count = 0;
  for (const filename of files) {
    if (!metadata[filename]) {
      metadata[filename] = {};
    }
    // Only set to true if not already pending (resume capability)
    if (!metadata[filename].regenerationPending) {
      metadata[filename].regenerationPending = true;
    }
    if (metadata[filename].regenerationPending) {
      count++;
    }
  }

  writeMetadataFile(folderPath, metadata);
  return count;
}

/**
 * Clear the regeneration pending flag for a specific image.
 * Called after a caption has been successfully (or unsuccessfully) regenerated.
 */
export function clearRegenerationPending(
  datasetId: string,
  filename: string
): void {
  updateImageMetadata(datasetId, filename, { regenerationPending: false });
}

/**
 * Get the count of images pending regeneration in a dataset.
 * Useful for showing "Resume Regeneration (X remaining)" in the UI.
 */
export function getRegenerationPendingCount(datasetId: string): number {
  const images = listImages(datasetId);
  return images.filter((img) => img.regenerationPending).length;
}

/**
 * Clear all regeneration pending flags for a dataset.
 * Useful for cancelling a regeneration batch.
 */
export function clearAllRegenerationPending(datasetId: string): void {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return;

  const metadata = readMetadataFile(folderPath);
  for (const filename of Object.keys(metadata)) {
    if (metadata[filename].regenerationPending) {
      metadata[filename].regenerationPending = false;
    }
  }
  writeMetadataFile(folderPath, metadata);
}

// ─── Selection for regeneration ──────────────────────────────────────────────

/**
 * Toggle the selectedForRegen flag for a specific image.
 */
export function toggleSelectedForRegen(
  datasetId: string,
  filename: string,
  selected: boolean
): void {
  updateImageMetadata(datasetId, filename, { selectedForRegen: selected });
}

/**
 * Get all images selected for regeneration in a dataset.
 */
export function getSelectedForRegen(datasetId: string): ImageFile[] {
  const images = listImages(datasetId);
  return images.filter((img) => img.selectedForRegen);
}

/**
 * Clear the selectedForRegen flag for all images in a dataset.
 * Called after regeneration completes.
 */
export function clearAllSelectedForRegen(datasetId: string): void {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return;

  const metadata = readMetadataFile(folderPath);
  for (const filename of Object.keys(metadata)) {
    if (metadata[filename].selectedForRegen) {
      metadata[filename].selectedForRegen = false;
    }
  }
  writeMetadataFile(folderPath, metadata);
}

/**
 * Select all images for regeneration.
 */
export function selectAllForRegen(datasetId: string): void {
  const folderPath = path.join(DATA_ROOT, datasetId);
  if (!fs.existsSync(folderPath)) return;

  const metadata = readMetadataFile(folderPath);
  const files = fs.readdirSync(folderPath).filter(isImageFile);
  for (const filename of files) {
    if (!metadata[filename]) metadata[filename] = {};
    metadata[filename].selectedForRegen = true;
  }
  writeMetadataFile(folderPath, metadata);
}
