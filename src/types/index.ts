export type ImageStatus = 'pending' | 'analyzing' | 'analyzed' | 'captioned' | 'error';
export type CaptionStyle = 'natural' | 'tags' | 'custom';
export type LLMProvider = 'zai' | 'ollama' | 'lmstudio' | 'textgen';

export interface DatasetStats {
  total: number;
  pending: number;
  analyzed: number;
  captioned: number;
  error: number;
}

export interface Dataset {
  id: string;
  name: string;
  description: string;
  triggerWord: string;
  captionStyle: CaptionStyle;
  captionTemplate: string;
  imagePath: string;
  imageCount: number;
  llmProvider: LLMProvider;
  llmModel: string;
  llmEndpoint: string;
  createdAt: string;
  updatedAt: string;
  stats?: DatasetStats;
}

export interface DatasetImage {
  id: string;
  datasetId: string;
  filename: string;
  originalPath: string;
  caption: string;
  vlmAnalysis: string;
  colorInfo: string;
  imageDescription: string;
  status: ImageStatus;
  errorMessage: string;
  regenerationPending: boolean;
  selectedForRegen: boolean;
  width: number;
  height: number;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedImages {
  images: DatasetImage[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BatchProgress {
  processed: number;
  total: number;
  message?: string;
}

export interface BatchResult {
  imageId: string;
  filename: string;
  vlmAnalysis?: string;
  caption?: string;
  colorInfo?: string;
}

export interface BatchError {
  imageId: string;
  filename: string;
  error: string;
}

export interface BatchOperationState {
  isRunning: boolean;
  type: 'analyze' | 'generate-captions' | 'regenerate' | null;
  progress: BatchProgress;
  currentFile: string;
  errors: BatchError[];
  results: BatchResult[];
}

export interface CreateDatasetInput {
  name: string;
  description?: string;
  triggerWord?: string;
  captionStyle?: CaptionStyle;
  captionTemplate?: string;
  importPath?: string;
  llmProvider?: LLMProvider;
  llmModel?: string;
  llmEndpoint?: string;
}

export interface UpdateDatasetInput {
  name?: string;
  description?: string;
  triggerWord?: string;
  captionStyle?: CaptionStyle;
  captionTemplate?: string;
  imagePath?: string;
  llmProvider?: LLMProvider;
  llmModel?: string;
  llmEndpoint?: string;
}

export interface ColorInfo {
  avgR: number;
  avgG: number;
  avgB: number;
  dominant: string;
  palette?: string[];
}

export interface LLMModelInfo {
  id: string;
  name: string;
  hasVision: boolean;
}

export interface ProviderInfo {
  id: LLMProvider;
  name: string;
  needsEndpoint: boolean;
  needsModel: boolean;
  supportsVision: boolean;
  defaultEndpoint: string;
}
