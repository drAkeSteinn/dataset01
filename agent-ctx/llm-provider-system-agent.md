# Task: LLM Provider Abstraction System

## Summary
Created a comprehensive LLM provider abstraction system for the Dataset Manager LoRA training application. The system allows users to choose between multiple LLM backends (ZAI SDK, Ollama, LM Studio, Text Generation WebUI) for generating captions for training images.

## Files Created

### 1. `/home/z/my-project/src/lib/providers.ts`
Core LLM provider abstraction with:
- **Types**: `CaptionParams`, `LLMProvider` interfaces
- **4 Provider Implementations**:
  - **ZAI Provider**: Two-step VLM analysis + LLM caption generation using z-ai-web-dev-sdk. Handles content filter (1301) with crop reduction, rate limits (429) with retry.
  - **Ollama Provider**: Sends images as base64 to `/api/generate` (vision models) or `/api/chat` (text-only models). Auto-detects vision models by name patterns (llava, bakllava, minicpm-v, etc.).
  - **LM Studio Provider**: OpenAI-compatible `/v1/chat/completions` with vision format (image_url with data URI).
  - **TextGen WebUI Provider**: `/api/v1/chat/completions` with OpenAI vision format.
- **Helper Functions**: `buildPrompt()` for non-ZAI providers, `imageToBase64()`, `isOllamaVisionModel()`, `postProcessCaption()`
- **Registry**: `PROVIDERS`, `getProvider()`, `listProviders()` exports

### 2. `/home/z/my-project/src/app/api/llm/models/route.ts`
GET endpoint to list available models per provider:
- ZAI: returns empty array (no model selection needed)
- Ollama: GET `/api/tags` → list with vision detection
- LM Studio: GET `/v1/models` → OpenAI-compatible model list
- TextGen: GET `/api/v1/model` → current loaded model

### 3. `/home/z/my-project/src/app/api/llm/test/route.ts`
POST endpoint to test provider connectivity:
- ZAI: always success (cloud-based)
- Ollama: GET `/api/tags`
- LM Studio: GET `/v1/models`
- TextGen: GET `/api/v1/model`
- Returns `{ success: boolean, message: string }`

## Files Modified

### 4. `/home/z/my-project/src/app/api/datasets/[id]/generate-captions/route.ts`
- Now uses `getProvider()` from providers.ts instead of direct ZAI SDK calls
- Added `regenerate` flag support (body param): if true, processes all analyzed/captioned/error images
- Uses provider abstraction for caption generation
- Added `processedIds` Set for resume capability
- File existence check before processing
- Provider name and model info included in SSE progress events

### 5. `/home/z/my-project/src/app/api/datasets/route.ts`
- GET response now includes `llmProvider`, `llmModel`, `llmEndpoint` fields
- POST now accepts `llmProvider`, `llmModel`, `llmEndpoint` with defaults (zai, "", "")

### 6. `/home/z/my-project/src/app/api/datasets/[id]/route.ts`
- PUT allowedFields now includes `llmProvider`, `llmModel`, `llmEndpoint`

## Database Schema
Already had the required fields in Prisma schema:
- `llmProvider String @default("zai")`
- `llmModel String @default("")`
- `llmEndpoint String @default("")`

## Key Design Decisions
- z-ai-web-dev-sdk is ONLY used in backend code (providers.ts, imported via server-only paths)
- All external API calls have 60-second timeouts
- Ollama vision models auto-detected by name pattern matching
- Post-processing (trigger word prepending, template application) is shared across all providers via `postProcessCaption()`
- Error handling includes rate limit retry with 25s backoff
- SSE streaming maintained for real-time progress updates
