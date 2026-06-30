/**
 * Caption prompt presets — ready-made configurations for common LoRA training
 * scenarios. Each preset sets a captionStyle and (for custom) a captionTemplate,
 * plus a suggested description to guide the LLM.
 *
 * Users can apply a preset to a dataset to quickly configure it, then tweak
 * further. Presets are read-only definitions; applying one just writes the
 * values into the dataset's settings.
 */

export interface CaptionPreset {
  id: string;
  name: string;
  description: string;
  captionStyle: 'natural' | 'tags' | 'custom';
  captionTemplate?: string;
  /** Suggested dataset description (the user can edit after applying). */
  suggestedDescription?: string;
  /** What kind of content this preset is tuned for. */
  category: 'character' | 'style' | 'concept' | 'general';
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'anime-character-tags',
    name: 'Anime Character (tags)',
    description:
      'Short comma-separated tags focused on a character: appearance, clothing, pose, expression. Ideal for character LoRAs.',
    captionStyle: 'tags',
    suggestedDescription:
      'Anime character dataset. Describe the character\'s hair color, eye color, hairstyle, clothing, accessories, pose, and expression. Focus on visual details that define the character.',
    category: 'character',
  },
  {
    id: 'anime-character-natural',
    name: 'Anime Character (natural)',
    description:
      'Natural flowing sentences describing a character in 40-80 words. Good for character LoRAs that need richer context.',
    captionStyle: 'natural',
    suggestedDescription:
      'Anime character dataset. Write natural descriptions of the character including their appearance, outfit, pose, and the scene. Focus on what makes this character distinctive.',
    category: 'character',
  },
  {
    id: 'art-style',
    name: 'Art Style',
    description:
      'Tags focused on artistic technique: medium, style, coloring, composition, lighting. For style LoRAs.',
    captionStyle: 'tags',
    suggestedDescription:
      'Art style dataset. Describe the artistic technique: medium (digital, oil, watercolor), art style, color palette, lighting, composition, brushwork. Do not describe the subject — focus on HOW it\'s drawn.',
    category: 'style',
  },
  {
    id: 'concept-object',
    name: 'Concept / Object',
    description:
      'Detailed tags for a specific concept or object. Describe the subject thoroughly for concept LoRAs.',
    captionStyle: 'tags',
    suggestedDescription:
      'Concept/object dataset. Describe the subject in detail: its shape, color, texture, features, state, and any variations. Focus on what defines this concept.',
    category: 'concept',
  },
  {
    id: 'custom-template',
    name: 'Custom Template',
    description:
      'Use a custom template with placeholders: {trigger}, {description}, {colors}, {style}.',
    captionStyle: 'custom',
    captionTemplate: '{trigger}, {style}, {description}',
    suggestedDescription:
      'Dataset with custom caption template. The placeholders will be filled from the VLM analysis and color info.',
    category: 'general',
  },
  {
    id: 'minimal-tags',
    name: 'Minimal Tags',
    description:
      'Very short tag list — only the 5-8 most important descriptors. For datasets where brevity matters.',
    captionStyle: 'tags',
    suggestedDescription:
      'Minimalist tag dataset. List only the 5-8 most important visual tags: the subject, its key features, and the most distinctive attributes. Avoid redundant or minor details.',
    category: 'general',
  },
];

export function getPresetById(id: string): CaptionPreset | undefined {
  return CAPTION_PRESETS.find((p) => p.id === id);
}

export const PRESET_CATEGORIES: Array<{
  id: CaptionPreset['category'];
  label: string;
}> = [
  { id: 'character', label: 'Character' },
  { id: 'style', label: 'Style' },
  { id: 'concept', label: 'Concept' },
  { id: 'general', label: 'General' },
];
