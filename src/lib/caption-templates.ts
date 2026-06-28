export interface CaptionSettings {
  triggerWord: string;
  captionStyle: 'natural' | 'tags' | 'custom';
  captionTemplate: string;
  description?: string;
}

/**
 * Build the system prompt for caption generation based on dataset settings.
 *
 * This prompt is GENERIC — it does not contain any hardcoded content themes.
 * It describes an expert visual analyst observing images and writing captions
 * for LoRA training datasets.
 */
export function buildSystemPrompt(settings: CaptionSettings): string {
  const basePrompt = `You are an expert visual analyst specializing in creating training captions for LoRA image generation models. Your task is to carefully observe images and write accurate, detailed captions that describe what you see.`;

  // Include dataset description as context if provided
  const contextBlock = settings.description
    ? `\n\nDATASET CONTEXT:\n${settings.description}\n\nThis context describes what the dataset is about. Use it to understand the theme and focus your captions accordingly.`
    : '';

  switch (settings.captionStyle) {
    case 'natural':
      return (
        basePrompt +
        contextBlock +
        `

Write natural language captions that describe the subject and scene in detail.
Each caption should:
- Start with the trigger word "${settings.triggerWord}" when provided
- Describe the subject's appearance, pose, expression, and clothing
- Include setting/background details
- Use complete, flowing sentences
- Be 50-100 words long
- Focus on visual elements that are important for image generation training
- Be accurate — only describe what you actually see in the image`
      );

    case 'tags':
      return (
        basePrompt +
        contextBlock +
        `

Write comma-separated tag captions for the image.
Each caption should:
- Start with the trigger word "${settings.triggerWord}" when provided
- List visual tags in order of importance (subject first, then details)
- Include tags for: subject features, clothing, pose, expression, setting, lighting, style
- Separate tags with commas
- Use short descriptive phrases (2-3 words each)
- Be concise and specific
- Avoid duplicate or redundant tags
- Be accurate — only tag what you actually see in the image`
      );

    case 'custom':
      return (
        basePrompt +
        contextBlock +
        `

Use the following template to generate captions. Replace the placeholders:
- {trigger} = the trigger word "${settings.triggerWord}"
- {description} = detailed visual description of the subject and scene
- {colors} = dominant colors in the image
- {style} = artistic style or quality descriptors

Template:
${settings.captionTemplate || '{trigger}, {description}'}

Fill in each placeholder with appropriate content based on the image analysis.
Be accurate — only describe what you actually see in the image.`
      );

    default:
      return basePrompt + contextBlock;
  }
}

/**
 * Build the user prompt for caption generation using VLM analysis, color info, and image description.
 */
export function buildUserPrompt(
  vlmAnalysis: string,
  colorInfo: string,
  imageDescription?: string
): string {
  let prompt = `Based on the following image analysis, generate a training caption:\n\n`;

  if (imageDescription) {
    prompt += `Image-Specific Notes (user-provided guidance for this image):\n${imageDescription}\n\n`;
  }

  if (vlmAnalysis) {
    prompt += `Image Analysis:\n${vlmAnalysis}\n\n`;
  }

  if (colorInfo) {
    prompt += `Dominant Colors:\n${colorInfo}\n\n`;
  }

  prompt += `Generate the caption now. Output ONLY the caption text:`;
  return prompt;
}

/**
 * Apply the caption template for custom style, replacing placeholders.
 */
export function applyTemplate(
  template: string,
  values: {
    trigger: string;
    description: string;
    colors: string;
    style: string;
  }
): string {
  return template
    .replace(/\{trigger\}/g, values.trigger)
    .replace(/\{description\}/g, values.description)
    .replace(/\{colors\}/g, values.colors)
    .replace(/\{style\}/g, values.style);
}
