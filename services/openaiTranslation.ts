import {
  BookMetadata,
  LlmAnnotation,
  LlmSettings,
  SourceSegment,
  TranslationResult,
  UploadedBook,
} from '../types';
import { saveLlmEvaluationRecord } from './llmEvaluationStorage';

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
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

const parseJsonObjectContent = <T,>(content: string): T => {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonText = fencedMatch ? fencedMatch[1] : content;
  const objectMatch = jsonText.match(/\{[\s\S]*\}/);
  return JSON.parse((objectMatch ? objectMatch[0] : jsonText).trim()) as T;
};

const parseJsonContent = (content: string): TranslationResult => {
  const parsed = parseJsonObjectContent<TranslationResult>(content);
  const layout = parsed.layout
    ? {
        header: parsed.layout.header || '',
        title: parsed.layout.title || '',
        body: parsed.layout.body || parsed.translatedText || '',
        notes: Array.isArray(parsed.layout.notes) ? parsed.layout.notes.map(String) : [],
        footer: parsed.layout.footer || '',
      }
    : {
        body: parsed.translatedText || '',
      };
  const annotations = Array.isArray(parsed.annotations)
    ? parsed.annotations
        .map((annotation): LlmAnnotation | null => {
          if (!annotation || typeof annotation !== 'object') {
            return null;
          }

          const sourceText = String(annotation.sourceText || '').trim();
          const title = String(annotation.title || '').trim();
          const body = String(annotation.body || '').trim();
          const kind: LlmAnnotation['kind'] =
            annotation.kind === 'term' ||
            annotation.kind === 'translation' ||
            annotation.kind === 'reflection'
              ? annotation.kind
              : 'context';

          return sourceText && title && body ? { sourceText, title, body, kind } : null;
        })
        .filter((annotation): annotation is LlmAnnotation => Boolean(annotation))
        .slice(0, 6)
    : [];

  return {
    ...parsed,
    layout,
    translatedText: parsed.translatedText || layout.body,
    commentary: parsed.commentary || '',
    pageGuide: String(parsed.pageGuide || parsed.commentary || '').trim(),
    consumedNextSourceText: String(parsed.consumedNextSourceText || '').trim(),
    keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
    reflectionPrompt: parsed.reflectionPrompt || '',
    annotations,
  };
};

const optionalMetadataText = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
};

const escapeRegularExpression = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findSuppliedSourceText = (sourceText: string, requestedText: string) => {
  const requested = requestedText.replace(/\s+/g, ' ').trim();

  if (!requested) {
    return '';
  }

  const directIndex = sourceText.indexOf(requestedText.trim());
  if (directIndex >= 0) {
    return sourceText.slice(directIndex, directIndex + requestedText.trim().length);
  }

  const pattern = requested.split(/\s+/).map(escapeRegularExpression).join('\\s+');
  return sourceText.match(new RegExp(pattern, 'u'))?.[0] || '';
};

const removeConsumedSourceText = (sourceText: string, consumedSourceText?: string) => {
  const exact = findSuppliedSourceText(sourceText, consumedSourceText || '');

  if (!exact) {
    return sourceText;
  }

  const index = sourceText.indexOf(exact);
  return index <= 1400 ? `${sourceText.slice(0, index)}${sourceText.slice(index + exact.length)}` : sourceText;
};

const removeUntranslatedHandoff = (translatedText: string, boundaryHandoffSourceText: string) => {
  const exact = findSuppliedSourceText(translatedText, boundaryHandoffSourceText);

  if (!exact) {
    return translatedText;
  }

  return translatedText.replace(exact, '').replace(/\n{3,}/g, '\n\n').trim();
};

const getMainTextEnding = (sourceText: string) => {
  const lines = sourceText.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const lastLine = lines[lines.length - 1] || '';
  const looksLikeFooter =
    lastLine.length <= 100 &&
    (/\d|[:|]/.test(lastLine) || /copyright|bibliothek|library|ebook|digital|press|publisher/i.test(lastLine));

  return (looksLikeFooter ? lines.slice(0, -1) : lines).join('\n').trimEnd();
};

const getBoundaryHandoffSourceText = (targetSourceText: string, nextPagePreview?: string) => {
  const targetEnding = getMainTextEnding(targetSourceText);
  const preview = (nextPagePreview || '').trim();

  if (!targetEnding || !preview || /[.!?。！？]["'”’»\])}]*\s*$/u.test(targetEnding)) {
    return '';
  }

  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: string }) => {
    segment: (text: string) => Iterable<{ segment: string }>;
  } }).Segmenter;
  const firstSentence = Segmenter
    ? Array.from(new Segmenter(undefined, { granularity: 'sentence' }).segment(preview))[0]?.segment.trim()
    : preview.match(/^[\s\S]*?[.!?。！？](?=\s|$)/u)?.[0].trim();

  return firstSentence && /[.!?。！？]["'”’»\])}]*\s*$/u.test(firstSentence) ? firstSentence : '';
};

export const detectBookMetadata = async (
  book: UploadedBook,
  settings: LlmSettings,
): Promise<Partial<BookMetadata>> => {
  if (!settings.endpoint.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
    throw new Error('Endpoint, API key, and model are required before metadata detection.');
  }

  const response = await postChatCompletion(
    settings,
    [
      {
        role: 'system',
        content: 'You identify bibliographic metadata from book files. Return only reliable information as JSON and leave uncertain fields empty.',
      },
      {
        role: 'user',
        content: `Detect bibliographic metadata for this book.

Return JSON with exactly these fields:
- title: string or empty string
- author: string or empty string
- publicationYear: integer or null
- country: country most associated with the work's original publication or empty string
- language: original language of the work or empty string
- publisher: publisher of this edition if clearly present, otherwise empty string
- tags: array of up to 8 concise subject or genre tags
- description: factual description in 1 or 2 sentences, or empty string

Rules:
- Prefer explicit title-page, copyright-page, filename, and table-of-contents evidence.
- Do not invent a publisher, year, country, or author when evidence is weak.
- Do not include markdown.

Filename: ${book.fileName}
Current metadata: ${JSON.stringify({
          title: book.title,
          author: book.author || '',
          publicationYear: book.publicationYear || null,
          country: book.country || '',
          language: book.language || '',
          publisher: book.publisher || '',
          tags: book.tags || [],
        })}
Table of contents: ${(book.toc || []).slice(0, 24).map((entry) => entry.title).join(' | ') || '(none)'}

Opening excerpt:
<book_excerpt>
${book.text.slice(0, 6000)}
</book_excerpt>`,
      },
    ],
    700,
    'detect book metadata',
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Metadata detection failed (${response.status}): ${responseText.slice(0, 400)}`);
  }

  const content = extractResponseContent(responseText);

  if (!content) {
    throw new Error('The model returned an empty metadata response.');
  }

  const parsed = parseJsonObjectContent<Record<string, unknown>>(content);
  const parsedYear =
    typeof parsed.publicationYear === 'number'
      ? parsed.publicationYear
      : typeof parsed.publicationYear === 'string'
        ? Number.parseInt(parsed.publicationYear, 10)
        : undefined;
  const publicationYear = Number.isInteger(parsedYear) ? parsedYear : undefined;
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8)
    : [];

  return {
    title: optionalMetadataText(parsed.title),
    author: optionalMetadataText(parsed.author),
    publicationYear,
    country: optionalMetadataText(parsed.country),
    language: optionalMetadataText(parsed.language),
    publisher: optionalMetadataText(parsed.publisher),
    tags,
    description: optionalMetadataText(parsed.description),
  };
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
  const temperature = Number.isFinite(settings.temperature) ? settings.temperature : 0.3;
  const body: Record<string, unknown> = {
    model: settings.model,
    temperature,
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

const sanitizeHeadersForLog = (headers: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      key.toLowerCase() === 'authorization' ? 'Bearer ***' : value,
    ]),
  );

const cloneTextResponse = (response: Response, bodyText: string) =>
  new Response(bodyText, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });

const countWords = (text: string) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

const extractResponseContent = (responseText: string) => {
  try {
    const data = JSON.parse(responseText) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content || '';
  } catch {
    return '';
  }
};

const extractResponseUsage = (responseText: string) => {
  try {
    const data = JSON.parse(responseText) as ChatCompletionResponse;

    return {
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null,
      totalTokens: data.usage?.total_tokens ?? null,
    };
  } catch {
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    };
  }
};

const getEvaluationTemperature = (settings: LlmSettings) => (Number.isFinite(settings.temperature) ? settings.temperature : 0.3);

const getEvaluationTimeoutMs = (settings: LlmSettings) =>
  Number.isFinite(settings.requestTimeoutMs) && settings.requestTimeoutMs > 0 ? settings.requestTimeoutMs : 600_000;

const safeSaveEvaluationRecord = (record: Parameters<typeof saveLlmEvaluationRecord>[0]) => {
  saveLlmEvaluationRecord(record).catch((error) => {
    console.warn('[LuminaBook LLM] could not save evaluation record', error);
  });
};

const postChatCompletion = async (
  settings: LlmSettings,
  messages: Array<{ role: string; content: string }>,
  maxTokens?: number,
  requestName = 'chat completion',
) => {
  const url = normalizeEndpoint(settings.endpoint);
  const logPrefix = `[LuminaBook LLM] ${requestName}`;
  const timeoutMs = getEvaluationTimeoutMs(settings);
  const temperature = getEvaluationTemperature(settings);

  const send = async (useJsonMode: boolean, attempt: string) => {
    const headers = buildHeaders(settings);
    const requestBody = buildRequestBody(
      {
        ...settings,
        useJsonMode,
      },
      messages,
      maxTokens,
    );
    const startedAt = Date.now();
    const requestText = JSON.stringify(requestBody);
    const inputText = messages.map((message) => message.content).join('\n\n');

    console.groupCollapsed(`${logPrefix} request`);
    console.log({
      attempt,
      provider: settings.provider,
      endpoint: url,
      method: 'POST',
      model: settings.model,
      useJsonMode,
      maxTokens: maxTokens ?? null,
      headers: sanitizeHeadersForLog(headers),
      body: requestBody,
      requestCharacters: requestText.length,
      inputCharacters: inputText.length,
      timeoutMs,
    });
    console.groupEnd();

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
      const responseText = await response.text();
      const elapsedMs = Date.now() - startedAt;
      window.clearTimeout(timeoutId);
      const responseContent = extractResponseContent(responseText);
      const responseUsage = extractResponseUsage(responseText);

      console.info(`${logPrefix} status`, {
        attempt,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        elapsedMs,
        responseCharacters: responseText.length,
        outputCharacters: responseContent.length,
        ...responseUsage,
      });
      console.groupCollapsed(`${logPrefix} response body`);
      console.log(responseText);
      console.groupEnd();

      safeSaveEvaluationRecord({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        localTime: new Date().toLocaleString(),
        profileId: settings.profileId || '',
        profileName: settings.profileName || settings.model,
        requestName,
        attempt,
        provider: settings.provider,
        endpoint: url,
        method: 'POST',
        model: settings.model,
        temperature,
        maxTokens: maxTokens ?? null,
        useJsonMode,
        timeoutMs,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        elapsedMs,
        elapsedSeconds: Number((elapsedMs / 1000).toFixed(3)),
        timedOut: false,
        promptMessages: messages.length,
        inputCharacters: inputText.length,
        inputWords: countWords(inputText),
        outputCharacters: responseContent.length,
        outputWords: countWords(responseContent),
        ...responseUsage,
        requestCharacters: requestText.length,
        responseCharacters: responseText.length,
        requestBody: requestText,
        responseBody: responseText,
        responseContent,
        errorMessage: response.ok ? '' : responseText.slice(0, 2000),
        qualityScore: '',
        qualityNotes: '',
      });

      return cloneTextResponse(response, responseText);
    } catch (error) {
      window.clearTimeout(timeoutId);
      const elapsedMs = Date.now() - startedAt;
      const isTimeout = error instanceof DOMException && error.name === 'AbortError';
      const errorMessage = isTimeout
        ? `${requestName} timed out after ${Math.round(timeoutMs / 1000)} seconds.`
        : error instanceof Error
          ? error.message
          : String(error);

      console.error(`${logPrefix} failed`, {
        attempt,
        elapsedMs,
        timeoutMs,
        timedOut: isTimeout,
        error,
      });
      safeSaveEvaluationRecord({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        localTime: new Date().toLocaleString(),
        profileId: settings.profileId || '',
        profileName: settings.profileName || settings.model,
        requestName,
        attempt,
        provider: settings.provider,
        endpoint: url,
        method: 'POST',
        model: settings.model,
        temperature,
        maxTokens: maxTokens ?? null,
        useJsonMode,
        timeoutMs,
        ok: false,
        status: null,
        statusText: '',
        elapsedMs,
        elapsedSeconds: Number((elapsedMs / 1000).toFixed(3)),
        timedOut: isTimeout,
        promptMessages: messages.length,
        inputCharacters: inputText.length,
        inputWords: countWords(inputText),
        outputCharacters: 0,
        outputWords: 0,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        requestCharacters: requestText.length,
        responseCharacters: 0,
        requestBody: requestText,
        responseBody: '',
        responseContent: '',
        errorMessage,
        qualityScore: '',
        qualityNotes: '',
      });

      if (isTimeout) {
        throw new Error(errorMessage);
      }

      throw error;
    }
  };

  const response = await send(settings.useJsonMode, settings.useJsonMode ? 'json mode' : 'standard');

  if (response.ok || !settings.useJsonMode) {
    return response;
  }

  const detail = await response.text();

  if (/response_format|json/i.test(detail)) {
    console.warn(`${logPrefix} retrying without JSON mode`, {
      initialStatus: response.status,
      detail: detail.slice(0, 500),
    });
    return send(false, 'fallback without JSON mode');
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
  continuity?: {
    nextPagePreview?: string;
    consumedSourceText?: string;
  },
): Promise<TranslationResult> => {
  if (!settings.endpoint.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
    throw new Error('Endpoint, API key, and model are required before translation.');
  }

  const targetSourceText = removeConsumedSourceText(segment.sourceText, continuity?.consumedSourceText);
  const boundaryHandoffSourceText = getBoundaryHandoffSourceText(targetSourceText, continuity?.nextPagePreview);
  const response = await postChatCompletion(
    settings,
    [
      {
        role: 'system',
        content: settings.systemPrompt,
      },
      {
        role: 'user',
        content: `Translate ONLY the text inside <target_segment> into ${motherLanguage}.

Boundary handoff rules:
- Translate all text inside <target_segment>.
- <boundary_handoff> has already been computed deterministically. When it is not "(none)", append its meaning once to finish the final sentence of <target_segment>.
- Never translate beyond <boundary_handoff>, and never repeat its meaning as a separate sentence or fragment.
- consumedNextSourceText is metadata only: copy <boundary_handoff> exactly into that JSON field, or return an empty string when it is "(none)".
- Never copy source-language text from <boundary_handoff> into translatedText or layout.body; include only its translated meaning there.
- commentary, pageGuide, keyTerms, reflectionPrompt, annotations, layout.header, layout.title, layout.notes, and layout.footer must use only <target_segment>.

Return JSON with exactly these fields:
- translatedText: faithful literary translation into the reader's mother language
- layout: object with header, title, body, notes, footer
- commentary: contextual explanation that helps recover meaning lost in translation
- pageGuide: one self-contained remark about the current page as a whole
- consumedNextSourceText: exact contents of boundary_handoff when present, otherwise empty string
- keyTerms: array of up to 5 objects with term and explanation
- reflectionPrompt: one question that helps the reader compare source and translation
- annotations: array of up to 6 objects with sourceText, title, body, and kind

annotation rules:
- sourceText must be an exact term or short phrase copied from <target_segment>, between 2 and 40 characters
- sourceText should normally contain 1 to 6 words and must never be a full sentence
- sourceText must stay within one source line and must not contain line breaks
- sourceText is only a precise anchor for highlighting; do not merely define, translate, or restate it in the annotation
- title is a specific interpretive heading, not a repetition of sourceText
- body must be grounded in how the anchored phrase functions in this particular target passage
- body should add one focused implication, tension, connection, or interpretive inference, then give a concrete reading cue about what distinction, pattern, question, or development to watch for as the text continues
- distinguish textual evidence from inference with language such as "suggests" or "may foreshadow"; do not invent authorial intent, plot facts, or historical claims unsupported by the supplied text
- prefer 2 concise sentences and avoid generic dictionary definitions, broad thematic summaries, and advice that could apply to any passage
- kind must be one of: term, context, translation, reflection
- prioritize phrases whose local context supports historical context, ambiguity, metaphor, syntax, translation loss, conceptual development, or a useful forward-reading question
- omit any annotation that cannot be anchored to an exact sourceText quote

pageGuide rules:
- discuss the current page as a whole rather than annotating individual words, phrases, or lines
- use only <target_segment>; do not speculate about content before or after this page
- center the remark on the current page
- explain the page's role in the developing argument, narrative, image, or structure, then give the reader a concrete question or pattern to carry forward
- write one focused paragraph of 3 to 5 sentences in ${motherLanguage}
- do not quote isolated source words, list vocabulary, use annotation-style headings, mention page boundaries or XML tags, or claim facts unsupported by the supplied text

layout rules:
- infer the page structure only from <target_segment>
- header: the running header/page header from the top of <target_segment>, copied exactly in its source language; empty string only when the target page genuinely has no running header
- treat a short isolated top line naming the book, author, chapter, or section as a likely running header
- never translate the running header, never leave it in layout.body, and never duplicate it elsewhere in layout
- title: translated standalone title or section heading, empty string if none
- body: main translated content with paragraph and line breaks preserved
- notes: array of translated footnotes, endnotes, marginal notes, or translator notes from this segment
- footer: translated or copied page footer/page number, empty string if none
- translatedText must combine translated <target_segment> content plus only the approved boundary handoff into readable fallback text with visible line breaks.
- translatedText and layout.body must end after the completed boundary sentence, never after additional next-page content

Formatting rules for translatedText:
- Preserve title lines, headings, paragraph breaks, numbered lists, stanza breaks, and visible line breaks from the source as much as possible.
- Do not translate running headers at the top of a page. They are usually just the book, chapter, or section name; copy them exactly as source text.
- If a source line is a standalone title or heading in the body, keep it as a standalone line and do not add extra blank lines around it.
- Do not collapse the passage into one paragraph.
- Preserve footnote markers, footer lines, page-like short lines, and deliberate indentation when they are semantically useful.
- Return newline characters inside the JSON string, not HTML.

Source language hint: ${segment.sourceLanguage}
<boundary_handoff source="next_page_opening" output_policy="append_once">
${boundaryHandoffSourceText || '(none)'}
</boundary_handoff>

<target_segment index="${segment.index + 1}" label="${segment.label || `Segment ${segment.index + 1}`}">
${targetSourceText}
</target_segment>

Final boundary audit before returning JSON:
1. If <boundary_handoff> is present, finish the target's final sentence with it exactly once.
2. Verify consumedNextSourceText exactly matches <boundary_handoff> or is empty when no handoff is present.
3. Ensure no consumed prefix is translated more than once in this response.
4. Place a running header only in layout.header and exclude it from consumedNextSourceText.`,
      },
    ],
    undefined,
    `translate segment ${segment.index + 1}`,
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Translation request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Translation response did not include message content.');
  }

  const parsed = parseJsonContent(content);
  const translatedText = removeUntranslatedHandoff(parsed.translatedText, boundaryHandoffSourceText);
  const layout = parsed.layout
    ? {
        ...parsed.layout,
        body: removeUntranslatedHandoff(parsed.layout.body, boundaryHandoffSourceText),
      }
    : parsed.layout;

  return {
    ...parsed,
    translatedText,
    layout,
    consumedNextSourceText: boundaryHandoffSourceText,
  };
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
    'provider test',
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
    `note response segment ${segment.index + 1}`,
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

export const converseWithReadingAgent = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  segment: SourceSegment,
  translatedText: string,
  motherLanguage: string,
  settings: LlmSettings,
) => {
  if (!settings.endpoint.trim() || !settings.apiKey.trim() || !settings.model.trim()) {
    throw new Error('Endpoint, API key, and model are required before starting a conversation.');
  }

  const response = await postChatCompletion(
    { ...settings, useJsonMode: false },
    [
      {
        role: 'system',
        content: `You are Genie, LuminaBook's thoughtful reading companion. Help the reader stay close to the text. Be concise, curious, and specific. Explain language or context when useful, preserve ambiguity, and ask at most one productive follow-up question. Reply in the reader's mother language unless they ask otherwise.\n\nReader mother language: ${motherLanguage}\n\nCurrent original passage:\n${segment.sourceText}\n\nCurrent translation:\n${translatedText || '(not translated yet)'}`,
      },
      ...messages.slice(-10),
    ],
    900,
    `reading agent segment ${segment.index + 1}`,
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Reading companion failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error('Reading companion did not include text content.');
  }

  return content;
};
