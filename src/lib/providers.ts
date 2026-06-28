import { getZAI } from '@/lib/zai';
import { cropHead } from '@/lib/image-utils';
import {
  buildSystemPrompt,
  buildUserPrompt,
  applyTemplate,
  type CaptionSettings,
} from '@/lib/caption-templates';
import fs from 'fs';
import sharp from 'sharp';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CaptionParams {
  imagePath: string;
  vlmAnalysis: string;
  colorInfo: string;
  imageDescription: string;
  triggerWord: string;
  captionStyle: string;
  captionTemplate: string;
  description: string;
  model: string;
  endpoint: string;
}

export interface LLMProvider {
  name: string;
  id: string;
  needsEndpoint: boolean;
  needsModel: boolean;
  supportsVision: boolean;
  defaultEndpoint: string;
  generateCaption(params: CaptionParams): Promise<string>;
}

// ─── Logging ─────────────────────────────────────────────────────────────────

const LOG_FILE = process.env.LOG_FILE || '/home/z/my-project/llm.log';

function log(message: string, data?: unknown): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  if (data !== undefined) {
    const dataStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    console.log(dataStr);
    try {
      fs.appendFileSync(LOG_FILE, `${line}\n${dataStr}\n\n`);
    } catch {}
  } else {
    try {
      fs.appendFileSync(LOG_FILE, `${line}\n\n`);
    } catch {}
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a prompt string for non-ZAI providers based on caption style and params.
 * This is a GENERIC prompt — no hardcoded content themes.
 * The prompt describes an expert art observer analyzing images for LoRA training.
 */
function buildPrompt(params: CaptionParams): string {
  const { triggerWord, captionStyle, captionTemplate, description, imageDescription, vlmAnalysis, colorInfo } = params;

  let styleInstruction = '';
  if (captionStyle === 'natural') {
    styleInstruction = 'Write a natural language description, 40-100 words. Use complete, flowing sentences that describe what you observe in the image.';
  } else if (captionStyle === 'tags') {
    styleInstruction = 'Write comma-separated tags. List visual elements in order of importance (subject first, then details). Use short descriptive phrases (2-3 words each).';
  } else {
    styleInstruction = captionTemplate || 'Write a descriptive caption for this image.';
  }

  let prompt = `You are an expert visual analyst observing an image for LoRA training dataset captioning.

Your task: Carefully observe the image and write an accurate, detailed caption describing what you see.

CAPTION STYLE: ${styleInstruction}
${triggerWord ? `TRIGGER WORD: Start your caption with "${triggerWord},"` : ''}

${description ? `DATASET CONTEXT:\n${description}\n\nThis context describes what the dataset is about. Use it to understand the theme and focus of your captions.\n` : ''}${imageDescription ? `IMAGE-SPECIFIC NOTES:\n${imageDescription}\n\nThese are user-provided notes for this specific image. Prioritize this information in your caption.\n` : ''}${vlmAnalysis ? `VISUAL ANALYSIS (from VLM):\n${vlmAnalysis}\n` : ''}${colorInfo ? `COLOR INFO:\n${colorInfo}\n` : ''}
IMPORTANT INSTRUCTIONS:
- Observe the image carefully and describe what you actually see
- Be accurate and specific — do not invent details not present in the image
- Focus on visual elements: subject, appearance, pose, expression, clothing, setting, lighting, style
- Do NOT add commentary, explanations, or meta-text
- Output ONLY the caption text, nothing else

Write the caption now:`;

  return prompt;
}

/**
 * Read an image file and return it as a base64 string.
 */
async function imageToBase64(imagePath: string): Promise<string> {
  const buffer = await sharp(imagePath)
    .jpeg({ quality: 85 })
    .toBuffer();
  return buffer.toString('base64');
}

/**
 * Detect if an Ollama model name suggests vision capabilities.
 */
function isOllamaVisionModel(modelName: string): boolean {
  const visionPatterns = [
    'llava', 'bakllava', 'minicpm-v', 'llava-llama3', 'moondream',
    'ovis', 'qwen2-vl', 'cogvlm', 'internvl', 'idefics', 'paligemma',
    'fuyu', 'kosmos', 'cogagent', 'xgen-mm', 'yi-vl', 'deepseek-vl',
    'bunny', 'obsidian', 'immich',
  ];
  const lower = modelName.toLowerCase();
  return visionPatterns.some((p) => lower.includes(p));
}

/**
 * Extract caption text from an LLM response.
 * Handles models that use reasoning_content (like Qwen3.5, DeepSeek-R1, etc.)
 * where the actual output might be in reasoning_content instead of content.
 */
function extractCaptionFromResponse(
  content: string | undefined,
  reasoningContent: string | undefined,
  providerName: string,
  model: string
): string {
  log(`[${providerName}] Extracting caption from response`, {
    model,
    contentLength: content?.length || 0,
    reasoningContentLength: reasoningContent?.length || 0,
    contentPreview: content?.substring(0, 200) || '(empty)',
    reasoningPreview: reasoningContent?.substring(0, 200) || '(empty)',
  });

  // If content is non-empty, use it
  if (content && content.trim().length > 0) {
    log(`[${providerName}] Using content field (${content.length} chars)`);
    return content.trim();
  }

  // Content is empty — try reasoning_content as fallback
  // Some models (Qwen3, DeepSeek-R1) put the actual response in reasoning_content
  // when they run out of tokens during reasoning
  if (reasoningContent && reasoningContent.trim().length > 0) {
    log(`[${providerName}] Content empty, extracting from reasoning_content (${reasoningContent.length} chars)`);

    // Try to find the actual caption in the reasoning content
    // Reasoning models often write their draft caption after phrases like:
    // "caption:", "Draft:", "Final:", or just the trigger word
    const reasoning = reasoningContent.trim();

    // Look for lines that start with the trigger word or common caption starters
    const lines = reasoning.split('\n');
    const captionCandidates: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and reasoning markers
      if (!trimmed || trimmed.startsWith('**') || trimmed.startsWith('*')) continue;
      // Look for lines that look like captions (start with common words or trigger patterns)
      if (trimmed.match(/^(n1pl3fk|[a-zA-Z]+,)/) || trimmed.match(/^(caption|final|draft|answer)[:\s]/i)) {
        // Clean up the line
        const cleaned = trimmed.replace(/^(caption|final|draft|answer)[:\s]*/i, '');
        if (cleaned.length > 10) {
          captionCandidates.push(cleaned);
        }
      }
    }

    if (captionCandidates.length > 0) {
      // Use the last candidate (usually the final draft)
      const caption = captionCandidates[captionCandidates.length - 1];
      log(`[${providerName}] Extracted caption from reasoning: ${caption.substring(0, 100)}...`);
      return caption;
    }

    // If no clear caption found, try to extract the last meaningful paragraph
    const paragraphs = reasoning.split(/\n\n+/);
    const lastPara = paragraphs[paragraphs.length - 1]?.trim();
    if (lastPara && lastPara.length > 20 && !lastPara.startsWith('**')) {
      log(`[${providerName}] Using last paragraph from reasoning: ${lastPara.substring(0, 100)}...`);
      return lastPara;
    }

    // Last resort: return the reasoning content itself (truncated)
    log(`[${providerName}] No clear caption found, using raw reasoning (truncated)`);
    return reasoning.substring(0, 500);
  }

  log(`[${providerName}] WARNING: Both content and reasoning_content are empty!`);
  return '';
}

/**
 * Post-process a generated caption: prepend trigger word if needed, apply template for custom style.
 */
function postProcessCaption(
  rawCaption: string,
  params: CaptionParams
): string {
  let caption = rawCaption.trim();

  // Remove any leading/trailing quotes
  caption = caption.replace(/^["'`]+|["'`]+$/g, '');

  // Remove "Caption:" prefix if present
  caption = caption.replace(/^(caption|final caption|answer)[:\s]*/i, '');

  const settings: CaptionSettings = {
    triggerWord: params.triggerWord,
    captionStyle: params.captionStyle as 'natural' | 'tags' | 'custom',
    captionTemplate: params.captionTemplate,
  };

  // For custom style, apply template if the LLM didn't already use it
  if (settings.captionStyle === 'custom' && settings.captionTemplate) {
    if (
      caption.includes('{trigger}') ||
      caption.includes('{description}') ||
      caption.includes('{colors}') ||
      caption.includes('{style}')
    ) {
      let colorsStr = '';
      try {
        const colorData = JSON.parse(params.colorInfo);
        colorsStr = colorData.dominant || '';
      } catch {
        colorsStr = params.colorInfo;
      }

      caption = applyTemplate(caption, {
        trigger: settings.triggerWord,
        description: params.vlmAnalysis,
        colors: colorsStr,
        style: '',
      });
    }
  }

  // Prepend trigger word if style is natural or tags and trigger word exists
  if (
    settings.triggerWord &&
    settings.captionStyle !== 'custom' &&
    !caption.toLowerCase().startsWith(settings.triggerWord.toLowerCase())
  ) {
    caption = `${settings.triggerWord}, ${caption}`;
  }

  return caption;
}

// ─── ZAI Provider ────────────────────────────────────────────────────────────

const zaiProvider: LLMProvider = {
  name: 'ZAI SDK',
  id: 'zai',
  needsEndpoint: false,
  needsModel: false,
  supportsVision: true,
  defaultEndpoint: '',

  async generateCaption(params: CaptionParams): Promise<string> {
    const {
      imagePath,
      vlmAnalysis: existingAnalysis,
      colorInfo,
      triggerWord,
      captionStyle,
      captionTemplate,
      description,
      imageDescription,
    } = params;

    log('[ZAI] Starting caption generation', {
      imagePath,
      hasVlmAnalysis: !!existingAnalysis,
      hasColorInfo: !!colorInfo,
      hasImageDescription: !!imageDescription,
      hasDescription: !!description,
      triggerWord,
      captionStyle,
    });

    let vlmAnalysis = existingAnalysis;

    // Step 1: If no VLM analysis exists, run VLM analysis first
    if (!vlmAnalysis) {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      let success = false;
      let cropRatio = 0.20;

      while (!success && cropRatio > 0.05) {
        try {
          const headCrop = await cropHead(imagePath, cropRatio);
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
            log('[ZAI] VLM analysis completed', { length: vlmAnalysis.length });
          } else if (
            vlmResponse?.content_filter?.some(
              (f: { level: number }) => f.level === 1301
            )
          ) {
            if (cropRatio > 0.08) {
              cropRatio = 0.08;
              continue;
            } else {
              throw new Error('Content filter triggered even with minimal crop');
            }
          } else {
            throw new Error('Empty VLM response');
          }
        } catch (err: unknown) {
          const errorObj = err as { status?: number; message?: string };
          if (errorObj.status === 429) {
            await new Promise((resolve) => setTimeout(resolve, 25000));
            continue;
          }
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

      if (!success) {
        throw new Error('VLM analysis failed after retries');
      }
    }

    // Step 2: Use LLM to generate caption from analysis
    const settings: CaptionSettings = {
      triggerWord,
      captionStyle: captionStyle as 'natural' | 'tags' | 'custom',
      captionTemplate,
      description,
    };

    const systemPrompt = buildSystemPrompt(settings);
    const userPrompt = buildUserPrompt(vlmAnalysis, colorInfo, imageDescription);

    log('[ZAI] Sending caption generation request', {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
      hasDescription: !!description,
      hasImageDescription: !!imageDescription,
    });

    const zai = await getZAI();
    const response = await zai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawCaption = response?.choices?.[0]?.message?.content?.trim() || '';
    log('[ZAI] Caption generated', { rawLength: rawCaption.length, preview: rawCaption.substring(0, 100) });

    return postProcessCaption(rawCaption, params);
  },
};

// ─── Ollama Provider ─────────────────────────────────────────────────────────

const ollamaProvider: LLMProvider = {
  name: 'Ollama',
  id: 'ollama',
  needsEndpoint: true,
  needsModel: true,
  supportsVision: true,
  defaultEndpoint: 'http://localhost:11434',

  async generateCaption(params: CaptionParams): Promise<string> {
    const { imagePath, model, endpoint } = params;
    const baseUrl = endpoint || ollamaProvider.defaultEndpoint;

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const base64Image = await imageToBase64(imagePath);
    const prompt = buildPrompt(params);
    const isVision = isOllamaVisionModel(model);

    log('[Ollama] Starting caption generation', {
      model, endpoint: baseUrl, isVision,
      hasDescription: !!params.description,
      hasImageDescription: !!params.imageDescription,
      promptLength: prompt.length,
    });

    let rawCaption = '';

    if (isVision) {
      const body = {
        model,
        prompt,
        images: [base64Image],
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 500,
        },
      };

      log('[Ollama] Sending vision request', { model, promptPreview: prompt.substring(0, 200) });

      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as { response?: string };
      rawCaption = data.response || '';
      log('[Ollama] Response received', { rawLength: rawCaption.length, preview: rawCaption.substring(0, 100) });
    } else {
      const body = {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert visual analyst creating captions for LoRA training datasets. Observe carefully and describe accurately.',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 500,
        },
      };

      log('[Ollama] Sending text request', { model, promptPreview: prompt.substring(0, 200) });

      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Ollama API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        message?: { content?: string };
      };
      rawCaption = data.message?.content || '';
      log('[Ollama] Response received', { rawLength: rawCaption.length, preview: rawCaption.substring(0, 100) });
    }

    return postProcessCaption(rawCaption, params);
  },
};

// ─── LM Studio Provider ──────────────────────────────────────────────────────

const lmstudioProvider: LLMProvider = {
  name: 'LM Studio',
  id: 'lmstudio',
  needsEndpoint: true,
  needsModel: true,
  supportsVision: true,
  defaultEndpoint: 'http://localhost:1234',

  async generateCaption(params: CaptionParams): Promise<string> {
    const { imagePath, model, endpoint } = params;
    const baseUrl = endpoint || lmstudioProvider.defaultEndpoint;

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const base64Image = await imageToBase64(imagePath);
    const prompt = buildPrompt(params);

    log('[LM Studio] Starting caption generation', {
      model,
      endpoint: baseUrl,
      imagePath,
      hasDescription: !!params.description,
      descriptionPreview: params.description?.substring(0, 100),
      hasImageDescription: !!params.imageDescription,
      imageDescriptionPreview: params.imageDescription?.substring(0, 100),
      hasVlmAnalysis: !!params.vlmAnalysis,
      hasColorInfo: !!params.colorInfo,
      triggerWord: params.triggerWord,
      captionStyle: params.captionStyle,
      promptLength: prompt.length,
    });

    // Build OpenAI-compatible messages with vision support
    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${base64Image}` },
      },
    ];

    // Build the request body
    // - max_tokens: 2000 (high to accommodate reasoning models)
    // - chat_template_kwargs: disable thinking for Qwen models that support it
    const body: Record<string, unknown> = {
      model: model || 'default',
      messages: [
        {
          role: 'system',
          content: 'You are an expert visual analyst creating captions for LoRA training datasets. Observe the image carefully and describe what you see accurately. Output ONLY the caption text.',
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2000,
      temperature: 0.7,
      // Disable thinking/reasoning mode for models that support it (Qwen3, etc.)
      // This prevents the model from wasting tokens on internal reasoning
      chat_template_kwargs: { enable_thinking: false },
    };

    log('[LM Studio] Sending request', {
      url: `${baseUrl}/v1/chat/completions`,
      model: body.model,
      max_tokens: body.max_tokens,
      promptPreview: prompt.substring(0, 300),
    });

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      log('[LM Studio] API error', { status: response.status, errorText });
      throw new Error(`LM Studio API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
        finish_reason?: string;
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        completion_tokens_details?: { reasoning_tokens?: number };
      };
    };

    log('[LM Studio] Response received', {
      finishReason: data.choices?.[0]?.finish_reason,
      usage: data.usage,
      contentLength: data.choices?.[0]?.message?.content?.length || 0,
      reasoningContentLength: data.choices?.[0]?.message?.reasoning_content?.length || 0,
    });

    // Extract caption — handle reasoning models that put output in reasoning_content
    const content = data.choices?.[0]?.message?.content;
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content;

    const rawCaption = extractCaptionFromResponse(content, reasoningContent, 'LM Studio', model || 'default');

    log('[LM Studio] Final caption', {
      rawLength: rawCaption.length,
      preview: rawCaption.substring(0, 200),
    });

    return postProcessCaption(rawCaption, params);
  },
};

// ─── TextGen WebUI Provider ──────────────────────────────────────────────────

const textgenProvider: LLMProvider = {
  name: 'Text Generation WebUI',
  id: 'textgen',
  needsEndpoint: true,
  needsModel: true,
  supportsVision: true,
  defaultEndpoint: 'http://localhost:5000',

  async generateCaption(params: CaptionParams): Promise<string> {
    const { imagePath, model, endpoint } = params;
    const baseUrl = endpoint || textgenProvider.defaultEndpoint;

    if (!fs.existsSync(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const base64Image = await imageToBase64(imagePath);
    const prompt = buildPrompt(params);

    log('[TextGen] Starting caption generation', {
      model, endpoint: baseUrl,
      hasDescription: !!params.description,
      hasImageDescription: !!params.imageDescription,
      promptLength: prompt.length,
    });

    const userContent: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${base64Image}` },
      },
    ];

    const body: Record<string, unknown> = {
      model: model || 'default',
      messages: [
        {
          role: 'system',
          content: 'You are an expert visual analyst creating captions for LoRA training datasets. Observe the image carefully and describe what you see accurately. Output ONLY the caption text.',
        },
        { role: 'user', content: userContent },
      ],
      max_tokens: 2000,
      temperature: 0.7,
    };

    log('[TextGen] Sending request', { url: `${baseUrl}/api/v1/chat/completions`, promptPreview: prompt.substring(0, 200) });

    const response = await fetch(`${baseUrl}/api/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      log('[TextGen] API error', { status: response.status, errorText });
      throw new Error(`TextGen WebUI API error (${response.status}): ${errorText}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          reasoning_content?: string;
        };
        finish_reason?: string;
      }>;
    };

    const content = data.choices?.[0]?.message?.content;
    const reasoningContent = data.choices?.[0]?.message?.reasoning_content;

    const rawCaption = extractCaptionFromResponse(content, reasoningContent, 'TextGen', model || 'default');

    log('[TextGen] Final caption', { rawLength: rawCaption.length, preview: rawCaption.substring(0, 200) });

    return postProcessCaption(rawCaption, params);
  },
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const PROVIDERS: Record<string, LLMProvider> = {
  zai: zaiProvider,
  ollama: ollamaProvider,
  lmstudio: lmstudioProvider,
  textgen: textgenProvider,
};

export function getProvider(id: string): LLMProvider {
  const provider = PROVIDERS[id];
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${id}. Available: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return provider;
}

export function listProviders(): Array<{
  id: string;
  name: string;
  needsEndpoint: boolean;
  needsModel: boolean;
  supportsVision: boolean;
  defaultEndpoint: string;
}> {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    name: p.name,
    needsEndpoint: p.needsEndpoint,
    needsModel: p.needsModel,
    supportsVision: p.supportsVision,
    defaultEndpoint: p.defaultEndpoint,
  }));
}

export { isOllamaVisionModel };
