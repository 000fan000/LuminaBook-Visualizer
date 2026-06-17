import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bookmark as BookmarkIcon,
  BookOpen,
  Check,
  FileText,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  KeyRound,
  Languages,
  Library,
  Loader2,
  Play,
  Plus,
  Settings2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { parseBookFile } from './services/bookIngestion';
import { loadBooksFromLibrary, saveBookToLibrary } from './services/libraryStorage';
import { PROVIDER_PRESETS, respondToReaderNote, testLlmSettings, translateSegment } from './services/openaiTranslation';
import { renderPdfPageToCanvas } from './services/pdfRenderer';
import {
  Bookmark,
  Highlight,
  KnowledgeCard,
  LlmSettings,
  ReaderNote,
  ReadingProgress,
  TranslatedSegment,
  UploadedBook,
} from './types';

const MOTHER_LANGUAGES = [
  'English',
  '中文',
  'Español',
  'Français',
  'Deutsch',
  '日本語',
  '한국어',
  'العربية',
  'Português',
  'Русский',
];

const DEFAULT_SYSTEM_PROMPT = `You are LuminaBook, a careful bilingual great-books reading companion.

Translate faithfully into the reader's mother language while preserving interpretive ambiguity.
Explain what may be lost in translation, especially key terms, metaphors, grammar, historical context, and hermeneutic stakes.
Do not simplify away difficulty. Help the reader compare source and translation reflectively and proactively.`;

const DEFAULT_SETTINGS: LlmSettings = {
  provider: 'openai',
  endpoint: 'https://api.openai.com',
  apiKey: '',
  model: 'gpt-4.1-mini',
  useJsonMode: true,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

const STORAGE_KEYS = {
  bookmarks: 'luminabook.bookmarks',
  highlights: 'luminabook.highlights',
  cards: 'luminabook.knowledgeCards',
  notes: 'luminabook.notes',
  progress: 'luminabook.progress',
  readingTheme: 'luminabook.readingTheme',
  customThemes: 'luminabook.customReadingThemes',
};

type TextAlignment = 'left' | 'center' | 'justify';
type TextFont = 'serif' | 'sans' | 'mono';

interface ReadingTheme {
  id: string;
  name: string;
  font: TextFont;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  textAlign: TextAlignment;
  background: string;
  textColor: string;
}

const DEFAULT_READING_THEMES: ReadingTheme[] = [
  {
    id: 'classic',
    name: 'Classic',
    font: 'serif',
    fontSize: 18,
    lineHeight: 1.85,
    paragraphSpacing: 16,
    textAlign: 'left',
    background: '#fffdf8',
    textColor: '#1c1917',
  },
  {
    id: 'paper',
    name: 'Paper',
    font: 'serif',
    fontSize: 19,
    lineHeight: 1.95,
    paragraphSpacing: 18,
    textAlign: 'justify',
    background: '#f7f1e3',
    textColor: '#292524',
  },
  {
    id: 'focus',
    name: 'Focus',
    font: 'sans',
    fontSize: 17,
    lineHeight: 1.75,
    paragraphSpacing: 14,
    textAlign: 'left',
    background: '#f8fafc',
    textColor: '#111827',
  },
  {
    id: 'night',
    name: 'Night',
    font: 'serif',
    fontSize: 18,
    lineHeight: 1.9,
    paragraphSpacing: 16,
    textAlign: 'left',
    background: '#1f1d1b',
    textColor: '#f5efe6',
  },
];

const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const belongsToBook = <T extends { bookId?: string; bookTitle: string }>(item: T, targetBook: UploadedBook) =>
  item.bookId ? item.bookId === targetBook.id : item.bookTitle === targetBook.title;

const App: React.FC = () => {
  const [view, setView] = useState<'library' | 'reader'>('library');
  const [books, setBooks] = useState<UploadedBook[]>([]);
  const [activeBookId, setActiveBookId] = useState('');
  const [motherLanguage, setMotherLanguage] = useState('English');
  const [settings, setSettings] = useState<LlmSettings>(DEFAULT_SETTINGS);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [translatedSegmentsByBook, setTranslatedSegmentsByBook] = useState<Record<string, Record<string, TranslatedSegment>>>({});
  const [rightPaneMode, setRightPaneMode] = useState<'translation' | 'notes'>('translation');
  const [hoveredNoteSourceText, setHoveredNoteSourceText] = useState('');
  const [customReadingThemes, setCustomReadingThemes] = useState<ReadingTheme[]>(() =>
    readStorage<ReadingTheme[]>(STORAGE_KEYS.customThemes, []),
  );
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>(() =>
    readStorage<ReadingTheme>(STORAGE_KEYS.readingTheme, DEFAULT_READING_THEMES[0]),
  );
  const [isParsing, setIsParsing] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isRespondingToNote, setIsRespondingToNote] = useState(false);
  const [isLibraryLoading, setIsLibraryLoading] = useState(true);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [providerStatus, setProviderStatus] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => readStorage<Bookmark[]>(STORAGE_KEYS.bookmarks, []));
  const [highlights, setHighlights] = useState<Highlight[]>(() => readStorage<Highlight[]>(STORAGE_KEYS.highlights, []));
  const [knowledgeCards, setKnowledgeCards] = useState<KnowledgeCard[]>(() =>
    readStorage<KnowledgeCard[]>(STORAGE_KEYS.cards, []),
  );
  const [notes, setNotes] = useState<ReaderNote[]>(() => readStorage<ReaderNote[]>(STORAGE_KEYS.notes, []));
  const [readingProgress, setReadingProgress] = useState<ReadingProgress[]>(() =>
    readStorage<ReadingProgress[]>(STORAGE_KEYS.progress, []),
  );
  const booksRef = useRef<UploadedBook[]>([]);

  const book = books.find((item) => item.id === activeBookId) || null;
  const activeSegment = book?.segments[activeSegmentIndex] || null;
  const translatedSegments = book ? translatedSegmentsByBook[book.id] || {} : {};
  const activeTranslation = activeSegment ? translatedSegments[activeSegment.id] : null;
  const translatedCount = useMemo(() => Object.keys(translatedSegments).length, [translatedSegments]);
  const progress = book ? Math.round((translatedCount / book.segments.length) * 100) : 0;
  const isBookmarked = Boolean(
    book && bookmarks.some((bookmark) => belongsToBook(bookmark, book) && bookmark.segmentIndex === activeSegmentIndex),
  );
  const activeHighlights = useMemo(
    () =>
      book && activeSegment
        ? highlights.filter((highlight) => belongsToBook(highlight, book) && highlight.segmentId === activeSegment.id)
        : [],
    [book, activeSegment, highlights],
  );
  const activeKnowledgeCards = useMemo(
    () =>
      book && activeSegment
        ? knowledgeCards.filter((card) => belongsToBook(card, book) && card.segmentId === activeSegment.id)
        : [],
    [book, activeSegment, knowledgeCards],
  );
  const activeNote = useMemo(
    () =>
      book && activeSegment
        ? notes.find((note) => belongsToBook(note, book) && note.segmentId === activeSegment.id) || null
        : null,
    [book, activeSegment, notes],
  );

  const updateSettings = <K extends keyof LlmSettings>(key: K, value: LlmSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const readingThemes = useMemo(() => [...DEFAULT_READING_THEMES, ...customReadingThemes], [customReadingThemes]);

  const updateReadingTheme = <K extends keyof ReadingTheme>(key: K, value: ReadingTheme[K]) => {
    setReadingTheme((current) => ({
      ...current,
      id: 'custom-draft',
      name: current.id === 'custom-draft' ? current.name : 'Custom',
      [key]: value,
    }));
  };

  const applyReadingTheme = (themeId: string) => {
    const theme = readingThemes.find((item) => item.id === themeId);

    if (theme) {
      setReadingTheme(theme);
    }
  };

  const saveCurrentReadingTheme = () => {
    const next: ReadingTheme = {
      ...readingTheme,
      id: `custom-${Date.now()}`,
      name: `Theme ${customReadingThemes.length + 1}`,
    };

    setCustomReadingThemes((current) => [...current, next].slice(-8));
    setReadingTheme(next);
    setStatusMessage(`${next.name} saved.`);
  };

  const applyProvider = (providerId: string) => {
    const preset = PROVIDER_PRESETS.find((provider) => provider.id === providerId);

    if (!preset) {
      updateSettings('provider', providerId);
      return;
    }

    setSettings((current) => ({
      ...current,
      provider: preset.id,
      endpoint: preset.endpoint,
      model: preset.models[0],
      useJsonMode: preset.useJsonMode,
    }));
    setProviderStatus('');
  };

  const testProvider = async () => {
    setIsTestingProvider(true);
    setProviderStatus('');
    setErrorMessage('');

    try {
      const result = await testLlmSettings(settings);
      setProviderStatus(`Available: ${result}`);
    } catch (error) {
      setProviderStatus('');
      setErrorMessage(error instanceof Error ? error.message : 'Provider test failed.');
    } finally {
      setIsTestingProvider(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const restoreLibrary = async () => {
      setIsLibraryLoading(true);

      const storedBooks = await loadBooksFromLibrary();

      if (!cancelled) {
        setBooks((current) => {
          const currentIds = new Set(current.map((item) => item.id));
          return [...current, ...storedBooks.filter((item) => !currentIds.has(item.id))];
        });
        setStatusMessage(storedBooks.length ? `${storedBooks.length} saved book${storedBooks.length > 1 ? 's' : ''} restored.` : '');
        setIsLibraryLoading(false);
      }
    };

    restoreLibrary();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => {
      booksRef.current = books;
    },
    [books],
  );

  useEffect(
    () => () => {
      for (const item of booksRef.current) {
        if (item.sourceUrl) {
          URL.revokeObjectURL(item.sourceUrl);
        }
      }
    },
    [],
  );

  useEffect(() => {
    writeStorage(STORAGE_KEYS.bookmarks, bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.highlights, highlights);
  }, [highlights]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.cards, knowledgeCards);
  }, [knowledgeCards]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.notes, notes);
  }, [notes]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.progress, readingProgress);
  }, [readingProgress]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.readingTheme, readingTheme);
  }, [readingTheme]);

  useEffect(() => {
    writeStorage(STORAGE_KEYS.customThemes, customReadingThemes);
  }, [customReadingThemes]);

  useEffect(() => {
    if (!book) {
      return;
    }

    setReadingProgress((current) => {
      const next: ReadingProgress = {
        bookId: book.id,
        bookTitle: book.title,
        segmentIndex: activeSegmentIndex,
        updatedAt: new Date().toISOString(),
      };
      const existing = current.filter((item) => !belongsToBook(item, book));
      return [...existing, next].slice(-30);
    });
  }, [book, activeSegmentIndex]);

  const handleFileUpload = async (files: FileList | File[] | null) => {
    const uploads = Array.from(files || []);

    if (!uploads.length) {
      return;
    }

    setIsParsing(true);
    setErrorMessage('');
    setStatusMessage(uploads.length > 1 ? `Extracting ${uploads.length} books...` : 'Extracting text from book...');

    try {
      const parsedBooks: UploadedBook[] = [];

      for (const file of uploads) {
        setStatusMessage(`Extracting ${file.name}...`);
        const parsed = await parseBookFile(file);
        await saveBookToLibrary(parsed, file);
        parsedBooks.push(parsed);
      }

      const firstParsed = parsedBooks[0];
      const savedProgress = readingProgress.find((item) => belongsToBook(item, firstParsed));

      setBooks((current) => {
        const incomingIds = new Set(parsedBooks.map((item) => item.id));

        for (const existing of current) {
          if (incomingIds.has(existing.id) && existing.sourceUrl) {
            URL.revokeObjectURL(existing.sourceUrl);
          }
        }

        return [...parsedBooks, ...current.filter((item) => !incomingIds.has(item.id))];
      });
      setActiveBookId(firstParsed.id);
      setActiveSegmentIndex(
        savedProgress ? Math.min(Math.max(savedProgress.segmentIndex, 0), firstParsed.segments.length - 1) : 0,
      );
      setStatusMessage(
        parsedBooks.length > 1
          ? `Ready: ${parsedBooks.length} books added to the shelf.`
          : `Ready: ${firstParsed.segments.length} reading pages extracted.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not parse the selected book.');
      setStatusMessage('');
    } finally {
      setIsParsing(false);
    }
  };

  const translateCurrent = async () => {
    if (!activeSegment) {
      return;
    }

    setIsTranslating(true);
    setErrorMessage('');
    setStatusMessage(`Translating ${activeSegment.label || `page ${activeSegment.index + 1}`}...`);

    try {
      const result = await translateSegment(activeSegment, motherLanguage, settings);
      setTranslatedSegmentsByBook((current) => ({
        ...current,
        [book.id]: {
          ...(current[book.id] || {}),
          [activeSegment.id]: {
            ...activeSegment,
            translatedText: result.translatedText,
            commentary: result.commentary,
            keyTerms: result.keyTerms || [],
            reflectionPrompt: result.reflectionPrompt,
          },
        },
      }));
      setStatusMessage(`${activeSegment.label || `Page ${activeSegment.index + 1}`} translated.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Translation failed.');
      setStatusMessage('');
    } finally {
      setIsTranslating(false);
    }
  };

  const translateNext = async () => {
    if (!book) {
      return;
    }

    setIsTranslating(true);
    setErrorMessage('');

    const start = activeSegmentIndex;
    const pending = book.segments.slice(start, start + 3).filter((segment) => !translatedSegments[segment.id]);

    if (!pending.length) {
      setStatusMessage('The next visible pages are already translated.');
      setIsTranslating(false);
      return;
    }

    try {
      for (const segment of pending) {
        setStatusMessage(`Translating ${segment.label || `page ${segment.index + 1}`}...`);
        const result = await translateSegment(segment, motherLanguage, settings);
        setTranslatedSegmentsByBook((current) => ({
          ...current,
          [book.id]: {
            ...(current[book.id] || {}),
            [segment.id]: {
              ...segment,
              translatedText: result.translatedText,
              commentary: result.commentary,
              keyTerms: result.keyTerms || [],
              reflectionPrompt: result.reflectionPrompt,
            },
          },
        }));
      }
      setStatusMessage(`Translated ${pending.length} page group${pending.length > 1 ? 's' : ''}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Batch translation failed.');
      setStatusMessage('');
    } finally {
      setIsTranslating(false);
    }
  };

  const moveSegment = (direction: -1 | 1) => {
    if (!book) {
      return;
    }

    setActiveSegmentIndex((current) => Math.min(Math.max(current + direction, 0), book.segments.length - 1));
  };

  const toggleBookmark = () => {
    if (!book || !activeSegment) {
      return;
    }

    setBookmarks((current) => {
      const exists = current.some(
        (bookmark) => belongsToBook(bookmark, book) && bookmark.segmentIndex === activeSegmentIndex,
      );

      if (exists) {
        return current.filter(
          (bookmark) => !(belongsToBook(bookmark, book) && bookmark.segmentIndex === activeSegmentIndex),
        );
      }

      return [
        ...current,
        {
          id: `${book.id}-${activeSegmentIndex}-${Date.now()}`,
          bookId: book.id,
          bookTitle: book.title,
          segmentIndex: activeSegmentIndex,
          label: activeSegment.label || `Page ${activeSegmentIndex + 1}`,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  };

  const getSelectedReaderText = () => window.getSelection()?.toString().replace(/\s+\n/g, '\n').trim() || '';

  const addHighlight = (pageSide: Highlight['pageSide']) => {
    if (!book || !activeSegment) {
      return;
    }

    const selection = getSelectedReaderText();

    if (!selection) {
      setStatusMessage('Select text in the page first, then add a highlight.');
      return;
    }

    setHighlights((current) => [
      ...current,
      {
        id: `${book.id}-${activeSegment.id}-${Date.now()}`,
        bookId: book.id,
        bookTitle: book.title,
        segmentId: activeSegment.id,
        segmentIndex: activeSegmentIndex,
        pageSide,
        text: selection.slice(0, 500),
        createdAt: new Date().toISOString(),
      },
    ]);
    window.getSelection()?.removeAllRanges();
    setStatusMessage('Highlight saved.');
  };

  const createKnowledgeCard = (pageSide: Highlight['pageSide']) => {
    if (!book || !activeSegment) {
      return;
    }

    const selection = getSelectedReaderText();

    if (!selection) {
      setStatusMessage('Select text in the page first, then create a knowledge card.');
      return;
    }

    setKnowledgeCards((current) => [
      ...current,
      {
        id: `${book.id}-${activeSegment.id}-card-${Date.now()}`,
        bookId: book.id,
        bookTitle: book.title,
        segmentId: activeSegment.id,
        segmentIndex: activeSegmentIndex,
        pageSide,
        excerpt: selection.slice(0, 1000),
        createdAt: new Date().toISOString(),
      },
    ]);
    window.getSelection()?.removeAllRanges();
    setStatusMessage('Knowledge card saved.');
  };

  const goToBookmark = (bookmark: Bookmark) => {
    const targetBook = books.find((item) => belongsToBook(bookmark, item));

    if (!targetBook) {
      return;
    }

    setActiveBookId(targetBook.id);
    setActiveSegmentIndex(Math.min(Math.max(bookmark.segmentIndex, 0), targetBook.segments.length - 1));
    setView('reader');
  };

  const openBook = (bookId: string) => {
    const targetBook = books.find((item) => item.id === bookId);

    if (!targetBook) {
      return;
    }

    const savedProgress = readingProgress.find((item) => belongsToBook(item, targetBook));
    setActiveBookId(bookId);
    setActiveSegmentIndex(
      savedProgress ? Math.min(Math.max(savedProgress.segmentIndex, 0), targetBook.segments.length - 1) : 0,
    );
    setView('reader');
  };

  const updateActiveNote = (body: string) => {
    if (!book || !activeSegment) {
      return;
    }

    setNotes((current) => {
      const existing = current.find((note) => belongsToBook(note, book) && note.segmentId === activeSegment.id);
      const next: ReaderNote = {
        id: existing?.id || `${book.id}-${activeSegment.id}-${Date.now()}`,
        bookId: book.id,
        bookTitle: book.title,
        segmentId: activeSegment.id,
        segmentIndex: activeSegmentIndex,
        body,
        llmResponse: existing?.llmResponse,
        updatedAt: new Date().toISOString(),
      };

      return [...current.filter((note) => note.id !== next.id), next];
    });
  };

  const respondToNote = async () => {
    if (!book || !activeSegment || !activeNote?.body.trim()) {
      setStatusMessage('Write a note first.');
      return;
    }

    setIsRespondingToNote(true);
    setErrorMessage('');

    try {
      const response = await respondToReaderNote(
        activeNote.body,
        activeSegment,
        activeTranslation?.translatedText || '',
        motherLanguage,
        settings,
      );
      setNotes((current) =>
        current.map((note) =>
          note.id === activeNote.id ? { ...note, llmResponse: response, updatedAt: new Date().toISOString() } : note,
        ),
      );
      setStatusMessage('LLM note response saved.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Note response failed.');
      setStatusMessage('');
    } finally {
      setIsRespondingToNote(false);
    }
  };

  if (view === 'reader' && book && activeSegment) {
    return (
      <ReaderView
        book={book}
        motherLanguage={motherLanguage}
        activeSegmentIndex={activeSegmentIndex}
        activeSegment={activeSegment}
        activeTranslation={activeTranslation || null}
        readingTheme={readingTheme}
        readingThemes={readingThemes}
        progress={progress}
        isTranslating={isTranslating}
        statusMessage={statusMessage}
        errorMessage={errorMessage}
        onBack={() => setView('library')}
        onPrevious={() => moveSegment(-1)}
        onNext={() => moveSegment(1)}
        onTranslateCurrent={translateCurrent}
        onTranslateNext={translateNext}
        isBookmarked={isBookmarked}
        highlights={activeHighlights}
        knowledgeCards={activeKnowledgeCards}
        onToggleBookmark={toggleBookmark}
        onAddHighlight={addHighlight}
        onCreateKnowledgeCard={createKnowledgeCard}
        rightPaneMode={rightPaneMode}
        onRightPaneModeChange={setRightPaneMode}
        hoveredNoteSourceText={hoveredNoteSourceText}
        onHoverNoteSource={setHoveredNoteSourceText}
        onThemeChange={updateReadingTheme}
        onApplyTheme={applyReadingTheme}
        onSaveTheme={saveCurrentReadingTheme}
        note={activeNote}
        onNoteChange={updateActiveNote}
        onRespondToNote={respondToNote}
        isRespondingToNote={isRespondingToNote}
      />
    );
  }

  return (
    <LibraryView
      books={books}
      motherLanguage={motherLanguage}
      settings={settings}
      translatedSegmentsByBook={translatedSegmentsByBook}
      isParsing={isParsing}
      isLibraryLoading={isLibraryLoading}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      onFileUpload={handleFileUpload}
      onMotherLanguageChange={setMotherLanguage}
      onSettingsChange={updateSettings}
      onProviderChange={applyProvider}
      onOpenBook={openBook}
      bookmarks={bookmarks}
      onOpenBookmark={goToBookmark}
      isConfigOpen={isConfigOpen}
      isTestingProvider={isTestingProvider}
      providerStatus={providerStatus}
      onOpenConfig={() => setIsConfigOpen(true)}
      onCloseConfig={() => setIsConfigOpen(false)}
      onTestProvider={testProvider}
    />
  );
};

interface LibraryViewProps {
  books: UploadedBook[];
  motherLanguage: string;
  settings: LlmSettings;
  translatedSegmentsByBook: Record<string, Record<string, TranslatedSegment>>;
  isParsing: boolean;
  isLibraryLoading: boolean;
  statusMessage: string;
  errorMessage: string;
  onFileUpload: (files: FileList | File[] | null) => void;
  onMotherLanguageChange: (language: string) => void;
  onSettingsChange: <K extends keyof LlmSettings>(key: K, value: LlmSettings[K]) => void;
  onProviderChange: (providerId: string) => void;
  onOpenBook: (bookId: string) => void;
  bookmarks: Bookmark[];
  onOpenBookmark: (bookmark: Bookmark) => void;
  isConfigOpen: boolean;
  isTestingProvider: boolean;
  providerStatus: string;
  onOpenConfig: () => void;
  onCloseConfig: () => void;
  onTestProvider: () => void;
}

const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  motherLanguage,
  settings,
  translatedSegmentsByBook,
  isParsing,
  isLibraryLoading,
  statusMessage,
  errorMessage,
  onFileUpload,
  onMotherLanguageChange,
  onSettingsChange,
  onProviderChange,
  onOpenBook,
  bookmarks,
  onOpenBookmark,
  isConfigOpen,
  isTestingProvider,
  providerStatus,
  onOpenConfig,
  onCloseConfig,
  onTestProvider,
}) => (
  <div className="min-h-screen bg-[#f5f1e8] text-stone-950">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-950 text-[#f5f1e8]">
          <Library className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-normal">LuminaBook</h1>
          <p className="text-sm text-stone-600">Your bilingual great-books shelf</p>
        </div>
      </div>
      <button
        onClick={onOpenConfig}
        className="flex h-10 items-center gap-2 rounded-md border border-stone-300 bg-[#fffdf8] px-3 text-sm font-medium text-stone-800 shadow-sm hover:bg-white"
      >
        <Settings2 className="h-4 w-4" />
        Config
      </button>
    </header>

    <main className="mx-auto max-w-7xl px-5 pb-12 pt-6">
      <section>
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-stone-500">Library</p>
          <h2 className="mt-3 text-4xl font-semibold leading-tight tracking-normal md:text-6xl">Choose a book from the shelf.</h2>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-600">
            Upload a source book, keep the original page visible, and generate a facing translation when you read.
          </p>
        </div>

        <div className="mt-10 rounded-md border border-stone-300 bg-[#e8ddca] px-5 py-6 shadow-inner">
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            <UploadCoverTile isParsing={isParsing || isLibraryLoading} onFileUpload={onFileUpload} />
            {books.map((book) => {
              const translatedCount = Object.keys(translatedSegmentsByBook[book.id] || {}).length;
              const progress = Math.round((translatedCount / book.segments.length) * 100);

              return (
                <BookCoverTile
                  key={book.id}
                  book={book}
                  translatedCount={translatedCount}
                  progress={progress}
                  bookmarks={bookmarks.filter((bookmark) => belongsToBook(bookmark, book))}
                  onOpenReader={() => onOpenBook(book.id)}
                  onOpenBookmark={onOpenBookmark}
                />
              );
            })}
          </div>
          {isLibraryLoading && <p className="mt-4 text-sm text-stone-600">Loading saved shelf...</p>}
        </div>

        <StatusMessage statusMessage={statusMessage} errorMessage={errorMessage} />
      </section>
    </main>

    {isConfigOpen && (
      <ConfigDialog
        motherLanguage={motherLanguage}
        settings={settings}
        isTestingProvider={isTestingProvider}
        providerStatus={providerStatus}
        errorMessage={errorMessage}
        onMotherLanguageChange={onMotherLanguageChange}
        onSettingsChange={onSettingsChange}
        onProviderChange={onProviderChange}
        onClose={onCloseConfig}
        onTestProvider={onTestProvider}
      />
    )}
  </div>
);

interface ConfigDialogProps {
  motherLanguage: string;
  settings: LlmSettings;
  isTestingProvider: boolean;
  providerStatus: string;
  errorMessage: string;
  onMotherLanguageChange: (language: string) => void;
  onSettingsChange: <K extends keyof LlmSettings>(key: K, value: LlmSettings[K]) => void;
  onProviderChange: (providerId: string) => void;
  onClose: () => void;
  onTestProvider: () => void;
}

const ConfigDialog: React.FC<ConfigDialogProps> = ({
  motherLanguage,
  settings,
  isTestingProvider,
  providerStatus,
  errorMessage,
  onMotherLanguageChange,
  onSettingsChange,
  onProviderChange,
  onClose,
  onTestProvider,
}) => {
  const selectedProvider = PROVIDER_PRESETS.find((provider) => provider.id === settings.provider) || PROVIDER_PRESETS[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 px-4 py-6 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-md border border-stone-300 bg-[#fffdf8] p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-stone-200 pb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-stone-950 text-[#f5f1e8]">
            <Settings2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">Reading & Translation Config</h2>
            <p className="text-sm text-stone-600">Choose provider, model, endpoint, and prompt.</p>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
            <Languages className="h-4 w-4" />
            Mother Language
          </div>
          <select
            value={motherLanguage}
            onChange={(event) => onMotherLanguageChange(event.target.value)}
            className="h-10 w-full rounded-md border border-stone-300 bg-[#fbf8f1] px-3 text-sm outline-none focus:ring-2 focus:ring-stone-400"
          >
            {MOTHER_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
          <input
            value={motherLanguage}
            onChange={(event) => onMotherLanguageChange(event.target.value)}
            className="h-10 w-full rounded-md border border-stone-300 bg-[#fbf8f1] px-3 text-sm outline-none focus:ring-2 focus:ring-stone-400"
            placeholder="Or type another language"
          />
          </section>

          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-stone-800">
              <Sparkles className="h-4 w-4" />
              Provider
            </div>
            <select
              value={settings.provider}
              onChange={(event) => onProviderChange(event.target.value)}
              className="h-10 w-full rounded-md border border-stone-300 bg-[#fbf8f1] px-3 text-sm outline-none focus:ring-2 focus:ring-stone-400"
            >
              {PROVIDER_PRESETS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
            <select
              value={settings.model}
              onChange={(event) => onSettingsChange('model', event.target.value)}
              className="h-10 w-full rounded-md border border-stone-300 bg-[#fbf8f1] px-3 text-sm outline-none focus:ring-2 focus:ring-stone-400"
            >
              {selectedProvider.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </section>
        </div>

        <section className="mt-6 border-t border-stone-200 pt-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-800">
            <KeyRound className="h-4 w-4" />
            OpenAI-Compatible API
          </div>
          <SettingsField label="Endpoint" value={settings.endpoint} onChange={(value) => onSettingsChange('endpoint', value)} />
          <SettingsField label="API Key" value={settings.apiKey} onChange={(value) => onSettingsChange('apiKey', value)} type="password" />
          <SettingsField label="Model" value={settings.model} onChange={(value) => onSettingsChange('model', value)} />
          <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={settings.useJsonMode}
              onChange={(event) => onSettingsChange('useJsonMode', event.target.checked)}
              className="h-4 w-4 accent-stone-950"
            />
            Request JSON mode when provider supports it
          </label>
          <label className="mt-3 block">
            <span className="text-xs font-medium text-stone-600">System Prompt</span>
            <textarea
              value={settings.systemPrompt}
              onChange={(event) => onSettingsChange('systemPrompt', event.target.value)}
              className="mt-1 h-40 w-full resize-none rounded-md border border-stone-300 bg-[#fbf8f1] p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-stone-400"
            />
          </label>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={onTestProvider}
              disabled={isTestingProvider}
              className="flex h-10 items-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-medium text-[#fffdf8] hover:bg-stone-800 disabled:cursor-wait disabled:opacity-50"
            >
              {isTestingProvider ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Test
            </button>
            {providerStatus && <span className="text-sm text-emerald-700">{providerStatus}</span>}
          </div>
        </section>

        <StatusMessage statusMessage="" errorMessage={errorMessage} />
      </section>
    </div>
  );
};

interface ReaderViewProps {
  book: UploadedBook;
  motherLanguage: string;
  activeSegmentIndex: number;
  activeSegment: UploadedBook['segments'][number];
  activeTranslation: TranslatedSegment | null;
  readingTheme: ReadingTheme;
  readingThemes: ReadingTheme[];
  progress: number;
  isTranslating: boolean;
  statusMessage: string;
  errorMessage: string;
  onBack: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onTranslateCurrent: () => void;
  onTranslateNext: () => void;
  isBookmarked: boolean;
  highlights: Highlight[];
  knowledgeCards: KnowledgeCard[];
  onToggleBookmark: () => void;
  onAddHighlight: (pageSide: Highlight['pageSide']) => void;
  onCreateKnowledgeCard: (pageSide: Highlight['pageSide']) => void;
  rightPaneMode: 'translation' | 'notes';
  onRightPaneModeChange: (mode: 'translation' | 'notes') => void;
  hoveredNoteSourceText: string;
  onHoverNoteSource: (text: string) => void;
  onThemeChange: <K extends keyof ReadingTheme>(key: K, value: ReadingTheme[K]) => void;
  onApplyTheme: (themeId: string) => void;
  onSaveTheme: () => void;
  note: ReaderNote | null;
  onNoteChange: (body: string) => void;
  onRespondToNote: () => void;
  isRespondingToNote: boolean;
}

const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  motherLanguage,
  activeSegmentIndex,
  activeSegment,
  activeTranslation,
  readingTheme,
  readingThemes,
  progress,
  isTranslating,
  statusMessage,
  errorMessage,
  onBack,
  onPrevious,
  onNext,
  onTranslateCurrent,
  onTranslateNext,
  isBookmarked,
  highlights,
  knowledgeCards,
  onToggleBookmark,
  onAddHighlight,
  onCreateKnowledgeCard,
  rightPaneMode,
  onRightPaneModeChange,
  hoveredNoteSourceText,
  onHoverNoteSource,
  onThemeChange,
  onApplyTheme,
  onSaveTheme,
  note,
  onNoteChange,
  onRespondToNote,
  isRespondingToNote,
}) => (
  <div className="flex min-h-screen flex-col bg-[#f2eadc] text-stone-950">
    <header className="sticky top-0 z-20 border-b border-stone-300/70 bg-[#f2eadc]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
        <button onClick={onBack} className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-stone-700 hover:bg-stone-200/60">
          <ArrowLeft className="h-4 w-4" />
          Library
        </button>
        <div className="min-w-0 px-4 text-center">
          <p className="truncate text-sm font-semibold">{book.title}</p>
          <p className="text-xs text-stone-500">{activeSegment.label || `Page ${activeSegmentIndex + 1}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleBookmark}
            className={`flex h-9 w-9 items-center justify-center rounded-md border ${
              isBookmarked ? 'border-amber-400 bg-amber-100 text-amber-800' : 'border-stone-300 bg-[#fffdf8] text-stone-700'
            }`}
            title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
          >
            <BookmarkIcon className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={onTranslateCurrent}
            disabled={isTranslating}
            className="flex h-9 items-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-medium text-[#fffdf8] hover:bg-stone-800 disabled:cursor-wait disabled:opacity-50"
          >
            {isTranslating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Translate
          </button>
        </div>
      </div>
    </header>

    <main className="flex-1 px-3 py-5 md:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid min-h-[calc(100vh-150px)] gap-4 lg:grid-cols-2">
          <BookPage
            eyebrow="Original"
            title={activeSegment.sourceLanguage}
            body={activeSegment.sourceText}
            footnotes={activeSegment.footnotes}
            pageNumber={activeSegmentIndex * 2 + 1}
            pdfUrl={book.fileType === 'pdf' ? book.sourceUrl : undefined}
            pdfData={book.fileType === 'pdf' ? book.sourceData : undefined}
            pdfPage={activeSegment.firstPage}
            highlights={highlights.filter((highlight) => highlight.pageSide === 'original')}
            knowledgeCards={knowledgeCards.filter((card) => card.pageSide === 'original')}
            hoverHighlightText={hoveredNoteSourceText}
            onAddHighlight={() => onAddHighlight('original')}
            onCreateKnowledgeCard={() => onCreateKnowledgeCard('original')}
          />
          <RightReaderPane
            motherLanguage={motherLanguage}
            activeTranslation={activeTranslation}
            sourceText={activeSegment.sourceText}
            readingTheme={readingTheme}
            readingThemes={readingThemes}
            mode={rightPaneMode}
            note={note}
            pageNumber={activeSegmentIndex * 2 + 2}
            highlights={highlights.filter((highlight) => highlight.pageSide === 'translation')}
            knowledgeCards={knowledgeCards.filter((card) => card.pageSide === 'translation')}
            onModeChange={onRightPaneModeChange}
            onHoverNoteSource={onHoverNoteSource}
            onThemeChange={onThemeChange}
            onApplyTheme={onApplyTheme}
            onSaveTheme={onSaveTheme}
            onAddHighlight={() => onAddHighlight('translation')}
            onCreateKnowledgeCard={() => onCreateKnowledgeCard('translation')}
            onNoteChange={onNoteChange}
            onRespondToNote={onRespondToNote}
            isRespondingToNote={isRespondingToNote}
          />
        </div>
      </div>
    </main>

    <footer className="border-t border-stone-300/70 bg-[#f2eadc]/95 px-4 py-3 backdrop-blur md:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onPrevious}
            disabled={activeSegmentIndex === 0}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-[#fffdf8] text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onNext}
            disabled={activeSegmentIndex === book.segments.length - 1}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-[#fffdf8] text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-[180px] flex-1 md:max-w-md">
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-300">
            <div className="h-full rounded-full bg-stone-950" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 text-center text-xs text-stone-500">
            {activeSegmentIndex + 1} / {book.segments.length} · {progress}% translated
          </p>
        </div>

        <button
          onClick={onTranslateNext}
          disabled={isTranslating}
          className="flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-[#fffdf8] px-3 text-sm font-medium text-stone-800 hover:bg-white disabled:cursor-wait disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Next 3
        </button>
      </div>
      <div className="mx-auto mt-2 max-w-7xl">
        <StatusMessage statusMessage={statusMessage} errorMessage={errorMessage} compact />
      </div>
    </footer>
  </div>
);

interface UploadCoverTileProps {
  isParsing: boolean;
  onFileUpload: (files: FileList | File[] | null) => void;
}

const UploadCoverTile: React.FC<UploadCoverTileProps> = ({ isParsing, onFileUpload }) => (
  <label className="group block cursor-pointer">
    <div className="flex aspect-[2/3] flex-col items-center justify-center rounded-sm border border-dashed border-stone-500 bg-[#d8cab3] p-4 text-center shadow-[6px_8px_0_rgba(80,63,42,0.16)] transition group-hover:-translate-y-1 group-hover:bg-[#e4d7c0]">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fffdf8] text-stone-700 shadow-sm">
        {isParsing ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
      </div>
      <p className="mt-5 text-sm font-semibold text-stone-900">Add Book</p>
      <p className="mt-2 max-w-24 text-xs leading-5 text-stone-600">PDF TXT EPUB</p>
    </div>
    <input
      type="file"
      accept=".txt,.pdf,.epub,application/pdf,text/plain,application/epub+zip"
      multiple
      className="hidden"
      onChange={(event) => {
        onFileUpload(event.target.files || null);
        event.currentTarget.value = '';
      }}
    />
  </label>
);

interface BookCoverTileProps {
  book: UploadedBook | null;
  translatedCount: number;
  progress: number;
  bookmarks: Bookmark[];
  onOpenReader: () => void;
  onOpenBookmark: (bookmark: Bookmark) => void;
}

const BookCoverTile: React.FC<BookCoverTileProps> = ({ book, translatedCount, progress, bookmarks, onOpenReader, onOpenBookmark }) => (
  <article className="group">
    <button
      onClick={onOpenReader}
      disabled={!book}
      className="flex aspect-[2/3] w-full flex-col justify-between overflow-hidden rounded-sm border border-stone-700 bg-stone-900 p-4 text-left text-[#fffdf8] shadow-[6px_8px_0_rgba(80,63,42,0.2)] transition hover:-translate-y-1 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-300">
          {book?.fileType ? book.fileType.toUpperCase() : 'Empty'}
        </p>
        <h3 className="mt-5 max-h-32 overflow-hidden text-xl font-semibold leading-tight">
          {book?.title || 'Upload a book to begin'}
        </h3>
        <p className="mt-3 max-h-10 overflow-hidden text-xs leading-5 text-stone-300">
          {book?.author || book?.fileName || 'Source file'}
        </p>
      </div>
      <div>
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-[#f2eadc]" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-stone-300">
          {book ? `${translatedCount}/${book.segments.length} translated` : 'No active book'}
        </p>
      </div>
    </button>
    {bookmarks.length > 0 && (
      <div className="mt-3 space-y-1">
        {bookmarks.slice(-3).map((bookmark) => (
          <button
            key={bookmark.id}
            onClick={() => onOpenBookmark(bookmark)}
            className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs text-stone-700 hover:bg-[#fffdf8]"
          >
            <BookmarkIcon className="h-3.5 w-3.5 fill-current text-amber-600" />
            <span className="truncate">{bookmark.label}</span>
          </button>
        ))}
      </div>
    )}
  </article>
);

interface BookPageProps {
  eyebrow: string;
  title: string;
  body: string;
  footnotes: string[];
  pageNumber: number;
  pdfUrl?: string;
  pdfData?: ArrayBuffer;
  pdfPage?: number;
  highlights: Highlight[];
  knowledgeCards: KnowledgeCard[];
  hoverHighlightText?: string;
  onAddHighlight: () => void;
  onCreateKnowledgeCard: () => void;
  muted?: boolean;
}

const BookPage: React.FC<BookPageProps> = ({
  eyebrow,
  title,
  body,
  footnotes,
  pageNumber,
  pdfUrl,
  pdfData,
  pdfPage,
  highlights,
  knowledgeCards,
  hoverHighlightText = '',
  onAddHighlight,
  onCreateKnowledgeCard,
  muted,
}) => (
  <article className="flex min-h-[680px] flex-col rounded-sm border border-stone-300 bg-[#fffdf8] px-7 py-6 shadow-[0_18px_60px_rgba(68,54,34,0.13)] md:px-10">
    <div className="mb-6 flex items-center justify-between gap-3 border-b border-stone-200 pb-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{eyebrow}</p>
        <h2 className="mt-1 text-sm font-medium text-stone-700">{title}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAddHighlight}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100"
          title="Highlight selected text"
        >
          <Highlighter className="h-4 w-4" />
        </button>
        <button
          onClick={onCreateKnowledgeCard}
          className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100"
          title="Create knowledge card from selected text"
        >
          <FileText className="h-4 w-4" />
        </button>
        <span className="text-xs text-stone-400">{pageNumber}</span>
      </div>
    </div>

    {pdfUrl ? (
      <div className="flex-1 overflow-auto rounded-sm border border-stone-200 bg-stone-100 p-3">
        {hoverHighlightText && (
          <div className="mb-3 rounded-sm border border-amber-300 bg-amber-100 px-3 py-2 text-sm leading-6 text-amber-950 shadow-sm">
            {hoverHighlightText}
          </div>
        )}
        <PdfCanvasPage source={pdfData || pdfUrl} pageNumber={pdfPage || 1} />
      </div>
    ) : (
      <FormattedReadingText text={body} muted={muted} hoverHighlightText={hoverHighlightText} />
    )}

    <div className="mt-6 min-h-24 border-t border-stone-200 pt-4">
      {highlights.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Highlights</p>
          {highlights.map((highlight) => (
            <p key={highlight.id} className="rounded-sm bg-yellow-100 px-2 py-1 text-xs leading-5 text-stone-700">
              {highlight.text}
            </p>
          ))}
        </div>
      )}
      {knowledgeCards.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Knowledge Cards</p>
          {knowledgeCards.map((card) => (
            <p key={card.id} className="rounded-sm border border-stone-200 bg-white px-2 py-1 text-xs leading-5 text-stone-700">
              {card.excerpt}
            </p>
          ))}
        </div>
      )}
      {footnotes.length ? (
        <ol className="space-y-2 text-xs leading-5 text-stone-600">
          {footnotes.map((note, index) => (
            <li key={`${note}-${index}`} className="grid grid-cols-[24px_1fr] gap-2">
              <span className="text-stone-400">{index + 1}</span>
              <span>{note}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs italic text-stone-400">
          {pdfUrl ? 'Original notes remain visible in the PDF page above.' : 'No footnotes on this page.'}
        </p>
      )}
    </div>
  </article>
);

interface RightReaderPaneProps {
  motherLanguage: string;
  activeTranslation: TranslatedSegment | null;
  sourceText: string;
  readingTheme: ReadingTheme;
  readingThemes: ReadingTheme[];
  mode: 'translation' | 'notes';
  note: ReaderNote | null;
  pageNumber: number;
  highlights: Highlight[];
  knowledgeCards: KnowledgeCard[];
  onModeChange: (mode: 'translation' | 'notes') => void;
  onHoverNoteSource: (text: string) => void;
  onThemeChange: <K extends keyof ReadingTheme>(key: K, value: ReadingTheme[K]) => void;
  onApplyTheme: (themeId: string) => void;
  onSaveTheme: () => void;
  onAddHighlight: () => void;
  onCreateKnowledgeCard: () => void;
  onNoteChange: (body: string) => void;
  onRespondToNote: () => void;
  isRespondingToNote: boolean;
}

const RightReaderPane: React.FC<RightReaderPaneProps> = ({
  motherLanguage,
  activeTranslation,
  sourceText,
  readingTheme,
  readingThemes,
  mode,
  note,
  pageNumber,
  highlights,
  knowledgeCards,
  onModeChange,
  onHoverNoteSource,
  onThemeChange,
  onApplyTheme,
  onSaveTheme,
  onAddHighlight,
  onCreateKnowledgeCard,
  onNoteChange,
  onRespondToNote,
  isRespondingToNote,
}) => {
  const [isFormatOpen, setIsFormatOpen] = useState(false);
  const noteAnchors = useMemo(
    () => buildNoteHoverAnchors(note?.llmResponse || '', sourceText),
    [note?.llmResponse, sourceText],
  );

  return (
    <article
      className="relative flex min-h-[680px] flex-col rounded-sm border border-stone-300 px-7 py-6 shadow-[0_18px_60px_rgba(68,54,34,0.13)] md:px-10"
      style={mode === 'translation' ? { backgroundColor: readingTheme.background, color: readingTheme.textColor } : { backgroundColor: '#fffdf8' }}
    >
    <div className="mb-6 flex items-center justify-between gap-3 border-b border-stone-200 pb-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
          {mode === 'translation' ? `Translation · ${motherLanguage}` : 'Notes'}
        </p>
        <h2 className="mt-1 text-sm font-medium text-stone-700">
          {mode === 'translation' ? (activeTranslation ? 'Generated translation' : 'Waiting for translation') : 'Reader notebook'}
        </h2>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-stone-300 bg-[#f7f3ea] p-1">
          {(['translation', 'notes'] as const).map((item) => (
            <button
              key={item}
              onClick={() => onModeChange(item)}
              className={`h-7 rounded px-2 text-xs font-medium capitalize ${
                mode === item ? 'bg-stone-950 text-white' : 'text-stone-600 hover:bg-stone-200'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        {mode === 'translation' && (
          <>
            <button
              onClick={onAddHighlight}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100"
              title="Highlight selected text"
            >
              <Highlighter className="h-4 w-4" />
            </button>
            <button
              onClick={onCreateKnowledgeCard}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100"
              title="Create knowledge card from selected text"
            >
              <FileText className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsFormatOpen((current) => !current)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-300 text-stone-600 hover:bg-stone-100"
              title="Tune translation text format"
            >
              <BookOpen className="h-4 w-4" />
            </button>
          </>
        )}
        <span className="text-xs text-stone-400">{pageNumber}</span>
      </div>
    </div>

    {mode === 'translation' ? (
      <>
        <FormattedReadingText
          text={activeTranslation?.translatedText || 'Use Translate to create the facing page for this section.'}
          muted={!activeTranslation}
          theme={readingTheme}
        />
        {isFormatOpen && (
          <ReadingThemePopover
            theme={readingTheme}
            themes={readingThemes}
            onThemeChange={onThemeChange}
            onApplyTheme={onApplyTheme}
            onSaveTheme={onSaveTheme}
          />
        )}
        <div className="mt-6 min-h-24 border-t border-stone-200 pt-4">
          {highlights.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Highlights</p>
              {highlights.map((highlight) => (
                <p key={highlight.id} className="rounded-sm bg-yellow-100 px-2 py-1 text-xs leading-5 text-stone-700">
                  {highlight.text}
                </p>
              ))}
            </div>
          )}
          {knowledgeCards.length > 0 && (
            <div className="mb-4 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">Knowledge Cards</p>
              {knowledgeCards.map((card) => (
                <p key={card.id} className="rounded-sm border border-stone-200 bg-white px-2 py-1 text-xs leading-5 text-stone-700">
                  {card.excerpt}
                </p>
              ))}
            </div>
          )}
          {activeTranslation ? (
            <ol className="space-y-2 text-xs leading-5 text-stone-600">
              {buildTranslationNotes(activeTranslation).map((item, index) => (
                <li key={`${item}-${index}`} className="grid grid-cols-[24px_1fr] gap-2">
                  <span className="text-stone-400">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-xs italic text-stone-400">No translation notes yet.</p>
          )}
        </div>
      </>
    ) : (
      <div className="flex flex-1 flex-col">
        <textarea
          value={note?.body || ''}
          onChange={(event) => onNoteChange(event.target.value)}
          className="min-h-72 flex-1 resize-none rounded-sm border border-stone-300 bg-[#fbf8f1] p-4 text-base leading-7 outline-none focus:ring-2 focus:ring-stone-400"
          placeholder="Write a note, question, connection, or interpretation..."
        />
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={onRespondToNote}
            disabled={isRespondingToNote}
            className="flex h-10 items-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-medium text-[#fffdf8] hover:bg-stone-800 disabled:cursor-wait disabled:opacity-50"
          >
            {isRespondingToNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            LLM Respond
          </button>
        </div>
        {note?.llmResponse && (
          <div className="mt-5 rounded-sm border border-stone-300 bg-white p-4 text-sm leading-6 text-stone-700">
            <HoverableLlmResponse
              text={note.llmResponse}
              anchors={noteAnchors}
              onHoverSource={onHoverNoteSource}
            />
          </div>
        )}
      </div>
    )}
    </article>
  );
};

interface PdfCanvasPageProps {
  source: string | ArrayBuffer;
  pageNumber: number;
}

const PdfCanvasPage: React.FC<PdfCanvasPageProps> = ({ source, pageNumber }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderRequestRef = useRef(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState('');
  const [pageLayout, setPageLayout] = useState<{
    width: number;
    height: number;
    textItems: Array<{ str: string; left: number; top: number; width: number; height: number }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let resizeTimer: number | undefined;

    const render = async () => {
      if (!wrapperRef.current || !canvasRef.current) {
        return;
      }

      setIsRendering(true);
      setRenderError('');
      const requestId = (renderRequestRef.current += 1);

      try {
        const layout = await renderPdfPageToCanvas(source, pageNumber, canvasRef.current, wrapperRef.current.clientWidth - 24);
        if (!cancelled && requestId === renderRequestRef.current) {
          setPageLayout(layout);
        }
      } catch (error) {
        if (!cancelled && requestId === renderRequestRef.current) {
          setRenderError(error instanceof Error ? error.message : 'Could not render PDF page.');
        }
      } finally {
        if (!cancelled && requestId === renderRequestRef.current) {
          setIsRendering(false);
        }
      }
    };

    render();

    const observer = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(render, 120);
    });

    if (wrapperRef.current) {
      observer.observe(wrapperRef.current);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(resizeTimer);
      observer.disconnect();
    };
  }, [source, pageNumber]);

  return (
    <div ref={wrapperRef} className="relative flex min-h-[520px] justify-center">
      {isRendering && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-100/70">
          <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
        </div>
      )}
      {renderError ? (
        <div className="flex min-h-[420px] items-center justify-center text-sm text-red-700">{renderError}</div>
      ) : (
        <div className="relative">
          <canvas ref={canvasRef} className="max-w-full bg-white shadow-sm" />
          {pageLayout && (
            <div
              className="absolute left-0 top-0 select-text text-transparent"
              style={{ width: `${pageLayout.width}px`, height: `${pageLayout.height}px` }}
            >
              {pageLayout.textItems.map((item, index) => (
                <span
                  key={`${item.str}-${index}`}
                  className="absolute whitespace-pre"
                  style={{
                    left: `${item.left}px`,
                    top: `${item.top}px`,
                    width: `${item.width}px`,
                    height: `${item.height}px`,
                    fontSize: `${item.height}px`,
                    lineHeight: 1,
                  }}
                >
                  {item.str}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface SettingsFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}

const SettingsField: React.FC<SettingsFieldProps> = ({ label, value, onChange, type = 'text' }) => (
  <label className="mt-3 block">
    <span className="text-xs font-medium text-stone-600">{label}</span>
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      type={type}
      className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-[#fbf8f1] px-3 text-sm outline-none focus:ring-2 focus:ring-stone-400"
    />
  </label>
);

interface StatusMessageProps {
  statusMessage: string;
  errorMessage: string;
  compact?: boolean;
}

const StatusMessage: React.FC<StatusMessageProps> = ({ statusMessage, errorMessage, compact }) => {
  if (!statusMessage && !errorMessage) {
    return null;
  }

  return (
    <div
      className={`${compact ? 'mt-0' : 'mt-5'} flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
        errorMessage ? 'border-red-300 bg-red-50 text-red-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'
      }`}
    >
      {errorMessage ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{errorMessage || statusMessage}</span>
    </div>
  );
};

interface FormattedReadingTextProps {
  text: string;
  muted?: boolean;
  theme?: ReadingTheme;
  hoverHighlightText?: string;
}

const FormattedReadingText: React.FC<FormattedReadingTextProps> = ({ text, muted, theme, hoverHighlightText = '' }) => {
  const lines = text.replace(/\r/g, '').split('\n');
  const fontClass =
    theme?.font === 'mono'
      ? 'font-mono'
      : theme?.font === 'sans'
        ? 'font-sans'
        : 'font-serif';
  const textStyle = theme
    ? {
        color: muted ? '#a8a29e' : theme.textColor,
        fontSize: `${theme.fontSize}px`,
        lineHeight: theme.lineHeight,
        textAlign: theme.textAlign,
      }
    : undefined;

  return (
    <div
      className={`flex-1 overflow-y-auto whitespace-pre-wrap text-[1.08rem] leading-8 md:text-[1.16rem] md:leading-9 ${fontClass} ${
        muted ? 'text-stone-400' : 'text-stone-900'
      }`}
      style={textStyle}
    >
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const previousBlank = index === 0 || !lines[index - 1].trim();
        const nextBlank = index === lines.length - 1 || !lines[index + 1].trim();
        const isHeading =
          trimmed.length > 0 &&
          trimmed.length <= 90 &&
          (index < 8 || (previousBlank && nextBlank)) &&
          !/[.!?,;:，。！？；：]$/.test(trimmed);

        if (!trimmed) {
          return <div key={`blank-${index}`} style={{ height: theme ? `${theme.paragraphSpacing}px` : undefined }} className="h-4" />;
        }

        if (isHeading) {
          return (
            <div
              key={`${line}-${index}`}
              className="mb-3 mt-5 text-center text-[1.18rem] font-semibold leading-8"
              style={theme ? { color: theme.textColor } : undefined}
            >
              <HighlightedLine line={line} phrase={hoverHighlightText} />
            </div>
          );
        }

        return (
          <div key={`${line}-${index}`} className="min-h-8">
            <HighlightedLine line={line} phrase={hoverHighlightText} />
          </div>
        );
      })}
    </div>
  );
};

interface HighlightedLineProps {
  line: string;
  phrase: string;
}

const HighlightedLine: React.FC<HighlightedLineProps> = ({ line, phrase }) => {
  const normalizedPhrase = phrase.trim();

  if (!normalizedPhrase || normalizedPhrase.length < 3) {
    return <>{line}</>;
  }

  const index = line.toLocaleLowerCase().indexOf(normalizedPhrase.toLocaleLowerCase());

  if (index === -1) {
    return <>{line}</>;
  }

  return (
    <>
      {line.slice(0, index)}
      <mark className="rounded-sm bg-amber-200 px-0.5 text-stone-950 shadow-[0_0_0_2px_rgba(251,191,36,0.28)]">
        {line.slice(index, index + normalizedPhrase.length)}
      </mark>
      {line.slice(index + normalizedPhrase.length)}
    </>
  );
};

interface ReadingThemePopoverProps {
  theme: ReadingTheme;
  themes: ReadingTheme[];
  onThemeChange: <K extends keyof ReadingTheme>(key: K, value: ReadingTheme[K]) => void;
  onApplyTheme: (themeId: string) => void;
  onSaveTheme: () => void;
}

const ReadingThemePopover: React.FC<ReadingThemePopoverProps> = ({
  theme,
  themes,
  onThemeChange,
  onApplyTheme,
  onSaveTheme,
}) => (
  <div className="absolute right-6 top-20 z-30 w-80 rounded-md border border-stone-300 bg-[#fffdf8] p-4 text-stone-900 shadow-2xl">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">Translation Format</p>
        <p className="text-xs text-stone-500">Tune the facing page.</p>
      </div>
      <button
        onClick={onSaveTheme}
        className="flex h-8 items-center gap-1 rounded-md border border-stone-300 px-2 text-xs font-medium hover:bg-stone-100"
      >
        <Plus className="h-3.5 w-3.5" />
        Save
      </button>
    </div>

    <div className="grid grid-cols-2 gap-2">
      {themes.map((item) => (
        <button
          key={item.id}
          onClick={() => onApplyTheme(item.id)}
          className={`flex items-center justify-between rounded-md border px-3 py-2 text-left text-xs ${
            item.id === theme.id ? 'border-stone-950 bg-stone-100' : 'border-stone-200 hover:bg-stone-50'
          }`}
        >
          <span>{item.name}</span>
          {item.id === theme.id && <Check className="h-3.5 w-3.5" />}
        </button>
      ))}
    </div>

    <div className="mt-4 space-y-3">
      <label className="block text-xs font-medium text-stone-600">
        Font
        <select
          value={theme.font}
          onChange={(event) => onThemeChange('font', event.target.value as TextFont)}
          className="mt-1 h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm"
        >
          <option value="serif">Serif</option>
          <option value="sans">Sans</option>
          <option value="mono">Mono</option>
        </select>
      </label>

      <label className="block text-xs font-medium text-stone-600">
        Alignment
        <select
          value={theme.textAlign}
          onChange={(event) => onThemeChange('textAlign', event.target.value as TextAlignment)}
          className="mt-1 h-9 w-full rounded-md border border-stone-300 bg-white px-2 text-sm"
        >
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="justify">Justify</option>
        </select>
      </label>

      <ThemeRange label="Text Size" value={theme.fontSize} min={14} max={24} step={1} onChange={(value) => onThemeChange('fontSize', value)} />
      <ThemeRange label="Line Spacing" value={theme.lineHeight} min={1.3} max={2.4} step={0.05} onChange={(value) => onThemeChange('lineHeight', value)} />
      <ThemeRange
        label="Paragraph Spacing"
        value={theme.paragraphSpacing}
        min={6}
        max={32}
        step={1}
        onChange={(value) => onThemeChange('paragraphSpacing', value)}
      />

      <div className="grid grid-cols-2 gap-3">
        <ThemeColor label="Background" value={theme.background} onChange={(value) => onThemeChange('background', value)} />
        <ThemeColor label="Text" value={theme.textColor} onChange={(value) => onThemeChange('textColor', value)} />
      </div>
    </div>
  </div>
);

interface ThemeRangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

const ThemeRange: React.FC<ThemeRangeProps> = ({ label, value, min, max, step, onChange }) => (
  <label className="block text-xs font-medium text-stone-600">
    <span className="flex justify-between">
      {label}
      <span>{Number.isInteger(value) ? value : value.toFixed(2)}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-1 w-full accent-stone-950"
    />
  </label>
);

interface ThemeColorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const ThemeColor: React.FC<ThemeColorProps> = ({ label, value, onChange }) => (
  <label className="block text-xs font-medium text-stone-600">
    {label}
    <span className="mt-1 flex h-9 items-center gap-2 rounded-md border border-stone-300 bg-white px-2">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} className="h-6 w-8 border-0 bg-transparent p-0" />
      <span className="font-mono text-xs">{value}</span>
    </span>
  </label>
);

interface HoverAnchor {
  text: string;
  sourceText: string;
}

interface HoverableLlmResponseProps {
  text: string;
  anchors: HoverAnchor[];
  onHoverSource: (text: string) => void;
}

const HoverableLlmResponse: React.FC<HoverableLlmResponseProps> = ({ text, anchors, onHoverSource }) => {
  if (!anchors.length) {
    return <div className="whitespace-pre-wrap">{text}</div>;
  }

  const parts = splitResponseByAnchors(text, anchors);

  return (
    <div className="whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.anchor ? (
          <span
            key={`${part.text}-${index}`}
            onMouseEnter={() => onHoverSource(part.anchor?.sourceText || '')}
            onMouseLeave={() => onHoverSource('')}
            className="cursor-default rounded-sm bg-amber-100 px-0.5 text-stone-950"
          >
            {part.text}
          </span>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        ),
      )}
    </div>
  );
};

const normalizeComparableText = (value: string) => value.replace(/\s+/g, ' ').trim();

const buildNoteHoverAnchors = (response: string, sourceText: string): HoverAnchor[] => {
  const sourceLines = sourceText
    .split('\n')
    .map((line) => normalizeComparableText(line))
    .filter((line) => line.length >= 6);
  const candidates = new Set<string>();

  for (const match of response.matchAll(/[“"']([^“"'\n]{4,80})[”"']/g)) {
    candidates.add(normalizeComparableText(match[1]));
  }

  for (const line of sourceLines) {
    const words = line.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];

    for (const word of words) {
      if (word.length >= 7 && response.toLocaleLowerCase().includes(word.toLocaleLowerCase())) {
        candidates.add(word);
      }
    }
  }

  return Array.from(candidates)
    .map((candidate) => {
      const sourceMatch =
        sourceLines.find((line) => line.toLocaleLowerCase().includes(candidate.toLocaleLowerCase())) ||
        sourceLines.find((line) => candidate.toLocaleLowerCase().includes(line.toLocaleLowerCase()));

      return sourceMatch
        ? {
            text: candidate,
            sourceText: sourceMatch.toLocaleLowerCase().includes(candidate.toLocaleLowerCase()) ? candidate : sourceMatch,
          }
        : null;
    })
    .filter((item): item is HoverAnchor => Boolean(item))
    .slice(0, 12);
};

const splitResponseByAnchors = (text: string, anchors: HoverAnchor[]) => {
  const parts: Array<{ text: string; anchor?: HoverAnchor }> = [];
  let index = 0;

  while (index < text.length) {
    const next = anchors
      .map((anchor) => ({
        anchor,
        index: text.toLocaleLowerCase().indexOf(anchor.text.toLocaleLowerCase(), index),
      }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index || b.anchor.text.length - a.anchor.text.length)[0];

    if (!next) {
      parts.push({ text: text.slice(index) });
      break;
    }

    if (next.index > index) {
      parts.push({ text: text.slice(index, next.index) });
    }

    parts.push({
      text: text.slice(next.index, next.index + next.anchor.text.length),
      anchor: next.anchor,
    });
    index = next.index + next.anchor.text.length;
  }

  return parts;
};

const buildTranslationNotes = (translation: TranslatedSegment) => {
  const notes = [...translation.keyTerms.map((term) => `${term.term}: ${term.explanation}`)];

  if (translation.commentary) {
    notes.push(translation.commentary);
  }

  if (translation.reflectionPrompt) {
    notes.push(`Reflection: ${translation.reflectionPrompt}`);
  }

  return notes;
};

export default App;
