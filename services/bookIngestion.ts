import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { SourceSegment, UploadedBook } from '../types';
import { readPdfTextContent } from './pdfTextContent';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_SEGMENT_CHARS = 1800;
const PDF_PAGE_GROUP_SIZE = 1;

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

const normalizeReadableText = (value: string) =>
  value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

const normalizeFileName = (fileName: string) =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const inferBookMetadata = (fileName: string) => {
  const rawBaseName = fileName.replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim();
  const rawWithoutBracketedYear = rawBaseName.replace(/\s*\((?:19|20)\d{2}[^)]*\)\s*$/g, '').trim();
  const authorTitleMatch = rawWithoutBracketedYear.match(/^(.+?)[_:]\s*(.+)$/);
  const baseName = normalizeFileName(fileName);
  const withoutBracketedYear = normalizeFileName(rawWithoutBracketedYear);

  if (authorTitleMatch) {
    return {
      author: normalizeFileName(authorTitleMatch[1]),
      title: normalizeFileName(authorTitleMatch[2]),
    };
  }

  const dashMatch = withoutBracketedYear.match(/^(.+?)\s[-–—]\s(.+)$/);

  if (dashMatch) {
    return {
      author: dashMatch[1].trim(),
      title: dashMatch[2].trim(),
    };
  }

  return {
    title: withoutBracketedYear || baseName || fileName,
  };
};

const getExtension = (fileName: string) => {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

const stripHtml = (html: string) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script, style, nav').forEach((node) => node.remove());
  return document.body.textContent || '';
};

const detectLanguage = (text: string) => {
  if (/[\u4e00-\u9fff]/.test(text)) {
    return 'Chinese';
  }

  if (/[\u0370-\u03ff]/.test(text)) {
    return 'Greek';
  }

  if (/[\u0900-\u097f]/.test(text)) {
    return 'Sanskrit/Hindi';
  }

  if (/[\u0600-\u06ff]/.test(text)) {
    return 'Arabic';
  }

  return 'Auto-detect';
};

const splitFootnotes = (text: string) => {
  const lines = normalizeWhitespace(text).split('\n').filter(Boolean);
  const footnoteStart = lines.findIndex((line, index) => {
    if (index < Math.max(2, Math.floor(lines.length * 0.55))) {
      return false;
    }

    return /^\s*(\d{1,3}|[*†‡§])[\).:\s-]+/.test(line) || /^[\d\s,.-]{1,8}$/.test(line.trim());
  });

  if (footnoteStart === -1) {
    return {
      mainText: normalizeWhitespace(text),
      footnotes: [],
    };
  }

  return {
    mainText: normalizeWhitespace(lines.slice(0, footnoteStart).join('\n')),
    footnotes: lines.slice(footnoteStart).map((line) => line.trim()).filter(Boolean),
  };
};

const segmentText = (text: string): SourceSegment[] => {
  const normalized = normalizeReadableText(text);
  const blocks = normalized.split(/\n\s*\n/).filter(Boolean);
  const segments: string[] = [];
  let current = '';

  for (const block of blocks) {
    const candidate = current ? `${current}\n\n${block}` : block;

    if (candidate.length <= MAX_SEGMENT_CHARS) {
      current = candidate;
      continue;
    }

    if (current) {
      segments.push(current);
    }

    if (block.length <= MAX_SEGMENT_CHARS) {
      current = block;
      continue;
    }

    const sentences = block.match(/[^.!?。！？]+[.!?。！？]?/g) || [block];
    current = '';

    for (const sentence of sentences) {
      const sentenceCandidate = current ? `${current} ${sentence.trim()}` : sentence.trim();

      if (sentenceCandidate.length <= MAX_SEGMENT_CHARS) {
        current = sentenceCandidate;
      } else {
        if (current) {
          segments.push(current);
        }
        current = sentence.trim();
      }
    }
  }

  if (current) {
    segments.push(current);
  }

  return segments.map((sourceText, index) => ({
    id: `segment-${index}`,
    index,
    sourceText,
    sourceLanguage: detectLanguage(sourceText),
    footnotes: [],
  }));
};

const readTxt = async (file: File) => normalizeReadableText(await file.text());

const getItemFontHeight = (item: any) => {
  const [, b = 0, c = 0, d = 0] = item.transform || [];
  return Math.max(1, Math.hypot(c, d) || Math.abs(d) || Math.abs(b) || 10);
};

const joinPdfLineItems = (items: any[]) => {
  const sorted = [...items].sort((a, b) => {
    const ax = a.transform?.[4] || 0;
    const bx = b.transform?.[4] || 0;
    return ax - bx;
  });
  const fontHeight = Math.max(...sorted.map(getItemFontHeight), 10);
  let text = '';
  let previousRight: number | null = null;

  for (const item of sorted) {
    const str = String(item.str || '');

    if (!str) {
      continue;
    }

    const x = item.transform?.[4] || 0;
    const width = item.width || str.length * fontHeight * 0.45;
    const gap = previousRight === null ? 0 : x - previousRight;

    if (text && !str.startsWith(' ') && gap > fontHeight * 0.18) {
      text += gap > fontHeight * 1.25 ? '  ' : ' ';
    }

    text += str;
    previousRight = Math.max(previousRight ?? x, x + width);
  }

  return text.replace(/[ \t]+$/g, '');
};

const readPdfPageText = async (page: any) => {
  const textContent = await readPdfTextContent(page, {
    includeMarkedContent: true,
    disableNormalization: true,
  });
  const rawItems = (textContent.items || []).filter((item: any) => item?.str);
  const rows: Array<{ y: number; fontHeight: number; items: any[] }> = [];

  for (const item of rawItems) {
    const y = item.transform?.[5] || 0;
    const fontHeight = getItemFontHeight(item);
    const existing = rows.find((row) => Math.abs(row.y - y) <= Math.max(2, fontHeight * 0.28));

    if (existing) {
      existing.items.push(item);
      existing.y = (existing.y * (existing.items.length - 1) + y) / existing.items.length;
      existing.fontHeight = Math.max(existing.fontHeight, fontHeight);
    } else {
      rows.push({ y, fontHeight, items: [item] });
    }
  }

  rows.sort((a, b) => b.y - a.y);

  let previousRow: (typeof rows)[number] | null = null;
  let text = '';

  for (const row of rows) {
    const line = joinPdfLineItems(row.items);

    if (!line.trim()) {
      continue;
    }

    if (previousRow) {
      const verticalGap = previousRow.y - row.y;
      text += verticalGap > Math.max(previousRow.fontHeight, row.fontHeight) * 1.75 ? '\n\n' : '\n';
    }

    text += line;
    previousRow = row;
  }

  return normalizeReadableText(text);
};

const readPdf = async (buffer: ArrayBuffer) => {
  const pdf = await getDocument({ data: buffer }).promise;
  const pages: Array<{ pageNumber: number; text: string; footnotes: string[] }> = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await readPdfPageText(page);
    const { mainText, footnotes } = splitFootnotes(pageText);

    if (mainText.trim() || footnotes.length) {
      pages.push({ pageNumber, text: mainText, footnotes });
    }
  }

  return pages;
};

const createPdfSegments = (pages: Array<{ pageNumber: number; text: string; footnotes: string[] }>): SourceSegment[] => {
  const segments: SourceSegment[] = [];

  for (let index = 0; index < pages.length; index += PDF_PAGE_GROUP_SIZE) {
    const group = pages.slice(index, index + PDF_PAGE_GROUP_SIZE);
    const sourceText = normalizeReadableText(group.map((page) => page.text).join('\n\n'));
    const footnotes = group.flatMap((page) => page.footnotes.map((note) => `p. ${page.pageNumber}: ${note}`));
    const firstPage = group[0].pageNumber;
    const lastPage = group[group.length - 1].pageNumber;

    segments.push({
      id: `page-${firstPage}-${lastPage}`,
      index: segments.length,
      sourceText,
      sourceLanguage: detectLanguage(sourceText),
      footnotes,
      label: firstPage === lastPage ? `Page ${firstPage}` : `Pages ${firstPage}-${lastPage}`,
      firstPage,
      lastPage,
    });
  }

  return segments;
};

const readEpub = async (file: File) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const htmlFiles = Object.values(zip.files)
    .filter((entry) => !entry.dir && /\.(xhtml|html|htm)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const chapters: string[] = [];

  for (const entry of htmlFiles) {
    const html = await entry.async('text');
    const text = normalizeWhitespace(stripHtml(html));

    if (text) {
      chapters.push(text);
    }
  }

  return normalizeReadableText(chapters.join('\n\n'));
};

export const parseBookFile = async (file: File): Promise<UploadedBook> => {
  const extension = getExtension(file.name);
  const metadata = inferBookMetadata(file.name);
  let text = '';
  let fileType: UploadedBook['fileType'];
  let segments: SourceSegment[] = [];
  let pageCount: number | undefined;
  let sourceData: ArrayBuffer | undefined;

  if (extension === 'txt') {
    fileType = 'txt';
    text = await readTxt(file);
    segments = segmentText(text);
  } else if (extension === 'pdf') {
    fileType = 'pdf';
    sourceData = await file.arrayBuffer();
    const pages = await readPdf(sourceData.slice(0));
    pageCount = pages.length;
    text = normalizeReadableText(pages.map((page) => [page.text, ...page.footnotes].join('\n')).join('\n\n'));
    segments = createPdfSegments(pages);
  } else if (extension === 'epub') {
    fileType = 'epub';
    text = await readEpub(file);
    segments = segmentText(text);
  } else {
    throw new Error('Unsupported file type. Upload a text-based PDF, TXT, or EPUB file.');
  }

  if (!text.trim() || !segments.length) {
    throw new Error('No text could be extracted. Scanned PDFs need OCR before upload.');
  }

  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    title: metadata.title,
    author: metadata.author,
    fileName: file.name,
    fileType,
    text,
    sourceUrl: URL.createObjectURL(file),
    sourceData,
    pageCount,
    segments,
  };
};
