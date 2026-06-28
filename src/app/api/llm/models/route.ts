import { NextRequest, NextResponse } from 'next/server';
import { isOllamaVisionModel } from '@/lib/providers';

/**
 * GET /api/llm/models - List available models for a given provider.
 *
 * Query params:
 *   provider - Provider id (ollama, lmstudio, textgen, zai)
 *   endpoint - API endpoint URL
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const provider = searchParams.get('provider');
    const endpoint = searchParams.get('endpoint');

    if (!provider) {
      return NextResponse.json(
        { error: 'Missing required query param: provider' },
        { status: 400 }
      );
    }

    switch (provider) {
      case 'zai':
        // ZAI SDK handles model selection internally, no user choice needed
        return NextResponse.json({ models: [] });

      case 'ollama':
        return await listOllamaModels(endpoint);

      case 'lmstudio':
        return await listLMStudioModels(endpoint);

      case 'textgen':
        return await listTextGenModels(endpoint);

      default:
        return NextResponse.json(
          { error: `Unknown provider: ${provider}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error listing models:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to list models';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * List models from Ollama via /api/tags endpoint.
 */
async function listOllamaModels(
  endpoint?: string | null
): Promise<NextResponse> {
  const baseUrl = endpoint || 'http://localhost:11434';

  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Ollama API returned ${response.status}. Make sure Ollama is running at ${baseUrl}`,
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = data.models || [];

    const result = models.map((m) => ({
      id: m.name || 'unknown',
      name: m.name || 'unknown',
      hasVision: isOllamaVisionModel(m.name || ''),
    }));

    return NextResponse.json({ models: result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to connect to Ollama';
    return NextResponse.json(
      { error: `Cannot connect to Ollama at ${baseUrl}: ${message}` },
      { status: 502 }
    );
  }
}

/**
 * List models from LM Studio via /v1/models endpoint.
 */
async function listLMStudioModels(
  endpoint?: string | null
): Promise<NextResponse> {
  const baseUrl = endpoint || 'http://localhost:1234';

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `LM Studio API returned ${response.status}. Make sure LM Studio is running at ${baseUrl}`,
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };
    const models = data.data || [];

    const result = models.map((m) => ({
      id: m.id || 'unknown',
      name: m.id || 'unknown',
      hasVision: true, // LM Studio loaded models are typically vision-capable if loaded
    }));

    return NextResponse.json({ models: result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to connect to LM Studio';
    return NextResponse.json(
      { error: `Cannot connect to LM Studio at ${baseUrl}: ${message}` },
      { status: 502 }
    );
  }
}

/**
 * List the current model from Text Generation WebUI via /api/v1/model endpoint.
 */
async function listTextGenModels(
  endpoint?: string | null
): Promise<NextResponse> {
  const baseUrl = endpoint || 'http://localhost:5000';

  try {
    const response = await fetch(`${baseUrl}/api/v1/model`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `TextGen WebUI API returned ${response.status}. Make sure TextGen WebUI is running at ${baseUrl}`,
        },
        { status: 502 }
      );
    }

    const data = (await response.json()) as {
      result?: string;
      model_name?: string;
    };
    const modelName = data.result || data.model_name || 'unknown';

    const result = [
      {
        id: modelName,
        name: modelName,
        hasVision: false, // TextGen WebUI vision support depends on extension
      },
    ];

    return NextResponse.json({ models: result });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to connect to TextGen WebUI';
    return NextResponse.json(
      { error: `Cannot connect to TextGen WebUI at ${baseUrl}: ${message}` },
      { status: 502 }
    );
  }
}
