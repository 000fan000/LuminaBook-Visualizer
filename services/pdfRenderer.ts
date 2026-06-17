import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { readPdfTextContent } from './pdfTextContent';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const documentCache = new Map<string, any>();

const getCacheKey = (source: string | ArrayBuffer) =>
  typeof source === 'string' ? source : `buffer:${source.byteLength}:${source.slice(0, 16)}`;

export const renderPdfPageToCanvas = async (
  source: string | ArrayBuffer,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  containerWidth: number,
) => {
  const cacheKey = getCacheKey(source);
  let loadingTask = documentCache.get(cacheKey);

  if (!loadingTask) {
    loadingTask = getDocument(typeof source === 'string' ? { url: source } : { data: source.slice(0) });
    documentCache.set(cacheKey, loadingTask);
  }

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(320, containerWidth);
  const scale = availableWidth / baseViewport.width;
  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale });
  const renderCanvas = document.createElement('canvas');
  const renderContext = renderCanvas.getContext('2d');

  if (!renderContext) {
    throw new Error('Could not create canvas context for PDF page.');
  }

  renderCanvas.width = Math.floor(viewport.width * outputScale);
  renderCanvas.height = Math.floor(viewport.height * outputScale);
  renderContext.setTransform(outputScale, 0, 0, outputScale, 0, 0);

  const renderTask = page.render({
    canvasContext: renderContext,
    viewport,
  });

  await renderTask.promise;

  const visibleContext = canvas.getContext('2d');

  if (!visibleContext) {
    throw new Error('Could not create visible canvas context for PDF page.');
  }

  canvas.width = renderCanvas.width;
  canvas.height = renderCanvas.height;
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  visibleContext.setTransform(1, 0, 0, 1, 0, 0);
  visibleContext.clearRect(0, 0, canvas.width, canvas.height);
  visibleContext.drawImage(renderCanvas, 0, 0);

  const textContent = await readPdfTextContent(page, {
    includeMarkedContent: true,
    disableNormalization: true,
  });
  const rawItems = textContent.items || [];

  const textItems = rawItems
    .filter((item: any) => item?.str)
    .map((item: any) => {
      const [, , , , x, y] = item.transform;
      const [vx, vy] = viewport.convertToViewportPoint(x, y);
      const fontHeight = Math.hypot(item.transform[2], item.transform[3]) * scale;

      return {
        str: item.str as string,
        left: vx,
        top: vy - fontHeight,
        width: Math.max(1, (item.width || item.str.length * 5) * scale),
        height: Math.max(8, fontHeight),
      };
    });

  return {
    width: Math.floor(viewport.width),
    height: Math.floor(viewport.height),
    textItems,
  };
};
