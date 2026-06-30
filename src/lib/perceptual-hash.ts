import sharp from 'sharp';

/**
 * Compute a perceptual hash (pHash) of an image as a hex string.
 *
 * Algorithm (standard pHash):
 *   1. Downscale to 32×32 grayscale.
 *   2. Compute the DCT (Discrete Cosine Transform) of the 32×32 grid.
 *   3. Take the top-left 8×8 low-frequency coefficients.
 *   4. Compute the median (excluding the DC term).
 *   5. Each bit = 1 if coefficient > median, else 0.
 *
 * The resulting 64-bit hash is resilient to scaling, compression, minor
 * color/exposure changes — so visually similar images get similar hashes.
 *
 * Returns the hash as a 16-char hex string.
 */
export async function computePHash(imgPath: string): Promise<string> {
  // Downscale to 32×32 grayscale and get raw pixels.
  const { data } = await sharp(imgPath)
    .resize(32, 32, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // data is 1024 bytes (32×32), one channel.
  const pixels = Array.from(data);

  // Compute 2D DCT-II on the 32×32 grid.
  const dct = dct2d(pixels, 32);

  // Take the top-left 8×8 block (low frequencies).
  const block: number[] = [];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      block.push(dct[y * 32 + x]);
    }
  }

  // Exclude the DC term (block[0]) when computing the median, because it's
  // always much larger than the other coefficients.
  const acTerms = block.slice(1);
  const median = computeMedian(acTerms);

  // Build the 64-bit hash: 1 if value > median, else 0.
  let bits = '';
  for (let i = 0; i < 64; i++) {
    bits += (i === 0 ? block[0] > 0 : block[i] > median) ? '1' : '0';
  }

  // Convert to hex (16 chars for 64 bits).
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Hamming distance between two hex hashes (number of differing bits).
 * 0 = identical images; up to ~5 = very similar; >10 = likely different.
 */
export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hashA.length; i++) {
    const a = parseInt(hashA[i], 16);
    const b = parseInt(hashB[i], 16);
    // XOR the two nibbles and count set bits.
    let xor = a ^ b;
    while (xor) {
      dist += xor & 1;
      xor >>= 1;
    }
  }
  return dist;
}

// --- internals ---

function computeMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 2D Discrete Cosine Transform (Type II) on an N×N grid of values.
 * Returns an N×N array of coefficients.
 */
function dct2d(values: number[], n: number): number[] {
  // Separate the 2D DCT into two 1D DCTs (rows then columns) for efficiency.
  // 1D DCT-II:
  const dct1d = (row: number[]): number[] => {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      let sum = 0;
      for (let x = 0; x < n; x++) {
        sum += row[x] * Math.cos((Math.PI / n) * (x + 0.5) * k);
      }
      out.push(sum);
    }
    return out;
  };

  // Transform rows.
  const temp: number[][] = [];
  for (let y = 0; y < n; y++) {
    const row = values.slice(y * n, (y + 1) * n);
    temp.push(dct1d(row));
  }

  // Transform columns (transpose, dct1d each row, transpose back).
  const result: number[] = new Array(n * n).fill(0);
  for (let x = 0; x < n; x++) {
    const col: number[] = [];
    for (let y = 0; y < n; y++) col.push(temp[y][x]);
    const dctCol = dct1d(col);
    for (let y = 0; y < n; y++) {
      result[y * n + x] = dctCol[y];
    }
  }
  return result;
}
