import { NextRequest } from 'next/server';
import { getZAI } from '@/lib/zai';
import {
  cropHead,
  extractDominantColor,
  extractColorPalette,
  getImageMetadata,
} from '@/lib/image-utils';
import {
  getDataset,
  listImages,
  updateImageMetadata,
  encodeImageId,
} from '@/lib/file-storage';
import { existsSync } from 'fs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/datasets/[id]/analyze - Start VLM analysis batch job, return SSE stream
 *
 * For each pending image:
 *   - Extract dominant color
 *   - Run VLM analysis via ZAI SDK (with retry/backoff logic)
 *   - Save results to metadata.json via updateImageMetadata()
 *
 * Emits SSE events: progress, result, error, done
 */
export async function POST(
  _request: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;

  const dataset = getDataset(id);
  if (!dataset) {
    return new Response(JSON.stringify({ error: 'Dataset not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pendingImages = listImages(id).filter(
    (img) => img.status === 'pending'
  );

  if (pendingImages.length === 0) {
    return new Response(
      JSON.stringify({ error: 'No pending images to analyze' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      let processed = 0;
      const total = pendingImages.length;

      sendEvent('progress', { processed: 0, total });

      for (const image of pendingImages) {
        const imageId = encodeImageId(id, image.filename);
        try {
          // Check if file exists
          if (!existsSync(image.originalPath)) {
            updateImageMetadata(id, image.filename, {
              status: 'error',
              errorMessage: 'File not found on disk',
            });
            processed++;
            sendEvent('error', {
              imageId,
              filename: image.filename,
              error: 'File not found on disk',
            });
            sendEvent('progress', { processed, total });
            continue;
          }

          // Get image metadata if not already set
          if (image.width === 0 || image.height === 0) {
            try {
              const metadata = await getImageMetadata(image.originalPath);
              updateImageMetadata(id, image.filename, {
                width: metadata.width,
                height: metadata.height,
                fileSize: metadata.fileSize,
              });
            } catch {
              // Non-fatal, continue with analysis
            }
          }

          // Extract dominant color + full palette
          let colorInfo = '';
          try {
            const color = await extractDominantColor(image.originalPath);
            let palette: string[] = [];
            try {
              palette = await extractColorPalette(image.originalPath, 6);
            } catch {
              // palette is optional — dominant color alone is still useful
            }
            colorInfo = JSON.stringify({ ...color, palette });
            updateImageMetadata(id, image.filename, { colorInfo });
          } catch (err) {
            console.error(
              `Color extraction failed for ${image.filename}:`,
              err
            );
          }

          // Crop head area and call VLM
          let vlmAnalysis = '';
          let success = false;
          let cropRatio = 0.20;

          while (!success && cropRatio > 0.05) {
            try {
              const headCrop = await cropHead(image.originalPath, cropRatio);
              const base64Image = headCrop.toString('base64');
              const dataUrl = `data:image/jpeg;base64,${base64Image}`;

              const zai = await getZAI();
              const vlmResponse = await zai.chat.completions.createVision({
                model: 'gpt-4o',
                messages: [
                  {
                    role: 'system',
                    content:
                      'You are an expert image analyst for LoRA training datasets. Describe the subject in detail including: appearance, features, clothing, pose, expression, and any distinctive characteristics. Be thorough and specific.',
                  },
                  {
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: 'Describe this image in detail for a LoRA training dataset. Focus on the subject\'s visual characteristics.',
                      },
                      {
                        type: 'image_url',
                        image_url: { url: dataUrl },
                      },
                    ],
                  },
                ],
              });

              if (vlmResponse?.choices?.[0]?.message?.content) {
                vlmAnalysis = vlmResponse.choices[0].message.content;
                success = true;
              } else if (
                vlmResponse?.content_filter?.some(
                  (f: { level: number }) => f.level === 1301
                )
              ) {
                // Content filter triggered - retry with smaller crop
                if (cropRatio > 0.08) {
                  cropRatio = 0.08;
                  continue;
                } else {
                  throw new Error(
                    'Content filter triggered even with minimal crop'
                  );
                }
              } else {
                throw new Error('Empty VLM response');
              }
            } catch (err: unknown) {
              const errorObj = err as { status?: number; message?: string };
              // Rate limit - wait and retry
              if (errorObj.status === 429) {
                sendEvent('progress', {
                  processed,
                  total,
                  message: `Rate limited, waiting 25s...`,
                });
                await new Promise((resolve) => setTimeout(resolve, 25000));
                continue; // Retry same image with same crop
              }

              // Content filter with error code
              if (
                errorObj.message?.includes('1301') ||
                errorObj.message?.includes('content_filter')
              ) {
                if (cropRatio > 0.08) {
                  cropRatio = 0.08;
                  continue;
                }
              }

              throw err;
            }
          }

          if (success) {
            updateImageMetadata(id, image.filename, {
              vlmAnalysis,
              colorInfo,
              status: 'analyzed',
              errorMessage: '',
            });

            processed++;
            sendEvent('result', {
              imageId,
              filename: image.filename,
              vlmAnalysis,
              colorInfo,
            });
          } else {
            updateImageMetadata(id, image.filename, {
              status: 'error',
              errorMessage: 'VLM analysis failed after retries',
            });
            processed++;
            sendEvent('error', {
              imageId,
              filename: image.filename,
              error: 'VLM analysis failed after retries',
            });
          }
        } catch (err) {
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown error';
          console.error(`Analysis failed for ${image.filename}:`, err);

          try {
            updateImageMetadata(id, image.filename, {
              status: 'error',
              errorMessage,
            });
          } catch {
            // Metadata update failure, continue
          }

          processed++;
          sendEvent('error', {
            imageId,
            filename: image.filename,
            error: errorMessage,
          });
        }

        sendEvent('progress', { processed, total });
      }

      sendEvent('done', { processed, total });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
