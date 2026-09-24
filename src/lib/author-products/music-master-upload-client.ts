import {
  MUSIC_MASTERS_BUCKET,
  MUSIC_MASTER_TOO_LARGE_MESSAGE,
  validateMusicMasterFileClient,
} from "@/lib/author-products/music-master-upload-contract";
import { createClient } from "@/lib/supabase/client";

type SignedUpload = { path: string; token: string };
type StartPayload = {
  asset_id?: string;
  upload_path?: string;
  signedUpload?: SignedUpload;
  error?: string;
  message?: string;
};

export type MusicMasterUploadResult =
  | { ok: true; message: string; assetId: string | null }
  | { ok: false; error?: string; message?: string; status: number };

async function readJson<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function abandon(input: {
  practiceId: string;
  audioId: string;
  assetId: string;
  uploadPath: string;
}) {
  try {
    await fetch(
      `/api/author/products/${input.practiceId}/audio/${input.audioId}/master/abandon`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: input.assetId,
          upload_path: input.uploadPath,
        }),
      },
    );
  } catch {
    // Best effort: the durable upload record will show its unfinished state.
  }
}

export async function uploadMusicMasterDirect(input: {
  practiceId: string;
  audioId: string;
  file: File;
  signal?: AbortSignal;
}): Promise<MusicMasterUploadResult> {
  const validation = validateMusicMasterFileClient(input.file);
  if (validation) {
    return {
      ok: false,
      error: validation === MUSIC_MASTER_TOO_LARGE_MESSAGE ? "invalid_file_size" : "invalid_file_type",
      message: validation,
      status: 400,
    };
  }
  const start = await fetch(
    `/api/author/products/${input.practiceId}/audio/${input.audioId}/master/start`,
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
  const started = await readJson<StartPayload>(start);
  if (
    !start.ok ||
    !started?.asset_id ||
    !started.upload_path ||
    !started.signedUpload?.path ||
    !started.signedUpload.token
  ) {
    return { ok: false, error: started?.error, message: started?.message, status: start.status };
  }

  try {
    const { error: uploadError } = await createClient().storage
      .from(MUSIC_MASTERS_BUCKET)
      .uploadToSignedUrl(
        started.signedUpload.path,
        started.signedUpload.token,
        input.file,
        // Descriptor MIME can be empty/octet-stream in browsers; Storage only
        // accepts WAV variants, so the signed PUT always declares canonical WAV.
        { contentType: "audio/wav", upsert: false },
      );
    if (uploadError) {
      await abandon({ practiceId: input.practiceId, audioId: input.audioId, assetId: started.asset_id, uploadPath: started.upload_path });
      return { ok: false, error: "upload_failed", status: 502 };
    }

    const finalized = await fetch(
      `/api/author/products/${input.practiceId}/audio/${input.audioId}/master/finalize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: started.asset_id,
          upload_path: started.upload_path,
          file_size: input.file.size,
        }),
        signal: input.signal,
      },
    );
    const payload = await readJson<{
      error?: string;
      message?: string;
      asset_id?: string;
    }>(finalized);
    if (!finalized.ok) {
      await abandon({ practiceId: input.practiceId, audioId: input.audioId, assetId: started.asset_id, uploadPath: started.upload_path });
      return { ok: false, error: payload?.error, message: payload?.message, status: finalized.status };
    }
    return {
      ok: true,
      message: "Файл загружен. Подготавливаем версию для прослушивания…",
      assetId: payload?.asset_id ?? started.asset_id,
    };
  } catch {
    await abandon({ practiceId: input.practiceId, audioId: input.audioId, assetId: started.asset_id, uploadPath: started.upload_path });
    return { ok: false, status: 500 };
  }
}
