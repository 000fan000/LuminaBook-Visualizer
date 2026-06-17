export interface UploadedBook {
  id: string;
  title: string;
  author?: string;
  fileName: string;
  fileType: 'txt' | 'pdf' | 'epub';
  text: string;
  sourceUrl?: string;
  sourceData?: ArrayBuffer;
  pageCount?: number;
  segments: SourceSegment[];
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
}

export interface TranslatedSegment extends SourceSegment {
  translatedText: string;
  commentary: string;
  keyTerms: KeyTerm[];
  reflectionPrompt: string;
}

export interface KeyTerm {
  term: string;
  explanation: string;
}

export interface LlmSettings {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
  useJsonMode: boolean;
  systemPrompt: string;
}

export interface TranslationResult {
  translatedText: string;
  commentary: string;
  keyTerms: KeyTerm[];
  reflectionPrompt: string;
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
