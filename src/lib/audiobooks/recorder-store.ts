"use client";

export type AudiobookRecordingDraft = {
  id: string;
  projectId: string;
  chapterId: string;
  authorId: string;
  originalName: string;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  chunkCount: number;
  status: "recording" | "ready" | "syncing" | "failed" | "interrupted";
  createdAt: number;
  readyAt?: number;
  remoteFragmentId?: string;
};

export type AudiobookRecordingChunk = {
  draftId: string;
  sequence: number;
  data: Blob;
};

const DATABASE_NAME = "audiolad-audiobook-recorder-v2";
const DATABASE_VERSION = 1;
const DRAFTS_STORE = "recording_drafts";
const CHUNKS_STORE = "recording_chunks";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const drafts = request.result.createObjectStore(DRAFTS_STORE, { keyPath: "id" });
      drafts.createIndex("projectCreated", ["projectId", "createdAt"]);
      drafts.createIndex("chapterCreated", ["chapterId", "createdAt"]);
      const chunks = request.result.createObjectStore(CHUNKS_STORE, { keyPath: ["draftId", "sequence"] });
      chunks.createIndex("draftSequence", ["draftId", "sequence"]);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

function completedTransaction<T>(
  stores: string | string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => IDBRequest | void,
) {
  return database().then((db) => new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(stores, mode);
    let result: T | undefined;
    const request = operation(transaction);
    if (request) {
      request.onerror = () => reject(request.error ?? new Error("indexeddb_request_failed"));
      request.onsuccess = () => { result = request.result as T; };
    }
    transaction.oncomplete = () => {
      db.close();
      resolve(result);
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("indexeddb_transaction_failed"));
    };
  }));
}

export function saveAudiobookRecordingDraft(draft: AudiobookRecordingDraft) {
  return completedTransaction<AudiobookRecordingDraft>(
    DRAFTS_STORE,
    "readwrite",
    (transaction) => transaction.objectStore(DRAFTS_STORE).put(draft),
  );
}

export function getAudiobookRecordingDraft(id: string) {
  return completedTransaction<AudiobookRecordingDraft | undefined>(
    DRAFTS_STORE,
    "readonly",
    (transaction) => transaction.objectStore(DRAFTS_STORE).get(id),
  );
}

export async function listAudiobookRecordingDrafts(projectId: string) {
  const drafts = await completedTransaction<AudiobookRecordingDraft[]>(
    DRAFTS_STORE,
    "readonly",
    (transaction) => transaction.objectStore(DRAFTS_STORE).index("projectCreated").getAll(
      IDBKeyRange.bound([projectId, 0], [projectId, Number.MAX_SAFE_INTEGER]),
    ),
  );
  return (drafts ?? []).sort((a, b) => a.createdAt - b.createdAt);
}

export async function recoverInterruptedAudiobookRecordingDrafts(projectId: string) {
  const drafts = await listAudiobookRecordingDrafts(projectId);
  await Promise.all(drafts.filter((draft) => draft.status === "recording" || draft.status === "syncing").map(async (draft) => {
    if (draft.status === "syncing") {
      await saveAudiobookRecordingDraft({ ...draft, status: "failed" });
      return;
    }
    if (draft.sizeBytes > 0 && draft.chunkCount > 0) {
      await saveAudiobookRecordingDraft({ ...draft, status: "interrupted" });
      return;
    }
    await deleteAudiobookRecordingDraft(draft.id);
  }));
  return listAudiobookRecordingDrafts(projectId);
}

export async function appendAudiobookRecordingChunk(draftId: string, sequence: number, data: Blob) {
  const db = await database();
  return new Promise<AudiobookRecordingDraft>((resolve, reject) => {
    const transaction = db.transaction([DRAFTS_STORE, CHUNKS_STORE], "readwrite");
    const drafts = transaction.objectStore(DRAFTS_STORE);
    const chunks = transaction.objectStore(CHUNKS_STORE);
    let nextDraft: AudiobookRecordingDraft | null = null;

    const draftRequest = drafts.get(draftId);
    draftRequest.onerror = () => reject(draftRequest.error ?? new Error("indexeddb_request_failed"));
    draftRequest.onsuccess = () => {
      const draft = draftRequest.result as AudiobookRecordingDraft | undefined;
      if (!draft) {
        transaction.abort();
        reject(new Error("recording_draft_missing"));
        return;
      }
      const chunkCount = draft.chunkCount ?? 0;
      if (sequence !== chunkCount) {
        transaction.abort();
        reject(new Error("recording_chunk_sequence_invalid"));
        return;
      }
      nextDraft = {
        ...draft,
        chunkCount: chunkCount + 1,
        sizeBytes: draft.sizeBytes + data.size,
      };
      chunks.put({ draftId, sequence, data } satisfies AudiobookRecordingChunk);
      drafts.put(nextDraft);
    };
    transaction.oncomplete = () => {
      db.close();
      if (nextDraft) resolve(nextDraft);
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(transaction.error ?? new Error("indexeddb_transaction_failed"));
    };
  });
}

export async function getAudiobookRecordingData(draftId: string, mimeType: string) {
  const chunks = await completedTransaction<AudiobookRecordingChunk[]>(
    CHUNKS_STORE,
    "readonly",
    (transaction) => transaction.objectStore(CHUNKS_STORE).index("draftSequence").getAll(
      IDBKeyRange.bound([draftId, 0], [draftId, Number.MAX_SAFE_INTEGER]),
    ),
  );
  const ordered = (chunks ?? []).sort((left, right) => left.sequence - right.sequence);
  return {
    blob: new Blob(ordered.map((chunk) => chunk.data), { type: mimeType }),
    chunkCount: ordered.length,
    contiguous: ordered.every((chunk, index) => chunk.sequence === index),
    sizeBytes: ordered.reduce((total, chunk) => total + chunk.data.size, 0),
  };
}

export async function getAudiobookRecordingBlob(draftId: string, mimeType: string) {
  return (await getAudiobookRecordingData(draftId, mimeType)).blob;
}

export async function deleteAudiobookRecordingDraft(id: string) {
  await completedTransaction(
    [DRAFTS_STORE, CHUNKS_STORE],
    "readwrite",
    (transaction) => {
      const chunks = transaction.objectStore(CHUNKS_STORE).index("draftSequence").openKeyCursor(
        IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
      );
      chunks.onsuccess = () => {
        const cursor = chunks.result;
        if (!cursor) return;
        transaction.objectStore(CHUNKS_STORE).delete(cursor.primaryKey);
        cursor.continue();
      };
      return transaction.objectStore(DRAFTS_STORE).delete(id);
    },
  );
}

async function deleteAudiobookRecordingDraftsBy(
  indexName: "projectCreated" | "chapterCreated",
  id: string,
) {
  await completedTransaction(
    [DRAFTS_STORE, CHUNKS_STORE],
    "readwrite",
    (transaction) => {
      const drafts = transaction.objectStore(DRAFTS_STORE).index(indexName).openKeyCursor(
        IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]),
      );
      drafts.onsuccess = () => {
        const cursor = drafts.result;
        if (!cursor) return;
        const draftId = cursor.primaryKey as string;
        const chunks = transaction.objectStore(CHUNKS_STORE).index("draftSequence").openKeyCursor(
          IDBKeyRange.bound([draftId, 0], [draftId, Number.MAX_SAFE_INTEGER]),
        );
        chunks.onsuccess = () => {
          const chunk = chunks.result;
          if (!chunk) return;
          transaction.objectStore(CHUNKS_STORE).delete(chunk.primaryKey);
          chunk.continue();
        };
        transaction.objectStore(DRAFTS_STORE).delete(draftId);
        cursor.continue();
      };
    },
  );
}

export function deleteAudiobookRecordingDraftsForChapter(chapterId: string) {
  return deleteAudiobookRecordingDraftsBy("chapterCreated", chapterId);
}

export function deleteAudiobookRecordingDraftsForProject(projectId: string) {
  return deleteAudiobookRecordingDraftsBy("projectCreated", projectId);
}
