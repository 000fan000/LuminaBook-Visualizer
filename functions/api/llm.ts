import { assertPlatformProviderConfigured, getServerSetupError, isDatabaseMigrationMissing, json, PagesContext, requireUser, serviceRpc } from './_shared';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PlatformRequest {
  requestId?: string;
  operation?: string;
  messages?: Message[];
  maxTokens?: number;
  temperature?: number;
  useJsonMode?: boolean;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ProviderResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: Usage;
}

const OPERATION_LIMITS: Record<string, { maxInputCharacters: number; maxOutputTokens: number }> = {
  test: { maxInputCharacters: 2000, maxOutputTokens: 40 },
  metadata: { maxInputCharacters: 12000, maxOutputTokens: 700 },
  translate: { maxInputCharacters: 60000, maxOutputTokens: 4000 },
  note: { maxInputCharacters: 30000, maxOutputTokens: 700 },
  chat: { maxInputCharacters: 40000, maxOutputTokens: 900 },
  define: { maxInputCharacters: 30000, maxOutputTokens: 600 },
  organize: { maxInputCharacters: 50000, maxOutputTokens: 10000 },
};

const normalizeEndpoint = (endpoint: string) => {
  const value = endpoint.replace(/\/$/, '');
  if (value.endsWith('/chat/completions')) return value;
  if (value.endsWith('/v1')) return `${value}/chat/completions`;
  return `${value}/v1/chat/completions`;
};

const releaseReservation = async (
  context: PagesContext,
  requestId: string,
  code: string,
  responseStatus?: number,
  elapsedMs?: number,
) => {
  try {
    await serviceRpc(context, 'release_daily_quota_v2', {
      p_request_id: requestId,
      p_error_code: code,
      p_response_status: responseStatus ?? null,
      p_elapsed_ms: elapsedMs ?? null,
    });
  } catch (error) {
    console.error('Could not release quota reservation.', error);
  }
};

export const onRequestPost = async (context: PagesContext) => {
  let requestId = '';

  try {
    const user = await requireUser(context);
    assertPlatformProviderConfigured(context);
    const payload = (await context.request.json()) as PlatformRequest;
    requestId = payload.requestId || crypto.randomUUID();
    const operation = payload.operation || '';
    const limits = OPERATION_LIMITS[operation];
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    if (!limits || !messages.length || messages.length > 12) {
      return json({ error: 'Unsupported LuminaBook operation.' }, 400);
    }

    if (messages.some((message) => !['system', 'user', 'assistant'].includes(message.role) || typeof message.content !== 'string')) {
      return json({ error: 'Invalid message payload.' }, 400);
    }

    const inputCharacters = messages.reduce((total, message) => total + message.content.length, 0);
    if (inputCharacters > limits.maxInputCharacters) {
      return json({ error: 'This passage is too large for one funded request.' }, 413);
    }

    const maxOutputTokens = Math.max(1, Math.min(payload.maxTokens || limits.maxOutputTokens, limits.maxOutputTokens));
    const reservedUnits = Math.min(50000, inputCharacters + maxOutputTokens * 3);
    const reservation = await serviceRpc<Array<{ accepted: boolean; remaining_units: number; reason: string | null }>>(
      context,
      'reserve_daily_quota',
      {
        p_user_id: user.id,
        p_request_id: requestId,
        p_operation: operation,
        p_reserved_units: reservedUnits,
      },
    );
    const result = reservation[0];

    if (!result?.accepted) {
      const suspended = result?.reason === 'account_suspended';
      return json(
        {
          error: suspended
            ? 'This account is suspended from funded model usage.'
            : result?.reason === 'quota_exhausted'
              ? 'Daily reading credits are exhausted. Use a personal provider or return after 00:00 UTC.'
              : 'This request could not reserve daily credits.',
          remainingUnits: result?.remaining_units || 0,
        },
        suspended ? 403 : result?.reason === 'quota_exhausted' ? 429 : 409,
      );
    }

    const providerStartedAt = Date.now();
    const providerResponse = await fetch(normalizeEndpoint(context.env.PLATFORM_LLM_ENDPOINT), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.env.PLATFORM_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: context.env.PLATFORM_LLM_MODEL,
        messages,
        temperature: Number.isFinite(payload.temperature) ? Math.max(0, Math.min(payload.temperature as number, 1)) : 0.3,
        max_tokens: maxOutputTokens,
        ...(payload.useJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const providerText = await providerResponse.text();
    const providerElapsedMs = Date.now() - providerStartedAt;

    if (!providerResponse.ok) {
      await releaseReservation(context, requestId, `provider_${providerResponse.status}`, providerResponse.status, providerElapsedMs);
      return json({ error: `The funded model request failed (${providerResponse.status}).` }, 502);
    }

    const data = JSON.parse(providerText) as ProviderResponse;
    const responseContent = data.choices?.[0]?.message?.content || '';
    const inputTokens = data.usage?.prompt_tokens ?? Math.ceil(inputCharacters / 3);
    const outputTokens = data.usage?.completion_tokens ?? Math.ceil(responseContent.length / 3);
    const chargedUnits = Math.max(1, inputTokens + outputTokens * 3);
    const inputRate = Number.parseFloat(context.env.PLATFORM_LLM_INPUT_USD_PER_MILLION || '0');
    const outputRate = Number.parseFloat(context.env.PLATFORM_LLM_OUTPUT_USD_PER_MILLION || '0');
    const estimatedCostMicrousd = Math.max(0, Math.round(inputTokens * inputRate + outputTokens * outputRate));
    const remainingUnits = await serviceRpc<number>(context, 'settle_daily_quota_v2', {
      p_request_id: requestId,
      p_model: context.env.PLATFORM_LLM_MODEL,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_charged_units: chargedUnits,
      p_response_status: providerResponse.status,
      p_elapsed_ms: providerElapsedMs,
      p_estimated_cost_microusd: estimatedCostMicrousd,
    });

    return new Response(providerText, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'X-LuminaBook-Quota-Remaining': String(remainingUnits),
      },
    });
  } catch (error) {
    if (requestId) await releaseReservation(context, requestId, 'internal_error');
    const message = error instanceof Error ? error.message : 'platform_error';
    console.error('Platform LLM request failed.', error);
    const setupError = getServerSetupError(error);
    if (setupError) return json({ error: setupError }, 503);
    if (isDatabaseMigrationMissing(error)) {
      return json({ error: 'Account database migrations are missing. Apply both SQL files in supabase/migrations, then retry.' }, 503);
    }
    return json({ error: message === 'unauthorized' ? 'Sign in to use [FREE-QWEN].' : 'The funded model service is unavailable.' }, message === 'unauthorized' ? 401 : 500);
  }
};
