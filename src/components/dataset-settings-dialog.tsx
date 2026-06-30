'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, Server, CheckCircle2, XCircle, Database, Sparkles } from 'lucide-react';
import { DatabaseManager } from '@/components/database-manager';
import { CAPTION_PRESETS, type CaptionPreset } from '@/lib/caption-presets';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTabs,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/stores/app-store';
import { useDataset, useUpdateDataset, useDeleteDataset } from '@/hooks/use-datasets';
import type { CaptionStyle, LLMProvider, LLMModelInfo, ProviderInfo } from '@/types';

interface DatasetSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PROVIDERS: ProviderInfo[] = [
  { id: 'zai', name: 'ZAI SDK (Default)', needsEndpoint: false, needsModel: false, supportsVision: true, defaultEndpoint: '' },
  { id: 'ollama', name: 'Ollama', needsEndpoint: true, needsModel: true, supportsVision: true, defaultEndpoint: 'http://localhost:11434' },
  { id: 'lmstudio', name: 'LM Studio', needsEndpoint: true, needsModel: true, supportsVision: true, defaultEndpoint: 'http://localhost:1234' },
  { id: 'textgen', name: 'Text Generation WebUI', needsEndpoint: true, needsModel: true, supportsVision: false, defaultEndpoint: 'http://localhost:5000' },
];

export function DatasetSettingsDialog({ open, onOpenChange }: DatasetSettingsDialogProps) {
  const { activeDatasetId, setActiveDatasetId } = useAppStore();
  const { data: dataset } = useDataset(activeDatasetId);
  const updateDataset = useUpdateDataset();
  const deleteDataset = useDeleteDataset();

  const [activeTab, setActiveTab] = useState('general');
  const [prevDatasetId, setPrevDatasetId] = useState<string | null>(null);
  
  // General fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerWord, setTriggerWord] = useState('');
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>('tags');
  const [captionTemplate, setCaptionTemplate] = useState('');
  const [systemPromptOverride, setSystemPromptOverride] = useState('');
  const [showAdvancedPrompt, setShowAdvancedPrompt] = useState(false);

  // LLM Provider fields
  const [llmProvider, setLlmProvider] = useState<LLMProvider>('zai');
  const [llmModel, setLlmModel] = useState('');
  const [llmEndpoint, setLlmEndpoint] = useState('');
  const [availableModels, setAvailableModels] = useState<LLMModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Sync form state when dataset changes
  useEffect(() => {
    if (dataset && dataset.id !== prevDatasetId) {
      setPrevDatasetId(dataset.id);
      setName(dataset.name);
      setDescription(dataset.description);
      setTriggerWord(dataset.triggerWord);
      setCaptionStyle(dataset.captionStyle as CaptionStyle);
      setCaptionTemplate(dataset.captionTemplate);
      setSystemPromptOverride(dataset.systemPromptOverride || '');
      setLlmProvider((dataset.llmProvider as LLMProvider) || 'zai');
      setLlmModel(dataset.llmModel || '');
      setLlmEndpoint(dataset.llmEndpoint || '');
      setTestResult(null);
    }
  }, [dataset, prevDatasetId]);

  // Fetch models when provider or endpoint changes
  const fetchModels = useCallback(async (provider: LLMProvider, endpoint: string) => {
    if (provider === 'zai') {
      setAvailableModels([]);
      return;
    }
    
    if (!endpoint) return;
    
    setLoadingModels(true);
    try {
      const params = new URLSearchParams({ provider, endpoint });
      const res = await fetch(`/api/llm/models?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAvailableModels(data.models || []);
      } else {
        setAvailableModels([]);
      }
    } catch {
      setAvailableModels([]);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    if (llmProvider !== 'zai' && llmEndpoint) {
      fetchModels(llmProvider, llmEndpoint);
    } else {
      setAvailableModels([]);
    }
  }, [llmProvider, llmEndpoint, fetchModels]);

  const handleProviderChange = (provider: LLMProvider) => {
    setLlmProvider(provider);
    setLlmModel('');
    setTestResult(null);
    const info = PROVIDERS.find(p => p.id === provider);
    if (info && info.defaultEndpoint && !llmEndpoint) {
      setLlmEndpoint(info.defaultEndpoint);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/llm/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: llmProvider, endpoint: llmEndpoint, model: llmModel }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch {
      setTestResult({ success: false, message: 'Connection failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!activeDatasetId) return;
    try {
      await updateDataset.mutateAsync({
        id: activeDatasetId,
        name: name.trim(),
        description: description.trim(),
        triggerWord: triggerWord.trim(),
        captionStyle,
        captionTemplate: captionTemplate.trim(),
        llmProvider,
        llmModel: llmModel.trim(),
        llmEndpoint: llmEndpoint.trim(),
        systemPromptOverride: systemPromptOverride.trim(),
      });
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async () => {
    if (!activeDatasetId) return;
    if (!confirm('Are you sure you want to delete this dataset? This action cannot be undone.')) return;
    try {
      await deleteDataset.mutateAsync(activeDatasetId);
      setActiveDatasetId(null);
      onOpenChange(false);
    } catch {
      // Error handled by mutation
    }
  };

  const currentProvider = PROVIDERS.find(p => p.id === llmProvider);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dataset Settings</DialogTitle>
          <DialogDescription>
            Configure dataset properties, LLM provider, and caption generation settings.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'general'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'provider'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('provider')}
          >
            Proveedor LLM
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'database'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('database')}
          >
            Base de datos
          </button>
        </div>

        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="settings-name">Nombre</Label>
              <Input id="settings-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-description">Descripción</Label>
              <Textarea
                id="settings-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Describe what this dataset is about. This context helps generate better captions."
              />
              <p className="text-xs text-muted-foreground">
                This description is sent to the LLM as context when generating captions.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-trigger">Trigger word</Label>
              <Input
                id="settings-trigger"
                value={triggerWord}
                onChange={(e) => setTriggerWord(e.target.value)}
                placeholder="e.g. xyz123"
              />
              <p className="text-xs text-muted-foreground">
                Unique identifier for the LoRA concept. Will be prepended to all captions.
              </p>
            </div>

            {/* Caption presets — quick-apply configurations */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                Presets
              </Label>
              <div className="grid grid-cols-2 gap-1.5">
                {CAPTION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setCaptionStyle(preset.captionStyle);
                      if (preset.captionTemplate) {
                        setCaptionTemplate(preset.captionTemplate);
                      }
                      if (preset.suggestedDescription && !description.trim()) {
                        setDescription(preset.suggestedDescription);
                      }
                    }}
                    className="text-left rounded-md border p-2 hover:border-emerald-400 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-colors"
                    title={preset.description}
                  >
                    <p className="text-xs font-medium truncate">{preset.name}</p>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">
                      {preset.description}
                    </p>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Click a preset to apply its style, template, and suggested description. You can still edit everything after.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="settings-style">Estilo de caption</Label>
              <Select value={captionStyle} onValueChange={(v) => setCaptionStyle(v as CaptionStyle)}>
                <SelectTrigger id="settings-style">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Lenguaje natural</SelectItem>
                  <SelectItem value="tags">Tags (separados por comas)</SelectItem>
                  <SelectItem value="custom">Plantilla personalizada</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {captionStyle === 'natural' && 'Los captions serán descripciones en lenguaje natural (40-80 palabras).'}
                {captionStyle === 'tags' && 'Los captions serán tags separados por comas.'}
                {captionStyle === 'custom' && 'Usa una plantilla personalizada con placeholders como {trigger}, {description}, {colors}.'}
              </p>
            </div>

            {captionStyle === 'custom' && (
              <div className="space-y-2">
                <Label htmlFor="settings-template">Plantilla personalizada</Label>
                <Textarea
                  id="settings-template"
                  value={captionTemplate}
                  onChange={(e) => setCaptionTemplate(e.target.value)}
                  rows={3}
                  placeholder="{trigger}, {description}, {colors}"
                />
                <p className="text-xs text-muted-foreground">
                  Available: {'{trigger}'}, {'{description}'}, {'{colors}'}, {'{style}'}
                </p>
              </div>
            )}

            {/* Advanced: custom system prompt override */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowAdvancedPrompt(!showAdvancedPrompt)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Server className="h-3.5 w-3.5" />
                Advanced: Custom system prompt
                {systemPromptOverride.trim() && (
                  <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-amber-300 text-amber-600 bg-amber-50">
                    active
                  </Badge>
                )}
              </button>
              {showAdvancedPrompt && (
                <div className="space-y-2">
                  <Textarea
                    value={systemPromptOverride}
                    onChange={(e) => setSystemPromptOverride(e.target.value)}
                    rows={6}
                    placeholder="Leave empty to use the built-in prompt. When set, this replaces the entire system prompt sent to the LLM for caption generation (ZAI provider only)."
                    className="font-mono text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Override the built-in system prompt for full control. Only
                    applies to the ZAI provider. The user prompt (VLM analysis,
                    colors, notes) is still appended automatically. Leave empty
                    to use the default.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LLM Provider Tab */}
        {activeTab === 'provider' && (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={llmProvider} onValueChange={(v) => handleProviderChange(v as LLMProvider)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        <Server className="h-3.5 w-3.5" />
                        {p.name}
                        {p.supportsVision && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1">Vision</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {llmProvider === 'zai' && 'Cloud-based AI service. No setup needed. Two-step: VLM analysis + LLM caption generation.'}
                {llmProvider === 'ollama' && 'Local LLM runtime. Supports vision models (llava, minicpm-v, etc.). Sends images directly for analysis.'}
                {llmProvider === 'lmstudio' && 'Local model server with OpenAI-compatible API. Supports vision-capable models.'}
                {llmProvider === 'textgen' && 'Oobabooga Text Generation WebUI. Uses chat completions API. Text-only unless model supports vision.'}
              </p>
            </div>

            {/* Endpoint (for non-ZAI providers) */}
            {currentProvider?.needsEndpoint && (
              <div className="space-y-2">
                <Label htmlFor="settings-endpoint">API Endpoint</Label>
                <div className="flex gap-2">
                  <Input
                    id="settings-endpoint"
                    value={llmEndpoint}
                    onChange={(e) => { setLlmEndpoint(e.target.value); setTestResult(null); }}
                    placeholder={currentProvider.defaultEndpoint}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={handleTestConnection}
                    disabled={testing || !llmEndpoint}
                  >
                    {testing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {testResult && (
                  <div className={`flex items-center gap-1.5 text-xs ${testResult.success ? 'text-emerald-600' : 'text-red-500'}`}>
                    {testResult.success ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                    {testResult.message}
                  </div>
                )}
              </div>
            )}

            {/* Model Selection (for non-ZAI providers) */}
            {currentProvider?.needsModel && (
              <div className="space-y-2">
                <Label htmlFor="settings-model">Model</Label>
                {loadingModels ? (
                  <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading models...
                  </div>
                ) : availableModels.length > 0 ? (
                  <Select value={llmModel} onValueChange={setLlmModel}>
                    <SelectTrigger id="settings-model">
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            {m.name}
                            {m.hasVision && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-emerald-100 text-emerald-700">
                                Vision
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="settings-model"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder={
                      llmProvider === 'ollama' ? 'e.g. llava:latest, minicpm-v:latest' :
                      llmProvider === 'lmstudio' ? 'Model name from LM Studio' :
                      'Model name'
                    }
                  />
                )}
                {llmProvider === 'ollama' && availableModels.length === 0 && !loadingModels && llmEndpoint && (
                  <p className="text-xs text-muted-foreground">
                    No models found. Make sure Ollama is running and models are installed. You can also type the model name manually.
                  </p>
                )}
                {llmProvider === 'ollama' && availableModels.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {availableModels.filter(m => m.hasVision).length} vision model(s) detected. Vision models can analyze images directly.
                  </p>
                )}
              </div>
            )}

            {/* Provider-specific info */}
            <div className="rounded-lg border bg-muted/50 p-3 space-y-2">
              <h4 className="text-xs font-semibold text-foreground">How it works</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                {llmProvider === 'zai' && (
                  <>
                    <p>1. <strong>Analysis:</strong> Images are cropped (head region) and analyzed with VLM to describe characters</p>
                    <p>2. <strong>Caption:</strong> VLM analysis + color info + dataset context → LLM generates LoRA caption</p>
                    <p>3. Content-filtered images get smaller crops; rate-limited requests auto-retry</p>
                  </>
                )}
                {llmProvider === 'ollama' && (
                  <>
                    <p>1. <strong>Vision models</strong> (llava, minicpm-v, etc.): Images sent as base64 directly with the prompt</p>
                    <p>2. <strong>Text-only models</strong>: Existing VLM analysis is included in the prompt text</p>
                    <p>3. Images are processed one at a time (serial) to avoid overloading</p>
                  </>
                )}
                {llmProvider === 'lmstudio' && (
                  <>
                    <p>1. Images are sent as base64 in OpenAI vision format</p>
                    <p>2. Requires a vision-capable model loaded in LM Studio</p>
                    <p>3. Processing is serial (one image at a time)</p>
                  </>
                )}
                {llmProvider === 'textgen' && (
                  <>
                    <p>1. Uses the chat completions API endpoint</p>
                    <p>2. VLM analysis (if available) is included in the prompt</p>
                    <p>3. Processing is serial (one image at a time)</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Database Tab */}
        {activeTab === 'database' && (
          <DatabaseManager />
        )}

        {activeTab !== 'database' && (
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteDataset.isPending}
          >
            Eliminar dataset
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={updateDataset.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {updateDataset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar cambios
            </Button>
          </div>
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
