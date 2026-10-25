import { spawn } from "node:child_process";
import { LOCAL_VERSION } from "./features.mjs";

const RATE = 8000;
const FRAME = 400;
/** Потоковый моно downmix. Не хранит аудио целиком. */
export class EnvelopeMeter {
  count = 0; sum = 0; peak = 0; frameCount = 0; frameSum = 0;
  /** @type {number[]} */ frames = [];
  /** @param {number} sample */
  push(sample) {
    if (!Number.isFinite(sample)) throw new Error("invalid_pcm");
    this.count++; this.sum += sample * sample; this.peak = Math.max(this.peak, Math.abs(sample));
    this.frameCount++; this.frameSum += sample * sample;
    if (this.frameCount === FRAME) {
      if (this.frames.length >= 72000) throw new Error("local_audio_limit"); // Один час; нет неограниченной памяти.
      this.frames.push(Math.sqrt(this.frameSum / FRAME)); this.frameCount = 0; this.frameSum = 0;
    }
  }
  finish() {
    const db = (/** @type {number} */ x) => x > 0 ? 20 * Math.log10(x) : null;
    const rms = this.count ? Math.sqrt(this.sum / this.count) : 0;
    const active = this.frames.filter(v => v > 0.0001).map(v => /** @type {number} */ (db(v))).sort((a, b) => a - b);
    const spread = active.length >= 20 ? active[Math.floor((active.length - 1) * 0.95)] - active[Math.floor((active.length - 1) * 0.1)] : null;
    const envelope = this.frames.map((v, i, a) => i ? Math.max(0, v - a[i - 1]) : 0);
    const max = envelope.reduce((a, b) => Math.max(a, b), 0);
    let attacks = 0;
    for (let i = 1; i < envelope.length - 1; i++) if (envelope[i] > Math.max(0.003, max * 0.2) && envelope[i] >= envelope[i - 1] && envelope[i] > envelope[i + 1]) attacks++;
    const mean = envelope.reduce((a, b) => a + b, 0) / (envelope.length || 1);
    const centered = envelope.map(v => v - mean);
    let periodicity = 0;
    // 40–240 импульсов в минуту; нормированная автокорреляция, не confidence модели.
    if (this.frames.length >= 200 && attacks >= 3) for (let lag = 5; lag <= 30; lag++) {
      let dot = 0, left = 0, right = 0;
      for (let i = lag; i < centered.length; i++) { dot += centered[i] * centered[i - lag]; left += centered[i] ** 2; right += centered[i - lag] ** 2; }
      if (left * right > 0) periodicity = Math.max(periodicity, dot / Math.sqrt(left * right));
    }
    const duration = this.count / RATE;
    const density = duration ? attacks / duration : 0;
    const rmsDb = db(rms);
    return {
      duration_s: duration, rms_dbfs: rmsDb, sample_peak_dbfs: db(this.peak), dynamic_spread_db: spread,
      onset_density: density, rhythm_salience: Math.max(0, Math.min(1, periodicity)),
      energy_0_100: rmsDb === null ? 0 : Math.round(Math.max(0, Math.min(100, ((rmsDb + 60) / 60) * 80 + Math.min(1, density / 4) * 20))),
      algorithm_version: LOCAL_VERSION,
    };
  }
}

/** @param {string} stderr */
export function parseEbur128(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf("Summary:"));
  const lufs = /I:\s*(-?\d+(?:\.\d+)?) LUFS/.exec(summary);
  const peak = /True peak:[\s\S]*?Peak:\s*(-?\d+(?:\.\d+)?) dBFS/.exec(summary);
  const lra = /LRA:\s*(\d+(?:\.\d+)?) LU\b/.exec(summary);
  const version = /ffmpeg version ([^\s]+)/.exec(stderr)?.[1] ?? "unknown";
  return { loudness_lufs: lufs ? Number(lufs[1]) : null, true_peak_dbtp: peak ? Number(peak[1]) : null, loudness_range_lu: lra ? Number(lra[1]) : null, ffmpeg_version: version };
}

/** Один локальный проход ffmpeg; сбой не подменяется нулевыми значениями.
 * @param {string} path @param {AbortSignal} [signal] @returns {Promise<Record<string, any>>}
 */
export function measureLocalAudio(path, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("aborted")); return; }
    const meter = new EnvelopeMeter();
    const child = spawn("ffmpeg", ["-nostdin", "-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true", "-ac", "1", "-ar", String(RATE), "-f", "f32le", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "", pending = Buffer.alloc(0), failed = false, ffmpegVersion = "unknown";
    const abort = () => { failed = true; child.kill("SIGKILL"); };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, 120000);
    child.stderr.on("data", chunk => {
      stderr = (stderr + chunk.toString()).slice(-32768);
      if (ffmpegVersion === "unknown") ffmpegVersion = /ffmpeg version ([^\s]+)/.exec(stderr)?.[1] ?? "unknown";
    });
    child.stdout.on("data", chunk => {
      if (failed) return;
      const bytes = Buffer.concat([pending, chunk]);
      const end = bytes.length - bytes.length % 4;
      try { for (let i = 0; i < end; i += 4) meter.push(bytes.readFloatLE(i)); }
      catch { abort(); }
      pending = bytes.subarray(end);
    });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); };
    child.on("error", () => { cleanup(); reject(new Error("local_measurement_unavailable")); });
    child.on("close", code => {
      cleanup();
      if (code !== 0 || failed || pending.length || meter.count === 0) { reject(new Error("local_measurement_unavailable")); return; }
      const values = meter.finish();
      const loudness = parseEbur128(stderr);
      // Моно downmix может погасить противофазное стерео; это не доказательство
      // отсутствия громкости исходных каналов. Нижний предел ebur128 не публикуем.
      if (loudness.loudness_lufs !== null && loudness.loudness_lufs <= -70 && loudness.true_peak_dbtp === null) {
        loudness.loudness_lufs = null; loudness.loudness_range_lu = null;
      }
      resolve({ ...values, ...loudness, ffmpeg_version: ffmpegVersion });
    });
  });
}
