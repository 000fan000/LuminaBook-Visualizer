import { LlmEvaluationRecord } from '../types';

const DB_NAME = 'luminabook-llm-evaluation';
const DB_VERSION = 1;
const STORE_NAME = 'llmEvaluationRecords';

const EXPORT_COLUMNS: Array<keyof LlmEvaluationRecord> = [
  'createdAt',
  'localTime',
  'profileName',
  'profileId',
  'requestName',
  'attempt',
  'provider',
  'model',
  'temperature',
  'endpoint',
  'method',
  'useJsonMode',
  'maxTokens',
  'timeoutMs',
  'ok',
  'status',
  'statusText',
  'elapsedMs',
  'elapsedSeconds',
  'timedOut',
  'promptMessages',
  'inputCharacters',
  'inputWords',
  'outputCharacters',
  'outputWords',
  'promptTokens',
  'completionTokens',
  'totalTokens',
  'requestCharacters',
  'responseCharacters',
  'qualityScore',
  'qualityNotes',
  'errorMessage',
  'requestBody',
  'responseContent',
  'responseBody',
];

const openEvaluationDb = () =>
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
    request.onerror = () => reject(request.error || new Error('Could not open LLM evaluation storage.'));
  });

const runEvaluationStoreRequest = async <T>(
  mode: IDBTransactionMode,
  createRequest: (store: IDBObjectStore) => IDBRequest<T>,
) => {
  const db = await openEvaluationDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = createRequest(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('LLM evaluation storage request failed.'));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error('LLM evaluation storage transaction failed.'));
    };
  });
};

export const saveLlmEvaluationRecord = async (record: LlmEvaluationRecord) => {
  await runEvaluationStoreRequest('readwrite', (store) => store.put(record));
};

export const loadLlmEvaluationRecords = async (): Promise<LlmEvaluationRecord[]> => {
  try {
    const records = await runEvaluationStoreRequest<LlmEvaluationRecord[]>('readonly', (store) => store.getAll());
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
};

export const clearLlmEvaluationRecords = async () => {
  await runEvaluationStoreRequest('readwrite', (store) => store.clear());
};

const formatCsvValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const buildLlmEvaluationCsv = (records: LlmEvaluationRecord[]) => {
  const rows = [
    EXPORT_COLUMNS.join(','),
    ...records.map((record) => EXPORT_COLUMNS.map((column) => formatCsvValue(record[column])).join(',')),
  ];

  return `\uFEFF${rows.join('\n')}`;
};

export const downloadLlmEvaluationCsv = (records: LlmEvaluationRecord[]) => {
  const blob = new Blob([buildLlmEvaluationCsv(records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  anchor.href = url;
  anchor.download = `luminabook-llm-evaluation-${timestamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
