"use client";

export type AudiobookRecordingDraft = {
  id: string;
  projectId: string;
  chapterId: string;
  authorId: string;
  originalName: string;
  mimeType: string;
  blob: Blob;
  durationMs: number;
  createdAt: number;
  remoteFragmentId?: string;
};

const DATABASE_NAME = "audiolad-audiobook-recorder";
const STORE_NAME = "drafts";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("projectCreated", ["projectId", "createdAt"]);
      store.createIndex("chapterCreated", ["chapterId", "createdAt"]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const request = operation(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error("indexeddb_transaction_failed"));
  });
}

export function saveAudiobookRecordingDraft(draft: AudiobookRecordingDraft) {
  return transaction("readwrite", (store) => store.put(draft));
}

export function getAudiobookRecordingDraft(id: string) {
  return transaction<AudiobookRecordingDraft | undefined>("readonly", (store) => store.get(id));
}

export async function listAudiobookRecordingDrafts(projectId: string) {
  const db = await database();
  return new Promise<AudiobookRecordingDraft[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).index("projectCreated").getAll(
      IDBKeyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]),
    );
    request.onsuccess = () => {
      db.close();
      resolve((request.result as AudiobookRecordingDraft[]).sort((a, b) => a.createdAt - b.createdAt));
    };
    request.onerror = () => reject(request.error ?? new Error("indexeddb_list_failed"));
  });
}

export function deleteAudiobookRecordingDraft(id: string) {
  return transaction("readwrite", (store) => store.delete(id));
}
