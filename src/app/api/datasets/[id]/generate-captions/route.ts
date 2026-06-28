import { NextRequest } from 'next/server';
import { getProvider } from '@/lib/providers';
import { existsSync } from 'fs';
import {
  getDataset,
  listImages,
  saveCaption,
  updateImageMetadata,
  encodeImageId,
  markAllForRegeneration,
  clearRegenerationPending,
  clearAllSelectedForRegen,
} from '@/lib/file-storage';

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * POST /api/datasets/[id]/generate-captions - Generate captions via LLM provider, return SSE stream
 *
 * Body (optional JSON):
 *   regenerate: boolean - If true, regenerate captions for all images.
 *                         Uses regenerationPending flag for resume capability:
 *                         - First call: marks all images as pending, processes them
 *                         - If interrupted: next call resumes from where it left off
 *                         - Already-completed images are NOT re-processed
 *
 *   If regenerate is false/absent: only process images with status 'analyzed'
 *   (i.e., images that have VLM analysis but no caption yet).
 */
export async function POST(
  request: NextRequest,
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

  // Parse optional body for regenerate flag and selectedOnly flag
  let regenerate = false;
  let selectedOnly = false;
  try {
    const body = await request.json();
    regenerate = !!body.regenerate;
    selectedOnly = !!body.selectedOnly;
  } catch {
    // No body or invalid JSON, defaults
  }

  // Determine which images to process
  const allImages = listImages(id);
  let imagesToProcess;

  if (selectedOnly && regenerate) {
    // Regenerate only selected images
    imagesToProcess = allImages.filter((img) => img.selectedForRegen);

    if (imagesToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No images selected. Select images with the checkbox or use Regenerate All without selection.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Mark only these images for regeneration (for resume capability)
    for (const img of imagesToProcess) {
      updateImageMetadata(id, img.filename, { regenerationPending: true });
    }
  } else if (regenerate) {
    // Mark all images for regeneration (only sets flag for images not already pending)
    // This enables resume: if interrupted, next call picks up where it left off
    const pendingCount = markAllForRegeneration(id);

    // Get fresh list with updated flags
    const updatedImages = listImages(id);
    imagesToProcess = updatedImages.filter((img) => img.regenerationPending);

    if (imagesToProcess.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No images to regenerate. All captions are already up to date.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } else {
    // Normal mode: only process images that have been analyzed but not yet captioned
    imagesToProcess = allImages.filter((img) => img.status === 'analyzed');
  }

  if (imagesToProcess.length === 0) {
    return new Response(
      JSON.stringify({
        error: regenerate
          ? 'No images with analysis to regenerate captions for'
          : 'No analyzed images to generate captions for. Run VLM analysis first, or use regenerate=true.',
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Get the provider
  const providerId = dataset.llmProvider || 'zai';
  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return new Response(
      JSON.stringify({
        error: `Invalid LLM provider: ${providerId}. Please check dataset settings.`,
      }),
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
      let errors = 0;
      const total = imagesToProcess.length;

      sendEvent('progress', {
        processed: 0,
        total,
        provider: provider.name,
        model: dataset.llmModel || 'default',
        regenerate,
      });

      for (const image of imagesToProcess) {
        const imageId = encodeImageId(id, image.filename);

        try {
          // Check if file still exists
          if (!existsSync(image.originalPath)) {
            updateImageMetadata(id, image.filename, {
              status: 'error',
              errorMessage: 'File not found on disk',
              regenerationPending: false,
            });
            processed++;
            errors++;
            sendEvent('error', {
              imageId,
              filename: image.filename,
              error: 'File not found on disk',
            });
            sendEvent('progress', { processed, total, errors });
            continue;
          }

          // Generate caption using the selected provider
          // This sends: dataset description, image description, VLM analysis,
          // color info, trigger word, caption style, AND the image itself (for vision providers)
          const caption = await provider.generateCaption({
            imagePath: image.originalPath,
            vlmAnalysis: image.vlmAnalysis,
            colorInfo: image.colorInfo,
            imageDescription: image.imageDescription,
            triggerWord: dataset.triggerWord,
            captionStyle: dataset.captionStyle,
            captionTemplate: dataset.captionTemplate,
            description: dataset.description,
            model: dataset.llmModel,
            endpoint: dataset.llmEndpoint,
          });

          if (!caption) {
            throw new Error('Provider returned an empty caption');
          }

          // Write caption file to disk (creates or overwrites the .txt file)
          saveCaption(id, image.filename, caption);

          // Update metadata: mark as captioned, clear regeneration flag
          updateImageMetadata(id, image.filename, {
            status: 'captioned',
            errorMessage: '',
            regenerationPending: false,
          });

          processed++;
          sendEvent('result', {
            imageId,
            filename: image.filename,
            caption,
          });
        } catch (err: unknown) {
          const errorObj = err as { status?: number };
          const errorMessage =
            err instanceof Error ? err.message : 'Unknown error';

          // Rate limit handling - retry once
          if (errorObj.status === 429) {
            sendEvent('progress', {
              processed,
              total,
              errors,
              message: `Rate limited, waiting 25s...`,
            });
            await new Promise((resolve) => setTimeout(resolve, 25000));

            // Retry the same image
            try {
              const caption = await provider.generateCaption({
                imagePath: image.originalPath,
                vlmAnalysis: image.vlmAnalysis,
                colorInfo: image.colorInfo,
                imageDescription: image.imageDescription,
                triggerWord: dataset.triggerWord,
                captionStyle: dataset.captionStyle,
                captionTemplate: dataset.captionTemplate,
                description: dataset.description,
                model: dataset.llmModel,
                endpoint: dataset.llmEndpoint,
              });

              if (!caption) {
                throw new Error('Provider returned an empty caption on retry');
              }

              // Write caption file to disk
              saveCaption(id, image.filename, caption);
              updateImageMetadata(id, image.filename, {
                status: 'captioned',
                errorMessage: '',
                regenerationPending: false,
              });

              processed++;
              sendEvent('result', {
                imageId,
                filename: image.filename,
                caption,
              });
            } catch (retryErr) {
              const retryError =
                retryErr instanceof Error
                  ? retryErr.message
                  : 'Retry failed';
              // Clear the regeneration flag so it doesn't get stuck
              updateImageMetadata(id, image.filename, {
                status: 'error',
                errorMessage: `Caption generation failed: ${retryError}`,
                regenerationPending: false,
              });
              processed++;
              errors++;
              sendEvent('error', {
                imageId,
                filename: image.filename,
                error: retryError,
              });
            }
          } else {
            console.error(
              `Caption generation failed for ${image.filename}:`,
              err
            );
            // Clear the regeneration flag so it doesn't get stuck
            updateImageMetadata(id, image.filename, {
              status: 'error',
              errorMessage: `Caption generation failed: ${errorMessage}`,
              regenerationPending: false,
            });
            processed++;
            errors++;
            sendEvent('error', {
              imageId,
              filename: image.filename,
              error: errorMessage,
            });
          }
        }

        sendEvent('progress', { processed, total, errors });
      }

      // After regeneration completes, clear the selectedForRegen flags
      // for the images that were processed
      if (selectedOnly) {
        clearAllSelectedForRegen(id);
      }

      sendEvent('done', { processed, total, errors });
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
