interface PdfTextContent {
  items: any[];
  styles: Record<string, unknown>;
  lang?: string | null;
}

const readStreamWithReader = async (stream: ReadableStream<unknown>) => {
  const reader = stream.getReader();
  const chunks: any[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        chunks.push(value);
      }
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
};

const readStreamWithAsyncIterator = async (stream: AsyncIterable<unknown>) => {
  const chunks: any[] = [];

  for await (const value of stream) {
    if (value) {
      chunks.push(value);
    }
  }

  return chunks;
};

export const readPdfTextContent = async (page: any, params = {}): Promise<PdfTextContent> => {
  const stream = page.streamTextContent(params);
  const chunks =
    stream && typeof stream.getReader === 'function'
      ? await readStreamWithReader(stream as ReadableStream<unknown>)
      : await readStreamWithAsyncIterator(stream as AsyncIterable<unknown>);

  return chunks.reduce<PdfTextContent>(
    (content, chunk) => ({
      items: [...content.items, ...(chunk.items || [])],
      styles: {
        ...content.styles,
        ...(chunk.styles || {}),
      },
      lang: content.lang || chunk.lang || null,
    }),
    {
      items: [],
      styles: {},
      lang: null,
    },
  );
};
