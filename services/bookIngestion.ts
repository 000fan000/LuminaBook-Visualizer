import JSZip from 'jszip';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { SourceSegment, TocEntry, UploadedBook } from '../types';
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

const dirname = (path: string) => {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index + 1);
};

const normalizePath = (path: string) => {
  const parts: string[] = [];

  for (const part of path.split('/')) {
    if (!part || part === '.') {
      continue;
    }

    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }

  return parts.join('/');
};

const normalizeEpubHref = (href: string, basePath = '') =>
  decodeURIComponent(normalizePath(`${basePath}${href.split('#')[0] || ''}`)).toLowerCase();

const findZipEntryByPath = (zip: JSZip, normalizedPath: string) =>
  Object.values(zip.files).find((entry) => !entry.dir && normalizeEpubHref(entry.name) === normalizedPath);

const getXmlElementsByLocalName = (root: Document | Element, localName: string) =>
  Array.from(root.getElementsByTagName('*')).filter((element) => element.localName === localName);

interface EpubPackageInfo {
  spineHrefs: string[];
  navHref?: string;
  ncxHref?: string;
}

const readEpubPackageInfo = async (zip: JSZip): Promise<EpubPackageInfo | null> => {
  const containerEntry = findZipEntryByPath(zip, 'meta-inf/container.xml');

  if (!containerEntry) {
    return null;
  }

  const containerDocument = new DOMParser().parseFromString(await containerEntry.async('text'), 'application/xml');
  const opfPath = getXmlElementsByLocalName(containerDocument, 'rootfile')[0]?.getAttribute('full-path');

  if (!opfPath) {
    return null;
  }

  const opfEntry = findZipEntryByPath(zip, normalizeEpubHref(opfPath));

  if (!opfEntry) {
    return null;
  }

  const opfDocument = new DOMParser().parseFromString(await opfEntry.async('text'), 'application/xml');
  const opfBasePath = dirname(opfEntry.name);
  const manifestItems = getXmlElementsByLocalName(opfDocument, 'item').map((item) => {
    const href = item.getAttribute('href') || '';

    return {
      id: item.getAttribute('id') || '',
      href: href ? normalizeEpubHref(href, opfBasePath) : '',
      mediaType: item.getAttribute('media-type') || '',
      properties: item.getAttribute('properties') || '',
    };
  });
  const manifestById = new Map(manifestItems.filter((item) => item.id && item.href).map((item) => [item.id, item]));
  const spine = getXmlElementsByLocalName(opfDocument, 'spine')[0];
  const spineHrefs = spine
    ? Array.from(spine.children)
        .filter((child) => child.localName === 'itemref')
        .map((itemref) => manifestById.get(itemref.getAttribute('idref') || '')?.href)
        .filter(Boolean) as string[]
    : [];
  const navHref = manifestItems.find((item) => item.properties.split(/\s+/).includes('nav'))?.href;
  const spineTocId = spine?.getAttribute('toc') || '';
  const ncxHref =
    (spineTocId ? manifestById.get(spineTocId)?.href : undefined) ||
    manifestItems.find((item) => item.mediaType === 'application/x-dtbncx+xml')?.href;

  return {
    spineHrefs,
    navHref,
    ncxHref,
  };
};

const EPUB_BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'body',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);

const hasHtmlText = (parts: string[]) => parts.some((part) => part.trim());

const getTrailingHtmlBreakCount = (parts: string[]) => {
  let count = 0;

  for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
    const part = parts[partIndex];

    for (let charIndex = part.length - 1; charIndex >= 0; charIndex -= 1) {
      if (part[charIndex] !== '\n') {
        return count;
      }

      count += 1;
    }
  }

  return count;
};

const appendHtmlTextBreak = (parts: string[], count = 1) => {
  const trailingBreaks = getTrailingHtmlBreakCount(parts);
  const missingBreaks = Math.max(0, count - trailingBreaks);

  if (missingBreaks > 0 && hasHtmlText(parts)) {
    parts.push('\n'.repeat(missingBreaks));
  }
};

const appendHtmlText = (parts: string[], value: string) => {
  const text = value.replace(/\s+/g, ' ');

  if (!text.trim()) {
    return;
  }

  const previous = parts[parts.length - 1] || '';
  const needsSpace =
    previous &&
    !/[\s\n]$/.test(previous) &&
    !/^[,.;:!?，。！？；：、)\]}»”’]/.test(text) &&
    !/[([{«“‘]$/.test(previous);

  if (needsSpace) {
    parts.push(' ');
  }

  parts.push(text);
};

const extractHtmlText = (node: Node, parts: string[]) => {
  if (node.nodeType === Node.TEXT_NODE) {
    appendHtmlText(parts, node.textContent || '');
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const element = node as Element;
  const tagName = element.tagName.toLowerCase();

  if (tagName === 'script' || tagName === 'style' || tagName === 'nav') {
    return;
  }

  if (tagName === 'br') {
    appendHtmlTextBreak(parts, 1);
    return;
  }

  if (tagName === 'hr') {
    appendHtmlTextBreak(parts, 2);
    return;
  }

  const isBlock = EPUB_BLOCK_TAGS.has(tagName);

  if (isBlock && tagName !== 'body') {
    appendHtmlTextBreak(parts, 2);
  }

  if (tagName === 'li') {
    parts.push('- ');
  }

  element.childNodes.forEach((child) => extractHtmlText(child, parts));

  if (tagName === 'li') {
    appendHtmlTextBreak(parts, 1);
    return;
  }

  if (isBlock) {
    appendHtmlTextBreak(parts, 2);
  }
};

const stripHtml = (html: string) => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const parts: string[] = [];
  extractHtmlText(document.body, parts);
  return parts.join('');
};

const getElementText = (element: Element | null) => normalizeWhitespace(element?.textContent || '');

const parseEpubNavToc = (html: string, basePath: string): TocEntry[] => {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const nav =
    document.querySelector('nav[epub\\:type~="toc"], nav[type~="toc"], nav[role="doc-toc"]') ||
    Array.from(document.querySelectorAll('nav')).find((node) => /toc|contents/i.test(node.getAttribute('class') || node.id));

  if (!nav) {
    return [];
  }

  const entries: TocEntry[] = [];
  const walkList = (list: Element, level: number) => {
    Array.from(list.children)
      .filter((child) => child.tagName.toLowerCase() === 'li')
      .forEach((item) => {
        const link = item.querySelector(':scope > a[href], :scope > span > a[href]') as HTMLAnchorElement | null;
        const label = getElementText(link || item.querySelector(':scope > span'));
        const href = link?.getAttribute('href') || '';

        if (label) {
          entries.push({
            id: `toc-${entries.length}`,
            title: label,
            level,
            href: href ? normalizeEpubHref(href, basePath) : undefined,
          });
        }

        Array.from(item.children)
          .filter((child) => child.tagName.toLowerCase() === 'ol' || child.tagName.toLowerCase() === 'ul')
          .forEach((childList) => walkList(childList, level + 1));
      });
  };

  nav.querySelectorAll(':scope > ol, :scope > ul').forEach((list) => walkList(list, 0));
  return entries;
};

const parseEpubNcxToc = (xml: string, basePath: string): TocEntry[] => {
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  const entries: TocEntry[] = [];

  const walkNavPoint = (navPoint: Element, level: number) => {
    const title = getElementText(navPoint.querySelector('navLabel text'));
    const src = navPoint.querySelector('content')?.getAttribute('src') || '';

    if (title) {
      entries.push({
        id: `toc-${entries.length}`,
        title,
        level,
        href: src ? normalizeEpubHref(src, basePath) : undefined,
      });
    }

    Array.from(navPoint.children)
      .filter((child) => child.tagName === 'navPoint')
      .forEach((child) => walkNavPoint(child, level + 1));
  };

  document.querySelectorAll('navMap > navPoint').forEach((navPoint) => walkNavPoint(navPoint, 0));
  return entries;
};

const resolveEpubToc = async (zip: JSZip, htmlFiles: JSZip.JSZipObject[], packageInfo: EpubPackageInfo | null) => {
  const navEntry = packageInfo?.navHref ? findZipEntryByPath(zip, packageInfo.navHref) : null;

  if (navEntry) {
    const toc = parseEpubNavToc(await navEntry.async('text'), dirname(navEntry.name));

    if (toc.length) {
      return toc;
    }
  }

  for (const entry of htmlFiles) {
    const html = await entry.async('text');
    const toc = parseEpubNavToc(html, dirname(entry.name));

    if (toc.length) {
      return toc;
    }
  }

  const ncxEntry =
    (packageInfo?.ncxHref ? findZipEntryByPath(zip, packageInfo.ncxHref) : null) ||
    Object.values(zip.files).find((entry) => !entry.dir && /\.ncx$/i.test(entry.name));

  if (!ncxEntry) {
    return [];
  }

  return parseEpubNcxToc(await ncxEntry.async('text'), dirname(ncxEntry.name));
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

const segmentEpubChapters = (chapters: Array<{ href: string; text: string }>): SourceSegment[] => {
  const segments: SourceSegment[] = [];

  for (const chapter of chapters) {
    const chapterSegments = segmentText(chapter.text);

    for (const segment of chapterSegments) {
      segments.push({
        ...segment,
        id: `segment-${segments.length}`,
        index: segments.length,
        href: chapter.href,
      });
    }
  }

  return segments;
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

const readPdfDocument = async (pdf: any) => {
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

const getPdfDestinationPageNumber = async (pdf: any, dest: unknown): Promise<number | undefined> => {
  let destination = dest;

  if (typeof destination === 'string') {
    destination = await pdf.getDestination(destination);
  }

  if (!Array.isArray(destination) || !destination[0]) {
    return undefined;
  }

  const pageRef = destination[0];

  if (typeof pageRef === 'number') {
    return pageRef + 1;
  }

  try {
    return (await pdf.getPageIndex(pageRef)) + 1;
  } catch {
    return undefined;
  }
};

const readPdfToc = async (pdf: any): Promise<TocEntry[]> => {
  const outline = await pdf.getOutline();

  if (!outline?.length) {
    return [];
  }

  const entries: TocEntry[] = [];

  const walkOutline = async (items: any[], level: number) => {
    for (const item of items) {
      const pageNumber = await getPdfDestinationPageNumber(pdf, item.dest);

      entries.push({
        id: `toc-${entries.length}`,
        title: normalizeWhitespace(item.title || 'Untitled'),
        level,
        pageNumber,
      });

      if (item.items?.length) {
        await walkOutline(item.items, level + 1);
      }
    }
  };

  await walkOutline(outline, 0);
  return entries.filter((entry) => entry.title);
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

const attachPdfTocTargets = (toc: TocEntry[], segments: SourceSegment[]) =>
  toc.map((entry) => ({
    ...entry,
    segmentIndex:
      entry.pageNumber === undefined
        ? undefined
        : segments.find((segment) =>
            segment.firstPage !== undefined &&
            segment.lastPage !== undefined &&
            entry.pageNumber! >= segment.firstPage &&
            entry.pageNumber! <= segment.lastPage,
          )?.index,
  }));

const attachEpubTocTargets = (toc: TocEntry[], segments: SourceSegment[]) =>
  toc.map((entry) => ({
    ...entry,
    segmentIndex: entry.href ? segments.find((segment) => segment.href === entry.href)?.index : undefined,
  }));

const readEpub = async (file: File) => {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const packageInfo = await readEpubPackageInfo(zip);
  const allHtmlFiles = Object.values(zip.files)
    .filter((entry) => !entry.dir && /\.(xhtml|html|htm)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const spineHtmlFiles = (packageInfo?.spineHrefs || [])
    .map((href) => findZipEntryByPath(zip, href))
    .filter((entry): entry is JSZip.JSZipObject => Boolean(entry) && /\.(xhtml|html|htm)$/i.test(entry.name));
  const htmlFiles = spineHtmlFiles.length ? spineHtmlFiles : allHtmlFiles;

  const chapters: Array<{ href: string; text: string }> = [];
  const rawToc = await resolveEpubToc(zip, allHtmlFiles, packageInfo);

  for (const entry of htmlFiles) {
    const html = await entry.async('text');
    const text = normalizeWhitespace(stripHtml(html));

    if (text) {
      chapters.push({
        href: normalizeEpubHref(entry.name),
        text,
      });
    }
  }

  return {
    text: normalizeReadableText(chapters.map((chapter) => chapter.text).join('\n\n')),
    chapters,
    toc: rawToc,
  };
};

export const parseBookFile = async (file: File): Promise<UploadedBook> => {
  const extension = getExtension(file.name);
  const metadata = inferBookMetadata(file.name);
  let text = '';
  let fileType: UploadedBook['fileType'];
  let segments: SourceSegment[] = [];
  let pageCount: number | undefined;
  let sourceData: ArrayBuffer | undefined;
  let toc: TocEntry[] = [];

  if (extension === 'txt') {
    fileType = 'txt';
    text = await readTxt(file);
    segments = segmentText(text);
  } else if (extension === 'pdf') {
    fileType = 'pdf';
    sourceData = await file.arrayBuffer();
    const pdf = await getDocument({ data: sourceData.slice(0) }).promise;
    const pages = await readPdfDocument(pdf);
    pageCount = pages.length;
    text = normalizeReadableText(pages.map((page) => [page.text, ...page.footnotes].join('\n')).join('\n\n'));
    segments = createPdfSegments(pages);
    toc = attachPdfTocTargets(await readPdfToc(pdf), segments);
  } else if (extension === 'epub') {
    fileType = 'epub';
    const epub = await readEpub(file);
    text = epub.text;
    segments = segmentEpubChapters(epub.chapters);
    toc = attachEpubTocTargets(epub.toc, segments);
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
    toc,
  };
};
