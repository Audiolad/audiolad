import {
  PRACTICE_AUDIO_BUCKET,
  PRODUCT_AUDIO_TOO_LARGE_MESSAGE,
  canonicalProductAudioUploadMime,
  detectProductAudioSourceFormat,
  validateProductAudioFileClient,
} from "@/lib/author-products/product-audio-upload-contract";
import {
  classifyAuthorSignedUploadError,
  fileForSignedAuthorAudioUpload,
  type AuthorSignedUploadErrorReport,
} from "@/lib/author-products/signed-upload-client";
import type { AuthorProductDetail } from "@/lib/author-products/types";
import { createClient } from "@/lib/supabase/client";

export type AuthorProductSignedUpload = {
  path: string;
  token: string;
};

export type AuthorProductAudioUploadSuccess = {
  ok: true;
  product: AuthorProductDetail;
};

export type AuthorProductAudioUploadFailure = {
  ok: false;
  error?: string;
  message?: string;
  status: number;
};

export type AuthorProductAudioUploadResult =
  | AuthorProductAudioUploadSuccess
  | AuthorProductAudioUploadFailure;

type StartPayload = {
  upload_path?: string;
  signedUpload?: AuthorProductSignedUpload;
  error?: string;
  message?: string;
};

type FinalizePayload = {
  product?: AuthorProductDetail;
  error?: string;
  message?: string;
};

function isSignedUpload(
  value: unknown,
): value is AuthorProductSignedUpload {
  return Boolean(
    value &&
      typeof value === "object" &&
      "path" in value &&
      typeof value.path === "string" &&
      "token" in value &&
      typeof value.token === "string",
  );
}

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function abandonProductAudioUpload(input: {
  practiceId: string;
  audioId: string;
  uploadPath: string;
  storageError?: AuthorSignedUploadErrorReport;
}): Promise<void> {
  try {
    await fetch(
      `/api/author/products/${input.practiceId}/audio/${input.audioId}/upload/abandon`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_path: input.uploadPath,
          ...(input.storageError ? { storageError: input.storageError } : {}),
        }),
      },
    );
  } catch {
    // Best-effort cleanup of the unapplied versioned object.
  }
}

export async function uploadAuthorProductAudioDirect(input: {
  practiceId: string;
  audioId: string;
  file: File;
  signal?: AbortSignal;
}): Promise<AuthorProductAudioUploadResult> {
  const validationError = validateProductAudioFileClient(input.file);
  if (validationError) {
    return {
      ok: false,
      error:
        validationError === PRODUCT_AUDIO_TOO_LARGE_MESSAGE
          ? "invalid_file_size"
          : "invalid_file_type",
      message: validationError,
      status: 400,
    };
  }

  const startResponse = await fetch(
    `/api/author/products/${input.practiceId}/audio/${input.audioId}/upload/start`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_name: input.file.name,
        file_size: input.file.size,
        mime_type: input.file.type,
      }),
      signal: input.signal,
    },
  );
  const started = await readJson<StartPayload>(startResponse);
  if (
    !startResponse.ok ||
    !started?.upload_path ||
    !isSignedUpload(started.signedUpload)
  ) {
    return {
      ok: false,
      error: started?.error,
      message: started?.message,
      status: startResponse.status,
    };
  }

  const uploadPath = started.upload_path;
  const uploadMime = canonicalProductAudioUploadMime(
    detectProductAudioSourceFormat(input.file.name) ?? "mp3",
  );
  try {
    const { error: storageError } = await createClient()
      .storage
      .from(PRACTICE_AUDIO_BUCKET)
      .uploadToSignedUrl(
        started.signedUpload.path,
        started.signedUpload.token,
        fileForSignedAuthorAudioUpload(input.file, input.file.name, uploadMime),
        {
          contentType: uploadMime,
          upsert: false,
        },
      );

    if (storageError) {
      const classified = classifyAuthorSignedUploadError(storageError);
      await abandonProductAudioUpload({
        practiceId: input.practiceId,
        audioId: input.audioId,
        uploadPath,
        storageError: classified,
      });
      return {
        ok: false,
        error: classified.code === "upload_token_expired"
          ? "upload_token_expired"
          : "upload_failed",
        status: 502,
      };
    }

    const finalizeResponse = await fetch(
      `/api/author/products/${input.practiceId}/audio/${input.audioId}/upload/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_path: uploadPath,
          file_name: input.file.name,
          file_size: input.file.size,
        }),
        signal: input.signal,
      },
    );
    const finalized = await readJson<FinalizePayload>(finalizeResponse);
    if (!finalizeResponse.ok || !finalized?.product) {
      if (finalized?.error !== "stale_music_upload") {
        await abandonProductAudioUpload({
          practiceId: input.practiceId,
          audioId: input.audioId,
          uploadPath,
        });
      }
      return {
        ok: false,
        error: finalized?.error,
        message: finalized?.message,
        status: finalizeResponse.status,
      };
    }

    return { ok: true, product: finalized.product };
  } catch {
    await abandonProductAudioUpload({
      practiceId: input.practiceId,
      audioId: input.audioId,
      uploadPath,
    });
    return {
      ok: false,
      status: 500,
    };
  }
}
