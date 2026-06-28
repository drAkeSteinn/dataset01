import sharp from 'sharp';
import fs from 'fs';

/**
 * Crop the top portion of an image (head area) and return as JPEG Buffer.
 * @param imgPath - Path to the image file
 * @param ratio - Fraction of image height to crop from top (default 0.20 = top 20%)
 */
export async function cropHead(
  imgPath: string,
  ratio: number = 0.20
): Promise<Buffer> {
  const image = sharp(imgPath);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error(`Cannot read image dimensions: ${imgPath}`);
  }

  const cropHeight = Math.round(metadata.height * ratio);
  const cropWidth = metadata.width;

  return image
    .extract({ left: 0, top: 0, width: cropWidth, height: cropHeight })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/**
 * Extract the dominant color info from an image.
 * Returns average RGB and a named dominant color.
 */
export async function extractDominantColor(
  imgPath: string
): Promise<{ avgR: number; avgG: number; avgB: number; dominant: string }> {
  const image = sharp(imgPath);
  const { data, info } = await image
    .resize(1, 1, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // data is a single pixel in raw format
  let avgR: number, avgG: number, avgB: number;

  if (info.channels === 4) {
    avgR = data[0];
    avgG = data[1];
    avgB = data[2];
    // data[3] is alpha
  } else if (info.channels === 3) {
    avgR = data[0];
    avgG = data[1];
    avgB = data[2];
  } else {
    // Grayscale
    avgR = avgG = avgB = data[0];
  }

  const dominant = describeColor(avgR, avgG, avgB);

  return { avgR, avgG, avgB, dominant };
}

/**
 * Get basic metadata for an image file.
 */
export async function getImageMetadata(
  imgPath: string
): Promise<{ width: number; height: number; fileSize: number }> {
  const image = sharp(imgPath);
  const metadata = await image.metadata();
  const stat = fs.statSync(imgPath);

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    fileSize: stat.size,
  };
}

/**
 * Describe an RGB color as a named color string.
 */
export function describeColor(r: number, g: number, b: number): string {
  // Convert to HSL for better color naming
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) / 6;
    } else {
      h = ((rn - gn) / d + 4) / 6;
    }
  }

  const hDeg = h * 360;

  // Achromatic
  if (s < 0.1) {
    if (l < 0.15) return 'black';
    if (l < 0.35) return 'dark gray';
    if (l < 0.65) return 'gray';
    if (l < 0.85) return 'light gray';
    return 'white';
  }

  // Chromatic
  let colorName = '';
  if (hDeg < 15 || hDeg >= 345) colorName = 'red';
  else if (hDeg < 45) colorName = 'orange';
  else if (hDeg < 70) colorName = 'yellow';
  else if (hDeg < 150) colorName = 'green';
  else if (hDeg < 195) colorName = 'cyan';
  else if (hDeg < 260) colorName = 'blue';
  else if (hDeg < 290) colorName = 'purple';
  else if (hDeg < 345) colorName = 'pink';

  // Lightness modifier
  if (l < 0.25) return `dark ${colorName}`;
  if (l > 0.75) return `light ${colorName}`;
  return colorName;
}
