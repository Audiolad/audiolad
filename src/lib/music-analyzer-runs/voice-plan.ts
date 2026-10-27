import { MUSIC_ANALYZER_VOICE_CANARY_MAX_DEFAULT } from "./constants";

export type VoiceDetectorMode = "off" | "canary" | "on";

export type VoiceDetectorFlag = "legacy" | "panns";

export type VoiceLogStatus = "legacy" | "ok" | "unavailable" | "timeout";

export type VoiceChoice = {
  mode: VoiceDetectorMode;
  flag: VoiceDetectorFlag;
  invoke: boolean;
  withholdClap: boolean;
  reason: string;
};

export type MusicAnalyzerVoiceLog = {
  mode: VoiceDetectorMode;
  status: VoiceLogStatus;
  reason: string;
  analysis_seconds: number;
  voice_seconds: number | null;
  error: string | null;
};

/** Lets a passport link land after enqueue before a new upload is treated as primary. */
export const VOICE_PASSPORT_LINK_GRACE_MS = 2_000;

const PRIMARY_MIMES = new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/wave"]);

const VOICE_ELAPSED_KEYS = ["elapsed_s", "voice_seconds", "seconds", "duration_s"] as const;

export function parseVoiceDetectorMode(value: string | undefined): VoiceDetectorMode {
  const trimmed = value?.trim().toLowerCase();
  if (trimmed === "canary" || trimmed === "on") return trimmed;
  return "off";
}

export function parseVoiceCanaryMax(value: string | undefined): number {
  if (typeof value !== "string" || !value.trim()) return MUSIC_ANALYZER_VOICE_CANARY_MAX_DEFAULT;
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
    return MUSIC_ANALYZER_VOICE_CANARY_MAX_DEFAULT;
  }
  return parsed;
}

export function voiceRuntimeReady(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.MUSIC_ANALYZER_VOICE_PYTHON?.trim() && env.MUSIC_ANALYZER_PANNS_CHECKPOINT?.trim());
}

export function isPrimaryNewUpload(input: {
  versionNumber: number | null;
  mimeType: string | null;
  passportLinked: boolean | null;
}): boolean {
  if (input.passportLinked !== false) return false;
  if (input.versionNumber !== 1) return false;
  const mime = (input.mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  return PRIMARY_MIMES.has(mime);
}

export function chooseVoiceDetector(input: {
  mode: VoiceDetectorMode;
  canaryMax: number;
  sealedPannsCount: number | null;
  primaryNewUpload: boolean;
  runtimeReady: boolean;
}): VoiceChoice {
  if (input.mode === "off") {
    return { mode: "off", flag: "legacy", invoke: false, withholdClap: false, reason: "mode_off" };
  }
  if (!input.primaryNewUpload) {
    return {
      mode: input.mode,
      flag: "legacy",
      invoke: false,
      withholdClap: false,
      reason: "not_primary_upload",
    };
  }
  if (input.mode === "canary") {
    if (input.sealedPannsCount === null) {
      return {
        mode: "canary",
        flag: "legacy",
        invoke: false,
        withholdClap: false,
        reason: "count_unavailable",
      };
    }
    if (input.sealedPannsCount >= input.canaryMax) {
      return { mode: "canary", flag: "legacy", invoke: false, withholdClap: false, reason: "canary_full" };
    }
  }
  if (!input.runtimeReady) {
    return {
      mode: input.mode,
      flag: "legacy",
      invoke: false,
      withholdClap: true,
      reason: "voice_runtime_missing",
    };
  }
  return {
    mode: input.mode,
    flag: "panns",
    invoke: true,
    withholdClap: true,
    reason: input.mode,
  };
}

export async function resolveVoiceChoice(input: {
  env: NodeJS.ProcessEnv;
  versionNumber: number | null;
  mimeType: string | null;
  runId: string;
  lookup: {
    passportLinked(runId: string): Promise<boolean | null>;
    countInvoked(): Promise<number | null>;
  };
  wait?: (ms: number) => Promise<void>;
  graceMs?: number;
}): Promise<VoiceChoice> {
  const mode = parseVoiceDetectorMode(input.env.MUSIC_ANALYZER_VOICE_DETECTOR);
  const canaryMax = parseVoiceCanaryMax(input.env.MUSIC_ANALYZER_VOICE_CANARY_MAX);
  const runtimeReady = voiceRuntimeReady(input.env);
  if (mode === "off") {
    return chooseVoiceDetector({
      mode,
      canaryMax,
      sealedPannsCount: 0,
      primaryNewUpload: false,
      runtimeReady,
    });
  }
  const firstLink = await input.lookup.passportLinked(input.runId);
  let passportLinked = firstLink;
  if (firstLink === false) {
    const wait = input.wait ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    await wait(input.graceMs ?? VOICE_PASSPORT_LINK_GRACE_MS);
    passportLinked = await input.lookup.passportLinked(input.runId);
  }
  const primaryNewUpload = isPrimaryNewUpload({
    versionNumber: input.versionNumber,
    mimeType: input.mimeType,
    passportLinked,
  });
  const sealedPannsCount = mode === "canary" && primaryNewUpload
    ? await input.lookup.countInvoked()
    : 0;
  return chooseVoiceDetector({
    mode,
    canaryMax,
    sealedPannsCount,
    primaryNewUpload,
    runtimeReady,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function readDetectorSignals(normalized: unknown): {
  present: boolean;
  status: string | null;
  reason: string | null;
  voiceSeconds: number | null;
} {
  const vocal = isRecord(normalized) ? normalized.vocal : null;
  const detector = isRecord(vocal) && Object.hasOwn(vocal, "detector") ? vocal.detector : undefined;
  if (!isRecord(vocal) || !Object.hasOwn(vocal, "detector")) {
    return { present: false, status: null, reason: null, voiceSeconds: null };
  }
  const status = isRecord(detector) && typeof detector.status === "string" ? detector.status : null;
  const reason = isRecord(detector) && typeof detector.reason === "string" ? detector.reason : null;
  let voiceSeconds: number | null = null;
  if (isRecord(detector)) {
    for (const key of VOICE_ELAPSED_KEYS) {
      const value = detector[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
        voiceSeconds = value;
        break;
      }
    }
  }
  return { present: true, status, reason, voiceSeconds };
}

export function withWithheldVoiceDetector(
  normalized: Record<string, unknown>,
  reason: string,
): Record<string, unknown> {
  const signals = readDetectorSignals(normalized);
  if (signals.present) return normalized;
  const vocal = isRecord(normalized.vocal) ? { ...normalized.vocal } : {};
  vocal.detector = {
    rule: "panns-voice:2",
    status: "unavailable",
    windows: [],
    reason: safeToken(reason),
  };
  return { ...normalized, vocal };
}

export function analysisSeconds(startedAtMs: number, finishedAtMs: number): number {
  const seconds = Math.max(0, finishedAtMs - startedAtMs) / 1000;
  return Math.round(seconds * 1000) / 1000;
}

function safeToken(value: string): string {
  const cleaned = value.replace(/[^\w.:-]+/g, "_").slice(0, 80);
  return cleaned || "unknown";
}

export function buildVoiceLog(input: {
  choice: VoiceChoice;
  analysisSeconds: number;
  voiceSeconds: number | null;
  detectorStatus: string | null;
  detectorReason: string | null;
  detectorError: string | null;
}): MusicAnalyzerVoiceLog {
  const analysis_seconds = Number.isFinite(input.analysisSeconds) && input.analysisSeconds >= 0
    ? Math.round(input.analysisSeconds * 1000) / 1000
    : 0;
  const voice_seconds = typeof input.voiceSeconds === "number"
    && Number.isFinite(input.voiceSeconds)
    && input.voiceSeconds >= 0
    ? input.voiceSeconds
    : null;
  const detectorTimedOut = input.detectorStatus === "timeout"
    || (typeof input.detectorReason === "string" && /timeout/i.test(input.detectorReason))
    || input.detectorError === "detector_timeout";
  if (!input.choice.invoke && !input.choice.withholdClap) {
    return {
      mode: input.choice.mode,
      status: "legacy",
      reason: safeToken(input.choice.reason),
      analysis_seconds,
      voice_seconds,
      error: null,
    };
  }
  if (detectorTimedOut) {
    return {
      mode: input.choice.mode,
      status: "timeout",
      reason: "detector_timeout",
      analysis_seconds,
      voice_seconds,
      error: "detector_timeout",
    };
  }
  if (input.detectorError) {
    const token = safeToken(input.detectorError);
    return {
      mode: input.choice.mode,
      status: "unavailable",
      reason: token,
      analysis_seconds,
      voice_seconds,
      error: token,
    };
  }
  if (input.detectorStatus === "ok" && input.choice.invoke) {
    return {
      mode: input.choice.mode,
      status: "ok",
      reason: safeToken(input.choice.reason),
      analysis_seconds,
      voice_seconds,
      error: null,
    };
  }
  return {
    mode: input.choice.mode,
    status: "unavailable",
    reason: safeToken(input.choice.reason),
    analysis_seconds,
    voice_seconds,
    error: null,
  };
}

export function formatMusicAnalyzerVoiceLog(voice: MusicAnalyzerVoiceLog): string {
  return JSON.stringify({
    event: "music_analyzer_voice",
    mode: voice.mode,
    status: voice.status,
    reason: voice.reason,
    analysis_seconds: voice.analysis_seconds,
    voice_seconds: voice.voice_seconds,
    error: voice.error,
  });
}
