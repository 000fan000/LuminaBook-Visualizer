import { LlmSettings, SourceSegment, TranslationResult } from '../types';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export interface ProviderPreset {
  id: string;
  label: string;
  endpoint: string;
  models: string[];
  useJsonMode: boolean;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    endpoint: 'https://api.openai.com',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
    useJsonMode: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api',
    models: ['openai/gpt-4.1-mini', 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash-001'],
    useJsonMode: false,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    endpoint: 'https://api.deepseek.com',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    useJsonMode: false,
  },
  {
    id: 'local',
    label: 'Local / Custom',
    endpoint: 'http://localhost:11434',
    models: ['llama3.1', 'qwen2.5', 'mistral'],
    useJsonMode: false,
  },
];

export const normalizeEndpoint = (endpoint: string) => {
  const trimmed = endpoint.trim().replace(/\/$/, '');

  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }

  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
};

const parseJsonContent = (content: string): TranslationResult => {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch ? fencedMatch[1] : content;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  return JSON.parse((objectMatch ? objectMatch[0] : jsonText).trim()) as TranslationResult;
};

const buildHeaders = (settings: LlmSettings) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  return headers;
};

const buildRequestBody = (settings: LlmSettings, messages: Array<{ role: string; content: string }>, maxTokens?: number) => {
  const body: Record<string, unknown> = {
    model: settings.model,
    temperature: 0.3,
    messages,
  };

  if (maxTokens) {
    body.max_tokens = maxTokens;
  }

  if (settings.useJsonMode) {
    body.response_format = { type: 'json_object' };
  }

  return body;
};

const postChatCompletion = async (
  settings: LlmSettings,
  messages: Array<{ role: string; content: string }>,
  maxTokens?: number,
) => {
  const send = (useJsonMode: boolean) =>
    fetch(normalizeEndpoint(settings.endpoint), {
      method: 'POST',
      headers: buildHeaders(settings),
      body: JSON.stringify(
        buildRequestBody(
          {
            ...settings,
            useJsonMode,
          },
          messages,
          maxTokens,
        ),
      ),
    });

  const response = await send(settings.useJsonMode);

  if (response.ok || !settings.useJsonMode) {
    return response;
  }

  const detail = await response.text();

  if (/response_format|json/i.test(detail)) {
    return send(false);
  }

  return new Response(detail, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

export const translateSegment = async (
  segment: SourceSegment,
  motherLanguage: string,
  settings: LlmSettings,
): Promise<TranslationResult> => {
  if (!settings.endpoint.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
    throw new Error('Endpoint, API key, and model are required before translation.');
  }

  const response = await postChatCompletion(settings, [
    {
      role: 'system',
      content: settings.systemPrompt,
    },
    {
      role: 'user',
      content: `Translate this book segment into ${motherLanguage}.

Return JSON with exactly these fields:
- translatedText: faithful literary translation into the reader's mother language
- commentary: contextual explanation that helps recover meaning lost in translation
- keyTerms: array of up to 5 objects with term and explanation
- reflectionPrompt: one question that helps the reader compare source and translation

Formatting rules for translatedText:
- Preserve title lines, headings, paragraph breaks, numbered lists, stanza breaks, and visible line breaks from the source as much as possible.
- Do not translate running headers at the top of a page. They are usually just the book, chapter, or section name; copy them exactly as source text.
- If a source line is a standalone title or heading in the body, keep it as a standalone line and do not add extra blank lines around it.
- Do not collapse the passage into one paragraph.
- Preserve footnote markers, footer lines, page-like short lines, and deliberate indentation when they are semantically useful.
- Return newline characters inside the JSON string, not HTML.

Source language hint: ${segment.sourceLanguage}
Segment ${segment.index + 1}:
${segment.sourceText}`,
    },
  ]);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Translation request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Translation response did not include message content.');
  }

  return parseJsonContent(content);
};

export const testLlmSettings = async (settings: LlmSettings) => {
  if (!settings.endpoint.trim() || !settings.model.trim()) {
    throw new Error('Endpoint and model are required.');
  }

  const response = await postChatCompletion(
    settings,
    [
          { role: 'system', content: 'You are a connection test.' },
          { role: 'user', content: 'Reply with exactly: LuminaBook OK' },
        ],
    20,
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Provider test failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Provider responded, but no text content was returned.');
  }

  return content;
};

export const respondToReaderNote = async (
  note: string,
  segment: SourceSegment,
  translatedText: string,
  motherLanguage: string,
  settings: LlmSettings,
) => {
  if (!settings.endpoint.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
    throw new Error('Endpoint, API key, and model are required before note response.');
  }

  const response = await postChatCompletion(
    {
      ...settings,
      useJsonMode: false,
    },
    [
      {
        role: 'system',
        content:
          'You are LuminaBook, a concise hermeneutic reading companion. Respond to the reader note with textual context, translation nuance, and a useful follow-up question.',
      },
      {
        role: 'user',
        content: `Reader mother language: ${motherLanguage}

Original passage:
${segment.sourceText}

Current translation:
${translatedText || '(not translated yet)'}

Reader note:
${note}`,
      },
    ],
    700,
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Note response failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Note response did not include text content.');
  }

  return content;
};
