export interface BookMetadata {
  title: string;
  author?: string;
  publicationYear?: number;
  country?: string;
  language?: string;
  publisher?: string;
  tags?: string[];
  description?: string;
}

export interface UploadedBook extends BookMetadata {
  id: string;
  fileName: string;
  fileType: 'txt' | 'pdf' | 'epub';
  text: string;
  sourceUrl?: string;
  sourceData?: ArrayBuffer;
  pageCount?: number;
  segments: SourceSegment[];
  toc?: TocEntry[];
}

export interface TocEntry {
  id: string;
  title: string;
  level: number;
  segmentIndex?: number;
  pageNumber?: number;
  href?: string;
}

export interface SourceSegment {
  id: string;
  index: number;
  sourceText: string;
  sourceLanguage: string;
  footnotes: string[];
  label?: string;
  firstPage?: number;
  lastPage?: number;
  href?: string;
}

export interface TranslatedSegment extends SourceSegment {
  translatedText: string;
  layout?: TranslationLayout;
  commentary: string;
  pageGuide?: string;
  keyTerms: KeyTerm[];
  reflectionPrompt: string;
  annotations: LlmAnnotation[];
}

export interface KeyTerm {
  term: string;
  explanation: string;
}

export type LlmAnnotationKind = 'term' | 'context' | 'translation' | 'reflection';

export interface LlmAnnotation {
  sourceText: string;
  title: string;
  body: string;
  kind: LlmAnnotationKind;
}

export interface LlmSettings {
  profileId?: string;
  profileName?: string;
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
  temperature: number;
  useJsonMode: boolean;
  requestTimeoutMs: number;
  systemPrompt: string;
}

export interface LlmProfile extends LlmSettings {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface TranslationResult {
  translatedText: string;
  layout?: TranslationLayout;
  commentary: string;
  pageGuide: string;
  keyTerms: KeyTerm[];
  reflectionPrompt: string;
  annotations: LlmAnnotation[];
}

export interface TranslationLayout {
  header?: string;
  title?: string;
  body: string;
  notes?: string[];
  footer?: string;
}

export interface Bookmark {
  id: string;
  bookId: string;
  bookTitle: string;
  segmentIndex: number;
  label: string;
  createdAt: string;
}

export interface Highlight {
  id: string;
  bookId: string;
  bookTitle: string;
  segmentId: string;
  segmentIndex: number;
  pageSide: 'original' | 'translation';
  text: string;
  createdAt: string;
}

export interface ReadingProgress {
  bookId: string;
  bookTitle: string;
  segmentIndex: number;
  updatedAt: string;
}

export interface ReaderNote {
  id: string;
  bookId: string;
  bookTitle: string;
  segmentId: string;
  segmentIndex: number;
  body: string;
  llmResponse?: string;
  updatedAt: string;
}

export interface KnowledgeCard {
  id: string;
  bookId: string;
  bookTitle: string;
  segmentId: string;
  segmentIndex: number;
  pageSide: 'original' | 'translation';
  excerpt: string;
  createdAt: string;
}

export interface LlmEvaluationRecord {
  id: string;
  createdAt: string;
  localTime: string;
  profileId: string;
  profileName: string;
  requestName: string;
  attempt: string;
  provider: string;
  endpoint: string;
  method: string;
  model: string;
  temperature: number;
  maxTokens: number | null;
  useJsonMode: boolean;
  timeoutMs: number;
  ok: boolean;
  status: number | null;
  statusText: string;
  elapsedMs: number;
  elapsedSeconds: number;
  timedOut: boolean;
  promptMessages: number;
  inputCharacters: number;
  inputWords: number;
  outputCharacters: number;
  outputWords: number;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  requestCharacters: number;
  responseCharacters: number;
  requestBody: string;
  responseBody: string;
  responseContent: string;
  errorMessage: string;
  qualityScore: string;
  qualityNotes: string;
}
