import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MUSIC_MASTERS_BUCKET } from "@/lib/author-products/music-master-upload-contract";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  presignS3ObjectUrl,
  type S3SigningConfig,
} from "./s3-signing";

export const MUSIC_STORAGE_PROVIDERS = [
  "supabase_file",
  "timeweb_s3",
] as const;

export type MusicStorageProvider = (typeof MUSIC_STORAGE_PROVIDERS)[number];

export type MusicStorageLocation = {
  storage_provider?: string | null;
  storage_bucket: string;
  storage_path: string;
};

export type MusicStorageObjectHead = {
  sizeBytes: number;
  etag: string | null;
};

export type MusicStorageUploadTarget =
  | {
      kind: "supabase_signed_upload";
      path: string;
      token: string;
    }
  | {
      kind: "presigned_put";
      url: string;
      headers: Record<string, string>;
    };

export class MusicStorageConfigurationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MusicStorageConfigurationError";
  }
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function readMusicStorageProvider(
  value: string | null | undefined,
): MusicStorageProvider {
  return value === "timeweb_s3" ? "timeweb_s3" : "supabase_file";
}

export function musicStorageLocation(input: MusicStorageLocation): {
  provider: MusicStorageProvider;
  bucket: string;
  path: string;
} {
  return {
    provider: readMusicStorageProvider(input.storage_provider),
    bucket: input.storage_bucket,
    path: input.storage_path,
  };
}

export function newMusicMasterStorageProvider(
  env: NodeJS.Dict<string> = process.env,
): MusicStorageProvider {
  const configured = clean(env.MUSIC_MASTERS_UPLOAD_PROVIDER);
  if (!configured || configured === "supabase_file") return "supabase_file";
  if (configured === "timeweb_s3") return "timeweb_s3";
  throw new MusicStorageConfigurationError("unsupported_music_storage_provider");
}

function readTimewebS3Config(env: NodeJS.Dict<string> = process.env): {
  signing: S3SigningConfig;
  physicalBucket: string;
} {
  const endpoint = clean(env.TIMEWEB_S3_ENDPOINT);
  const region = clean(env.TIMEWEB_S3_REGION);
  const accessKeyId = clean(env.TIMEWEB_S3_ACCESS_KEY_ID);
  const secretAccessKey = clean(env.TIMEWEB_S3_SECRET_ACCESS_KEY);
  const physicalBucket = clean(env.TIMEWEB_S3_MUSIC_MASTERS_BUCKET);
  if (!endpoint || !region || !accessKeyId || !secretAccessKey || !physicalBucket) {
    throw new MusicStorageConfigurationError("timeweb_s3_not_configured");
  }
  return {
    physicalBucket,
    signing: {
      endpoint,
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken: clean(env.TIMEWEB_S3_SESSION_TOKEN) || undefined,
      forcePathStyle: clean(env.TIMEWEB_S3_FORCE_PATH_STYLE) !== "false",
    },
  };
}

function assertS3LogicalBucket(bucket: string): void {
  if (bucket !== MUSIC_MASTERS_BUCKET) {
    throw new MusicStorageConfigurationError("timeweb_s3_bucket_not_supported");
  }
}

function s3Url(input: {
  method: "GET" | "PUT" | "HEAD" | "DELETE";
  location: MusicStorageLocation;
  expiresSeconds: number;
}): string {
  const { bucket, path } = musicStorageLocation(input.location);
  assertS3LogicalBucket(bucket);
  const config = readTimewebS3Config();
  return presignS3ObjectUrl({
    config: config.signing,
    bucket: config.physicalBucket,
    key: path,
    method: input.method,
    expiresSeconds: input.expiresSeconds,
  });
}

async function recordMetric(
  service: SupabaseClient,
  input: {
    provider: MusicStorageProvider;
    operation: string;
    outcome: "ok" | "error";
    bytes?: number | null;
  },
): Promise<void> {
  try {
    await service.rpc("record_music_storage_metric", {
      p_provider: input.provider,
      p_operation: input.operation,
      p_outcome: input.outcome,
      p_bytes: Math.max(0, Math.floor(input.bytes ?? 0)),
    });
  } catch {
    // Metrics must never break storage I/O during a partial rollout.
  }
}

export async function createMusicStorageUploadTarget(
  location: MusicStorageLocation,
  options: {
    service?: SupabaseClient;
    contentType?: string;
    expiresSeconds?: number;
  } = {},
): Promise<MusicStorageUploadTarget> {
  const service = options.service ?? createServiceRoleClient();
  const normalized = musicStorageLocation(location);
  if (normalized.provider === "supabase_file") {
    const { data, error } = await service.storage
      .from(normalized.bucket)
      .createSignedUploadUrl(normalized.path, { upsert: false });
    if (error || !data?.token || !data.path) {
      await recordMetric(service, { provider: normalized.provider, operation: "sign_upload", outcome: "error" });
      throw new Error("music_storage_sign_upload_failed");
    }
    await recordMetric(service, { provider: normalized.provider, operation: "sign_upload", outcome: "ok" });
    return { kind: "supabase_signed_upload", path: data.path, token: data.token };
  }
  const headers: Record<string, string> = {};
  if (options.contentType) headers["Content-Type"] = options.contentType;
  try {
    const target = {
      kind: "presigned_put" as const,
      url: s3Url({
        method: "PUT",
        location,
        expiresSeconds: options.expiresSeconds ?? 900,
      }),
      headers,
    };
    await recordMetric(service, { provider: normalized.provider, operation: "sign_upload", outcome: "ok" });
    return target;
  } catch (error) {
    await recordMetric(service, { provider: normalized.provider, operation: "sign_upload", outcome: "error" });
    throw error;
  }
}

export async function createMusicStorageDownloadUrl(
  location: MusicStorageLocation,
  expiresSeconds: number,
  options: {
    service?: SupabaseClient;
    expectedBytes?: number | null;
  } = {},
): Promise<string> {
  const service = options.service ?? createServiceRoleClient();
  const normalized = musicStorageLocation(location);
  let url: string;
  if (normalized.provider === "supabase_file") {
    const { data, error } = await service.storage
      .from(normalized.bucket)
      .createSignedUrl(normalized.path, expiresSeconds);
    if (error || !data?.signedUrl) {
      await recordMetric(service, { provider: normalized.provider, operation: "sign_download", outcome: "error" });
      throw new Error("music_storage_sign_download_failed");
    }
    url = data.signedUrl;
  } else {
    try {
      url = s3Url({ method: "GET", location, expiresSeconds });
    } catch (error) {
      await recordMetric(service, { provider: normalized.provider, operation: "sign_download", outcome: "error" });
      throw error;
    }
  }
  await recordMetric(service, {
    provider: normalized.provider,
    operation: "sign_download",
    outcome: "ok",
    bytes: options.expectedBytes,
  });
  return url;
}

export async function headMusicStorageObject(
  location: MusicStorageLocation,
  service: SupabaseClient = createServiceRoleClient(),
): Promise<MusicStorageObjectHead | null> {
  const normalized = musicStorageLocation(location);
  try {
    if (normalized.provider === "supabase_file") {
      const slash = normalized.path.lastIndexOf("/");
      const directory = normalized.path.slice(0, Math.max(0, slash));
      const filename = normalized.path.slice(slash + 1);
      const { data, error } = await service.storage
        .from(normalized.bucket)
        .list(directory, { limit: 20, search: filename });
      if (error) throw error;
      const object = data?.find((entry) => entry.name === filename);
      const size = Number((object?.metadata as { size?: number | string } | undefined)?.size);
      if (!Number.isFinite(size) || size <= 0) return null;
      await recordMetric(service, { provider: normalized.provider, operation: "head", outcome: "ok" });
      return {
        sizeBytes: size,
        etag: typeof object?.metadata === "object" && object?.metadata
          ? String((object.metadata as { eTag?: unknown }).eTag ?? "") || null
          : null,
      };
    }
    const response = await fetch(s3Url({ method: "HEAD", location, expiresSeconds: 120 }), {
      method: "HEAD",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`music_storage_head_${response.status}`);
    const sizeBytes = Number(response.headers.get("content-length"));
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
    await recordMetric(service, { provider: normalized.provider, operation: "head", outcome: "ok" });
    return {
      sizeBytes,
      etag: response.headers.get("etag")?.replace(/^"|"$/g, "") ?? null,
    };
  } catch (error) {
    await recordMetric(service, { provider: normalized.provider, operation: "head", outcome: "error" });
    if (error instanceof MusicStorageConfigurationError) throw error;
    return null;
  }
}

export async function downloadMusicStorageObjectToFile(
  location: MusicStorageLocation,
  outputPath: string,
  options: {
    service?: SupabaseClient;
    expectedBytes?: number | null;
    timeoutMs?: number;
  } = {},
): Promise<number> {
  const service = options.service ?? createServiceRoleClient();
  const normalized = musicStorageLocation(location);
  try {
    if (normalized.provider === "supabase_file") {
      const { data, error } = await service.storage
        .from(normalized.bucket)
        .download(normalized.path);
      if (error || !data) throw new Error("music_storage_download_failed");
      const buffer = Buffer.from(await data.arrayBuffer());
      if (
        buffer.byteLength <= 0
        || (options.expectedBytes && buffer.byteLength !== options.expectedBytes)
      ) throw new Error("music_storage_size_mismatch");
      await pipeline(Readable.from(buffer), createWriteStream(outputPath, { mode: 0o600 }));
      await recordMetric(service, {
        provider: normalized.provider,
        operation: "download",
        outcome: "ok",
        bytes: buffer.byteLength,
      });
      return buffer.byteLength;
    }
    const url = await createMusicStorageDownloadUrl(location, 600, {
      service,
      expectedBytes: options.expectedBytes,
    });
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 300_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`music_storage_download_${response.status}`);
    }
    let bytes = 0;
    const source = Readable.from(async function* () {
      const reader = response.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          yield value;
        }
      } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }());
    await pipeline(source, createWriteStream(outputPath, { mode: 0o600 }));
    if (bytes <= 0 || (
      options.expectedBytes
      && bytes !== options.expectedBytes
    )) {
      throw new Error("music_storage_size_mismatch");
    }
    await recordMetric(service, { provider: normalized.provider, operation: "download", outcome: "ok", bytes });
    return bytes;
  } catch (error) {
    await recordMetric(service, { provider: normalized.provider, operation: "download", outcome: "error" });
    throw error;
  }
}

export async function downloadMusicStorageObjectBytes(
  location: MusicStorageLocation,
  options: {
    service?: SupabaseClient;
    expectedBytes?: number | null;
    maxBytes: number;
  },
): Promise<Uint8Array> {
  const service = options.service ?? createServiceRoleClient();
  const normalized = musicStorageLocation(location);
  try {
    if (normalized.provider === "supabase_file") {
      const { data, error } = await service.storage
        .from(normalized.bucket)
        .download(normalized.path);
      if (error || !data) throw new Error("music_storage_download_failed");
      const buffer = new Uint8Array(await data.arrayBuffer());
      if (
        buffer.byteLength <= 0
        || buffer.byteLength > options.maxBytes
        || (options.expectedBytes && buffer.byteLength !== options.expectedBytes)
      ) throw new Error("music_storage_size_mismatch");
      await recordMetric(service, {
        provider: normalized.provider,
        operation: "download",
        outcome: "ok",
        bytes: buffer.byteLength,
      });
      return buffer;
    }
    const url = await createMusicStorageDownloadUrl(location, 600, {
      service,
      expectedBytes: options.expectedBytes,
    });
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok) throw new Error(`music_storage_download_${response.status}`);
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (
      buffer.byteLength <= 0
      || buffer.byteLength > options.maxBytes
      || (options.expectedBytes && buffer.byteLength !== options.expectedBytes)
    ) {
      throw new Error("music_storage_size_mismatch");
    }
    await recordMetric(service, {
      provider: normalized.provider,
      operation: "download",
      outcome: "ok",
      bytes: buffer.byteLength,
    });
    return buffer;
  } catch (error) {
    await recordMetric(service, { provider: normalized.provider, operation: "download", outcome: "error" });
    throw error;
  }
}

export async function uploadMusicStorageObjectFromFile(
  location: MusicStorageLocation,
  filePath: string,
  options: {
    service?: SupabaseClient;
    contentType: string;
    upsert?: boolean;
  },
): Promise<number> {
  const service = options.service ?? createServiceRoleClient();
  const normalized = musicStorageLocation(location);
  const file = await stat(filePath);
  try {
    if (normalized.provider === "supabase_file") {
      const stream = createReadStream(filePath);
      try {
        const { error } = await service.storage
          .from(normalized.bucket)
          .upload(normalized.path, stream, {
            contentType: options.contentType,
            upsert: options.upsert ?? false,
            duplex: "half",
          });
        if (error) throw error;
      } finally {
        stream.destroy();
      }
    } else {
      const request: RequestInit & { duplex: "half" } = {
        method: "PUT",
        headers: {
          "Content-Type": options.contentType,
          "Content-Length": String(file.size),
        },
        body: createReadStream(filePath) as unknown as BodyInit,
        duplex: "half",
        signal: AbortSignal.timeout(600_000),
      };
      const response = await fetch(
        s3Url({ method: "PUT", location, expiresSeconds: 900 }),
        request,
      );
      if (!response.ok) throw new Error(`music_storage_upload_${response.status}`);
    }
    await recordMetric(service, {
      provider: normalized.provider,
      operation: "upload",
      outcome: "ok",
      bytes: file.size,
    });
    return file.size;
  } catch (error) {
    await recordMetric(service, { provider: normalized.provider, operation: "upload", outcome: "error" });
    throw error;
  }
}

export async function removeMusicStorageObject(
  location: MusicStorageLocation,
  service: SupabaseClient = createServiceRoleClient(),
): Promise<boolean> {
  const normalized = musicStorageLocation(location);
  try {
    if (normalized.provider === "supabase_file") {
      const { error } = await service.storage
        .from(normalized.bucket)
        .remove([normalized.path]);
      if (error) throw error;
    } else {
      const response = await fetch(s3Url({ method: "DELETE", location, expiresSeconds: 120 }), {
        method: "DELETE",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`music_storage_delete_${response.status}`);
      }
    }
    await recordMetric(service, { provider: normalized.provider, operation: "delete", outcome: "ok" });
    return true;
  } catch {
    await recordMetric(service, { provider: normalized.provider, operation: "delete", outcome: "error" });
    return false;
  }
}
