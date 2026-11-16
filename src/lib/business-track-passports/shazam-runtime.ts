// t1485u: real I/O for the Shazam worker – Supabase (service role), signed-URL download,
// ffprobe/ffmpeg cuts at nice 10 and the pinned shazamio venv. Runs only inside the PM2 worker,
// never inside a Next.js request.
import { execFile } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { promisify } from 'node:util';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseShazamHelperOutput, type ShazamHelperOutput } from './shazam';
import type { ShazamClaimedJob, ShazamWorkerPort } from './shazam-worker';

const execFileAsync = promisify(execFile);
const MAX_MASTER_BYTES = 314_572_800;

export const BUSINESS_SHAZAM_PYTHON_DEFAULT = '/var/lib/audiolad/business-shazam/.venv/bin/python';

export function businessShazamPython(env: NodeJS.Dict<string> = process.env): string {
  return env.BUSINESS_SHAZAM_PYTHON?.trim() || BUSINESS_SHAZAM_PYTHON_DEFAULT;
}

export function businessShazamHelperPath(cwd = process.cwd()): string {
  return resolve(cwd, 'scripts/business-shazam/recognize_segment.py');
}

export function businessShazamWorkerId(): string {
  return `${hostname()}:${process.pid}`;
}

export function parseClaimedShazamJob(claimed: unknown): ShazamClaimedJob | null {
  const row = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!row || typeof row !== 'object') return null;
  const job = row as Record<string, unknown>;
  if (typeof job.id !== 'string' || typeof job.audio_item_id !== 'string' || typeof job.master_asset_id !== 'string') return null;
  return {
    id: job.id,
    audio_item_id: job.audio_item_id,
    master_asset_id: job.master_asset_id,
    attempts: typeof job.attempts === 'number' ? job.attempts : 0,
  };
}

async function downloadToFile(url: string, dest: string, expectedBytes: number | null) {
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(300_000) });
  if (!response.ok || !response.body) throw new Error(`master_download_failed_${response.status}`);
  let bytes = 0;
  const source = Readable.from(async function* () {
    const reader = response.body!.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_MASTER_BYTES) throw new Error('master_too_large');
        yield value;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }());
  await pipeline(source, createWriteStream(dest, { mode: 0o600 }));
  if (bytes === 0 || (expectedBytes !== null && expectedBytes > 0 && bytes !== expectedBytes)) {
    throw new Error('master_size_mismatch');
  }
}

async function probeDuration(path: string): Promise<number> {
  const { stdout } = await execFileAsync('nice', ['-n', '10', 'ffprobe', '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', path], { timeout: 60_000 });
  const value = Number(stdout.trim());
  if (!Number.isFinite(value) || value <= 0) throw new Error('duration_probe_failed');
  return value;
}

async function cutSegment(input: string, output: string, offset: number, duration: number) {
  await execFileAsync('nice', ['-n', '10', 'ffmpeg', '-nostdin', '-loglevel', 'error', '-y',
    '-ss', String(offset), '-t', String(duration), '-i', input,
    '-vn', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', output], { timeout: 120_000 });
}

export function createBusinessShazamPort(service: SupabaseClient, options?: {
  python?: string;
  helperPath?: string;
  workerId?: string;
  log?: (event: Record<string, unknown>) => void;
}): ShazamWorkerPort {
  const python = options?.python ?? businessShazamPython();
  const helper = options?.helperPath ?? businessShazamHelperPath();
  const workerId = options?.workerId ?? businessShazamWorkerId();
  const log = options?.log ?? ((event) => console.log(JSON.stringify(event)));
  let availability: { at: number; value: Awaited<ReturnType<ShazamWorkerPort['available']>> } | null = null;
  const sizes = new Map<string, number | null>();

  return {
    async available() {
      if (availability && Date.now() - availability.at < 10 * 60_000) return availability.value;
      let value: Awaited<ReturnType<ShazamWorkerPort['available']>>;
      try {
        await access(python, fsConstants.X_OK);
        await access(helper, fsConstants.R_OK);
        await execFileAsync('ffmpeg', ['-version'], { timeout: 10_000 });
        await execFileAsync('ffprobe', ['-version'], { timeout: 10_000 });
        const { stdout } = await execFileAsync(python, ['-c', 'from importlib.metadata import version; import shazamio; print(version("shazamio"))'], { timeout: 30_000 });
        value = { ok: true, libraryVersion: `shazamio ${stdout.trim()}` };
      } catch (error) {
        const reason = error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
          ? 'python_or_ffmpeg_missing'
          : 'shazamio_venv_unavailable';
        value = { ok: false, reason };
      }
      availability = { at: Date.now(), value };
      return value;
    },
    async claim() {
      const { data, error } = await service.rpc('claim_business_shazam_check', { p_worker: workerId });
      if (error) throw new Error(`claim_failed: ${error.message}`);
      return parseClaimedShazamJob(data);
    },
    async loadMaster(job) {
      const { data: asset, error } = await service.from('music_audio_assets')
        .select('id,storage_bucket,storage_path,duration_seconds,size_bytes,asset_role,lifecycle_state,audio_item_id')
        .eq('id', job.master_asset_id).maybeSingle();
      if (error) throw new Error('asset_lookup_failed');
      if (!asset || asset.asset_role !== 'master' || asset.lifecycle_state !== 'verified'
        || asset.audio_item_id !== job.audio_item_id || asset.storage_bucket !== 'music-masters') return null;
      const { data: passport } = await service.from('business_track_passports')
        .select('status').eq('audio_item_id', job.audio_item_id).maybeSingle();
      sizes.set(job.id, typeof asset.size_bytes === 'number' ? asset.size_bytes : Number(asset.size_bytes) || null);
      const duration = Number(asset.duration_seconds);
      return {
        storageBucket: String(asset.storage_bucket),
        storagePath: String(asset.storage_path),
        durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
        passportStatus: typeof passport?.status === 'string' ? passport.status : null,
      };
    },
    async prepare(job, master, plan) {
      const workDir = await mkdtemp(join(tmpdir(), 'audiolad-shazam-'));
      try {
        const { data: signed, error } = await service.storage.from(master.storageBucket).createSignedUrl(master.storagePath, 600);
        if (error || !signed?.signedUrl) throw new Error('signed_url_failed');
        const masterPath = join(workDir, 'master');
        await downloadToFile(signed.signedUrl, masterPath, sizes.get(job.id) ?? null);
        const duration = master.durationSeconds ?? await probeDuration(masterPath);
        const segments = [];
        for (const segment of plan(duration)) {
          const path = join(workDir, `${segment.label}.wav`);
          await cutSegment(masterPath, path, segment.offsetSeconds, segment.durationSeconds);
          segments.push({ plan: segment, path });
        }
        await rm(masterPath, { force: true });
        return { workDir, durationSeconds: duration, segments };
      } catch (error) {
        await rm(workDir, { recursive: true, force: true });
        throw error;
      } finally {
        sizes.delete(job.id);
      }
    },
    async cleanup(workDir) {
      await rm(workDir, { recursive: true, force: true });
    },
    async recognize(segmentPath, maxSkew): Promise<ShazamHelperOutput> {
      try {
        const { stdout } = await execFileAsync('nice', ['-n', '10', python, helper, segmentPath, String(maxSkew)], {
          timeout: 180_000, maxBuffer: 1024 * 1024,
        });
        return parseShazamHelperOutput(stdout);
      } catch (error) {
        const stdout = (error as { stdout?: string }).stdout;
        if (stdout) return parseShazamHelperOutput(stdout);
        return parseShazamHelperOutput('');
      }
    },
    async heartbeat(job) {
      const { data, error: rpcError } = await service.rpc('heartbeat_business_shazam_check', {
        p_check_id: job.id,
        p_worker: workerId,
      });
      if (rpcError) throw new Error(`heartbeat_failed: ${rpcError.message}`);
      return data === true;
    },
    async complete({ job, outcome, segments, libraryVersion, error, retryAfterSeconds }) {
      const { data, error: rpcError } = await service.rpc('complete_business_shazam_check', {
        p_check_id: job.id,
        p_worker: workerId,
        p_outcome: outcome,
        p_segments: segments,
        p_library_version: libraryVersion,
        p_error: error,
        p_retry_after_seconds: retryAfterSeconds ?? null,
      });
      if (rpcError) throw new Error(`complete_failed: ${rpcError.message}`);
      return data;
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    now: () => Date.now(),
    log,
  };
}
