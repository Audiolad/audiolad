import { spawn } from "node:child_process";
import { LOCAL_VERSION } from "./features.mjs";

const RATE = 8000;
const FRAME = 400;
const FFT_SIZE = 512;
const clamp = (/** @type {number} */ v) => Math.max(0, Math.min(1, v));
const window = Float64Array.from({ length: FRAME }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME - 1)));

/** In-place radix-2 FFT of a Hann-windowed 50 ms frame, zero padded to 512.
 * Only 20 small transforms/second; no dependency or full-audio buffer.
 * @param {Float64Array} samples @param {Float64Array} re @param {Float64Array} im
 */
function spectrum(samples, re, im) {
  re.fill(0); im.fill(0);
  for (let i = 0; i < FRAME; i++) re[i] = samples[i] * window[i];
  for (let i = 1, j = 0; i < FFT_SIZE; i++) {
    let bit = FFT_SIZE >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= FFT_SIZE; len <<= 1) {
    const cr = Math.cos(-2 * Math.PI / len), ci = Math.sin(-2 * Math.PI / len);
    for (let start = 0; start < FFT_SIZE; start += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = start + j, b = a + len / 2;
        const tr = wr * re[b] - wi * im[b], ti = wr * im[b] + wi * re[b];
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const next = wr * cr - wi * ci; wi = wr * ci + wi * cr; wr = next;
      }
    }
  }
}

/** Streaming mono descriptors. All energy inputs are ratios: multiplying the
 * signal by any nonzero constant cancels algebraically, without a LUFS pass.
 * LUFS/peaks remain independent technical measurements of the original audio.
 */
export class EnvelopeMeter {
  count = 0; sum = 0; peak = 0; frameCount = 0; frameSum = 0;
  /** @type {number[]} */ frames = [];
  /** @type {number[]} */ fluxes = [];
  spectralSum = 0; fluxSum = 0; lowFluxSum = 0; transientSum = 0; centroidSum = 0;
  samples = new Float64Array(FRAME);
  re = new Float64Array(FFT_SIZE); im = new Float64Array(FFT_SIZE);
  previous = new Float64Array(FFT_SIZE / 2);
  /** @param {number} sample */
  push(sample) {
    if (!Number.isFinite(sample)) throw new Error("invalid_pcm");
    this.count++; this.sum += sample * sample; this.peak = Math.max(this.peak, Math.abs(sample));
    this.samples[this.frameCount++] = sample; this.frameSum += sample * sample;
    if (this.frameCount === FRAME) {
      if (this.frames.length >= 72000) throw new Error("local_audio_limit"); // One hour, bounded memory.
      this.frames.push(Math.sqrt(this.frameSum / FRAME));
      spectrum(this.samples, this.re, this.im);
      let flux = 0;
      for (let k = 1; k < FFT_SIZE / 2; k++) {
        const magnitude = Math.hypot(this.re[k], this.im[k]);
        const rise = Math.max(0, magnitude - this.previous[k]);
        this.spectralSum += magnitude;
        this.centroidSum += magnitude * k * RATE / FFT_SIZE;
        // Skip the first frame: starting a sustained tone is not percussion.
        if (this.frames.length > 1) {
          flux += rise;
          this.transientSum += Math.max(0, magnitude - 2 * this.previous[k]);
          if (k * RATE / FFT_SIZE <= 250) this.lowFluxSum += rise;
        }
        this.previous[k] = magnitude;
      }
      this.fluxSum += flux; this.fluxes.push(flux);
      this.frameCount = 0; this.frameSum = 0;
    }
  }
  finish() {
    const db = (/** @type {number} */ x) => x > 0 ? 20 * Math.log10(x) : null;
    const rms = this.count ? Math.sqrt(this.sum / this.count) : 0;
    // Relative activity floor: no gain-dependent silence gate.
    const active = this.frames.filter(v => v > rms * 0.01 && v > 0).map(v => /** @type {number} */ (db(v))).sort((a, b) => a - b);
    const spread = active.length >= 20 ? active[Math.floor((active.length - 1) * 0.95)] - active[Math.floor((active.length - 1) * 0.1)] : null;
    const spectralMean = this.spectralSum / (this.frames.length || 1);
    const envelope = this.fluxes.map(v => spectralMean > 0 ? v / spectralMean : 0);
    const mean = envelope.reduce((a, b) => a + b, 0) / (envelope.length || 1);
    const rises = this.frames.map((v, i, a) => i ? Math.max(0, v - a[i - 1]) : 0);
    const maxRise = rises.reduce((a, b) => Math.max(a, b), 0);
    let attacks = 0;
    for (let i = 1; i < rises.length - 1; i++) if (rises[i] > Math.max(rms * 0.12, maxRise * 0.2) && rises[i] >= rises[i - 1] && rises[i] > rises[i + 1]) attacks++;
    const centered = envelope.map(v => v - mean);
    let periodicity = 0;
    // 40–240 pulses/minute; normalized flux autocorrelation, not model confidence.
    if (this.frames.length >= 200 && attacks >= 3) for (let lag = 5; lag <= 30; lag++) {
      let dot = 0, left = 0, right = 0;
      for (let i = lag; i < centered.length; i++) { dot += centered[i] * centered[i - lag]; left += centered[i] ** 2; right += centered[i - lag] ** 2; }
      if (left * right > 0) periodicity = Math.max(periodicity, dot / Math.sqrt(left * right));
    }
    const duration = this.count / RATE;
    const density = duration ? attacks / duration : 0;
    const ratio = (/** @type {number} */ x) => this.spectralSum > 0 ? x / this.spectralSum : 0;
    const flux = ratio(this.fluxSum), low = ratio(this.lowFluxSum), percussive = ratio(this.transientSum);
    const centroid = ratio(this.centroidSum);
    // Most weight belongs to repeated change/percussion. Brightness and relative
    // dynamics only support activity, so a bright sustained pad stays low.
    const activity = clamp((flux - 0.10) / 0.30);
    const energy = rms === 0 ? 0 : Math.round(100 * (
      0.20 * clamp(density / 4) + 0.30 * activity
      + 0.25 * clamp((percussive - 0.03) / 0.27)
      + 0.10 * clamp(low / 0.20) * activity
      + 0.05 * clamp(periodicity / 0.7) * activity
      + 0.05 * clamp(centroid / 2000) * activity
      + 0.05 * clamp((spread ?? 0) / 12) * activity));
    return {
      duration_s: duration, rms_dbfs: db(rms), sample_peak_dbfs: db(this.peak), dynamic_spread_db: spread,
      onset_density: density, rhythm_salience: clamp(periodicity),
      spectral_flux: flux, low_band_onset_ratio: low, percussive_ratio: percussive,
      local_spectral_centroid_hz: centroid, energy_0_100: energy,
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
