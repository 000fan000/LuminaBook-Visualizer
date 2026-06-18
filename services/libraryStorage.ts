import { UploadedBook } from '../types';

const DB_NAME = 'luminabook-reader';
const DB_VERSION = 1;
const STORE_NAME = 'books';

type StoredBook = Omit<UploadedBook, 'sourceUrl'> & {
  sourceBlob?: Blob;
  storedAt: string;
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

export const loadBooksFromLibrary = async (): Promise<UploadedBook[]> => {
  try {
    const records = await runStoreRequest<StoredBook[]>('readonly', (store) => store.getAll());

    return records
      .sort((a, b) => b.storedAt.localeCompare(a.storedAt))
      .map(({ sourceBlob, storedAt: _storedAt, ...book }) => ({
        ...book,
        sourceUrl: sourceBlob ? URL.createObjectURL(sourceBlob) : undefined,
      }));
  } catch {
    return [];
  }
};
