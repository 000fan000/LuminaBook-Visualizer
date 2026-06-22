import { BookMetadata, UploadedBook } from '../types';
import { extractEpubCoverImage } from './bookIngestion';

const DB_NAME = 'luminabook-reader';
const DB_VERSION = 1;
const STORE_NAME = 'books';

type StoredBook = Omit<UploadedBook, 'sourceUrl'> & {
  sourceBlob?: Blob;
  storedAt: string;
  metadataUpdatedAt?: string;
};

const openLibraryDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open library storage.'));
  });

const runStoreRequest = async <T>(
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await openLibraryDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = createRequest(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Library storage request failed.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Library storage transaction failed.'));
    };
  });
};

export const saveBookToLibrary = async (book: UploadedBook, file: File) => {
  const { sourceUrl: _sourceUrl, ...bookRecord } = book;
  const record: StoredBook = {
    ...bookRecord,
    sourceData: bookRecord.sourceData || (book.fileType === 'pdf' ? await file.arrayBuffer() : undefined),
    sourceBlob: file,
    storedAt: new Date().toISOString(),
  };

  await runStoreRequest('readwrite', (store) => store.put(record));
};

export const deleteBookFromLibrary = async (bookId: string) => {
  await runStoreRequest('readwrite', (store) => store.delete(bookId));
};

export const updateBookMetadataInLibrary = async (bookId: string, metadata: BookMetadata) => {
  const db = await openLibraryDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(bookId);

    request.onsuccess = () => {
      const record = request.result as StoredBook | undefined;

      if (!record) {
        transaction.abort();
        reject(new Error('Saved book could not be found.'));
        return;
      }

      store.put({
        ...record,
        ...metadata,
        metadataUpdatedAt: new Date().toISOString(),
      });
    };
    request.onerror = () => reject(request.error || new Error('Could not load the saved book.'));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('Could not update book metadata.'));
    };
    transaction.onabort = () => db.close();
  });
};

export const loadBooksFromLibrary = async (): Promise<UploadedBook[]> => {
  try {
    const records = await runStoreRequest<StoredBook[]>('readonly', (store) => store.getAll());

    const sortedRecords = records.sort((a, b) => b.storedAt.localeCompare(a.storedAt));

    return Promise.all(
      sortedRecords.map(async ({ sourceBlob, storedAt: _storedAt, metadataUpdatedAt: _metadataUpdatedAt, ...book }) => {
        const backfilledCoverImageUrl =
          book.coverImageUrl || !sourceBlob || book.fileType !== 'epub'
            ? undefined
            : await extractEpubCoverImage(sourceBlob).catch(() => undefined);

        return {
          ...book,
          coverImageUrl: book.coverImageUrl || backfilledCoverImageUrl,
          sourceUrl: sourceBlob ? URL.createObjectURL(sourceBlob) : undefined,
        };
      }),
    );
  } catch {
    return [];
  }
};
