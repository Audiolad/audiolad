/**
 * Read-only view of a stored Music Analyzer result.
 * Numbers, labels, scores, and versions are taken from the JSON the Python
 * analyzer already wrote. This module does not estimate BPM, key, genre,
 * mood, or instruments.
 */

export type PassportTone = "high" | "medium" | "low";

export type PassportRow = {
  label: string;
  score: string | null;
  rank: number | null;
  bandLabel: string | null;
  tone: PassportTone | null;
};

export type PassportFact = {
  headline: string;
  lines: string[];
};

export type PassportMeasureStatus = "published" | "candidate" | "absent";

/**
 * Visual slots for tempo and key. Built from the same analyzer fields as
 * `PassportFact`. A candidate is never promoted to a published value.
 * `withheld` is set only when the payload itself leaves the published slot
 * empty, records a failed gate, or sets pulse_accepted / key_accepted to false.
 */
export type PassportMeasureDisplay = {
  primary: string | null;
  raw: string | null;
  secondary: string | null;
  status: PassportMeasureStatus;
  badge: "опубликовано" | "кандидат" | null;
  confidence: string | null;
  withheld: boolean;
};

export type PassportSources = {
  bpmPublished: string | null;
  bpmCandidate: string | null;
  bpmRaw: string | null;
  bpmConfidence: string | null;
  bpmGate: string | null;
  keyPublished: string | null;
  keyPublishedMode: string | null;
  keyCandidate: string | null;
  keyCandidateMode: string | null;
  genres: string | null;
  styles: string | null;
  moods: string | null;
  instruments: string | null;
  soundCharacter: string | null;
  duration: string | null;
  lufs: string | null;
  sampleRate: string | null;
  channels: string | null;
  format: string | null;
  taxonomy: string | null;
  prompt: string | null;
};

export type MusicAnalyzerPassport = {
  bpm: PassportFact;
  bpmDisplay: PassportMeasureDisplay;
  key: PassportFact;
  keyDisplay: PassportMeasureDisplay;
  genres: PassportRow[];
  styles: PassportRow[];
  moods: PassportRow[];
  instruments: PassportRow[];
  sound: PassportRow | null;
  technical: Array<{ label: string; value: string }>;
  taxonomy: string | null;
  prompt: string | null;
  sources: PassportSources;
};

type Found = {
  path: string;
  segments: string[];
  value: unknown;
};

const EMPTY_SOURCES: PassportSources = {
  bpmPublished: null,
  bpmCandidate: null,
  bpmRaw: null,
  bpmConfidence: null,
  bpmGate: null,
  keyPublished: null,
  keyPublishedMode: null,
  keyCandidate: null,
  keyCandidateMode: null,
  genres: null,
  styles: null,
  moods: null,
  instruments: null,
  soundCharacter: null,
  duration: null,
  lufs: null,
  sampleRate: null,
  channels: null,
  format: null,
  taxonomy: null,
  prompt: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function walk(value: unknown, segments: string[], into: Found[], depth: number): void {
  into.push({ path: segments.join("."), segments, value });
  if (depth > 8) return;
  if (Array.isArray(value)) {
    if (value.length > 80 || value.every((item) => typeof item === "number")) return;
    value.forEach((item, index) => {
      walk(item, [...segments, String(index)], into, depth + 1);
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    walk(value[key], [...segments, key], into, depth + 1);
  }
}

function collect(value: unknown): Found[] {
  const into: Found[] = [];
  walk(value, [], into, 0);
  return into;
}

function shortest(matches: Found[]): Found | null {
  if (matches.length === 0) return null;
  return [...matches].sort((left, right) => (
    left.segments.length - right.segments.length || left.path.localeCompare(right.path)
  ))[0] ?? null;
}

function segmentHas(segments: string[], pattern: RegExp): boolean {
  return segments.some((segment) => pattern.test(segment));
}

function formatQuantity(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (Number.isInteger(value)) return String(value);
    const text = String(value);
    if (/e/i.test(text)) {
      return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
    }
    return text;
  }
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  return null;
}

function cleanText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readBand(value: unknown): { tone: PassportTone | null; label: string | null } {
  const text = cleanText(value);
  if (!text) return { tone: null, label: null };
  const token = text.toLowerCase();
  if (token === "high" || token === "h" || token === "высокая" || token === "высокий") {
    return { tone: "high", label: "высокая" };
  }
  if (token === "medium" || token === "mid" || token === "med" || token === "средняя" || token === "средний") {
    return { tone: "medium", label: "средняя" };
  }
  if (token === "low" || token === "l" || token === "низкая" || token === "низкий") {
    return { tone: "low", label: "низкая" };
  }
  return { tone: null, label: text };
}

function readRank(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return null;
}

function readScore(record: Record<string, unknown>): string | null {
  for (const key of ["score", "probability", "weight"]) {
    const formatted = formatQuantity(record[key]);
    if (formatted) return formatted;
  }
  return null;
}

function readLabel(record: Record<string, unknown>): string | null {
  for (const key of ["label", "name", "tag", "title", "text", "genre", "style", "mood", "instrument", "id", "slug"]) {
    const text = cleanText(record[key]);
    if (text) return text;
  }
  const generic = cleanText(record.value);
  return generic;
}

function parseRow(value: unknown): PassportRow | null {
  if (typeof value === "string" && value.trim()) {
    return { label: value.trim().slice(0, 200), score: null, rank: null, bandLabel: null, tone: null };
  }
  if (!isRecord(value)) return null;
  const label = readLabel(value);
  if (!label) return null;
  const band = readBand(value.band ?? value.tier ?? value.level ?? value.confidence_band);
  return {
    label,
    score: readScore(value),
    rank: readRank(value.rank ?? value.position),
    bandLabel: band.label,
    tone: band.tone,
  };
}

function rowsFromValue(value: unknown): PassportRow[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const row = parseRow(item);
      return row ? [row] : [];
    });
  }
  if (typeof value === "string") {
    const row = parseRow(value);
    return row ? [row] : [];
  }
  if (!isRecord(value)) return [];
  const direct = parseRow(value);
  if (direct && (value.score != null || value.band != null || value.rank != null || value.label || value.name)) {
    return [direct];
  }
  for (const key of ["items", "top", "ranked", "labels", "predictions", "values"]) {
    if (key in value) {
      const nested = rowsFromValue(value[key]);
      if (nested.length > 0) return nested;
    }
  }
  const entries = Object.entries(value);
  if (entries.length > 0 && entries.every(([, entry]) => typeof entry === "number")) {
    return entries
      .map(([label, score]) => ({
        label,
        score: formatQuantity(score),
        rank: null,
        bandLabel: null,
        tone: null,
      }))
      .sort((left, right) => Number(right.score) - Number(left.score) || left.label.localeCompare(right.label));
  }
  return direct ? [direct] : [];
}

function orderRows(rows: PassportRow[]): PassportRow[] {
  if (!rows.some((row) => row.rank != null)) return rows;
  const indexed = rows.map((row, index) => ({ row, index }));
  indexed.sort((left, right) => {
    const leftRank = left.row.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = right.row.rank ?? Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.index - right.index;
  });
  return indexed.map((item) => item.row);
}

function findKeyed(nodes: Found[], keys: readonly string[]): Found | null {
  const matches = nodes.filter((node) => {
    const name = leaf(node.segments);
    return name.length > 0 && keys.includes(name);
  });
  if (matches.length === 0) return null;
  return [...matches].sort((left, right) => {
    const leftList = Array.isArray(left.value) || isRecord(left.value) ? 0 : 1;
    const rightList = Array.isArray(right.value) || isRecord(right.value) ? 0 : 1;
    const leftRank = keys.indexOf(leaf(left.segments));
    const rightRank = keys.indexOf(leaf(right.segments));
    return left.segments.length - right.segments.length
      || leftList - rightList
      || leftRank - rightRank
      || left.path.localeCompare(right.path);
  })[0] ?? null;
}

function groupedRows(nodes: Found[], groups: readonly string[]): PassportRow[] {
  const wanted = new Set(groups);
  const rows: PassportRow[] = [];
  for (const node of nodes) {
    if (!Array.isArray(node.value)) continue;
    for (const item of node.value) {
      if (!isRecord(item)) continue;
      const group = cleanText(item.group ?? item.kind ?? item.category ?? item.type ?? item.facet ?? item.slot);
      if (!group || !wanted.has(group.toLowerCase())) continue;
      const row = parseRow(item);
      if (row) rows.push(row);
    }
    if (rows.length > 0) return orderRows(rows);
  }
  return [];
}

function takeList(nodes: Found[], keys: readonly string[], groups: readonly string[], limit: number): {
  path: string | null;
  rows: PassportRow[];
} {
  const found = findKeyed(nodes, keys);
  const rows = found ? orderRows(rowsFromValue(found.value)) : [];
  if (rows.length > 0) return { path: found?.path ?? null, rows: rows.slice(0, limit) };
  const fallback = groupedRows(nodes, groups);
  return { path: fallback.length > 0 ? "grouped-tags" : null, rows: fallback.slice(0, limit) };
}

function leaf(segments: string[]): string {
  return segments[segments.length - 1] ?? "";
}

function parent(segments: string[]): string {
  return segments[segments.length - 2] ?? "";
}

function bpmKind(segments: string[]): "published" | "candidate" | "raw" | "confidence" | "gate" | "other" {
  const name = leaf(segments);
  const above = parent(segments);
  if (/confidence/i.test(name) && segmentHas(segments, /bpm|tempo/i)) return "confidence";
  if (/(^|_)gate($|_)|gate_passed|gate_status/i.test(name) && segmentHas(segments, /bpm|tempo/i)) return "gate";
  // Prefer explicit BPM raw fields (incl. bpm_candidate_raw) before generic "candidate".
  // Keep nested shapes like bpm.raw / tempo.raw_bpm.
  // Do not treat tempo_octave_score_raw / other score_*_raw as BPM raw.
  if (
    /^bpm_candidate_raw$/i.test(name)
    || /^bpm_raw$/i.test(name)
    || /^raw_bpm$/i.test(name)
    || /^measured_bpm$/i.test(name)
    || (/bpm/i.test(name) && /(^|_)raw($|_)/i.test(name) && !/score/i.test(name))
    || (/^raw$/i.test(name) && /^(bpm|tempo)$/i.test(above))
  ) return "raw";
  if (/candidate/i.test(name) && segmentHas(segments, /bpm|tempo/i)) return "candidate";
  if (/measurement|measured_bpm/i.test(name) && segmentHas(segments, /bpm|tempo/i)) return "raw";
  if (/candidate/i.test(above) && /^bpm$/i.test(name)) return "candidate";
  if (/raw|measurement/i.test(above) && /^bpm$/i.test(name)) return "raw";
  if (above === "technical" && name === "bpm") return "published";
  if (/^published_bpm$/i.test(name)) return "published";
  if (/^published$/i.test(name) && segmentHas(segments, /bpm|tempo/i)) return "published";
  return "other";
}

function isScalarQuantity(value: unknown): boolean {
  return value == null || formatQuantity(value) != null;
}

function confidenceLabel(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return `уверенность ${formatQuantity(value)}`;
  const text = cleanText(value);
  if (!text) return null;
  const token = text.toLowerCase().replace(/[\s-]+/g, "_");
  if (token === "low" || token === "low_confidence" || token === "низкая") return "низкая уверенность";
  if (token === "medium" || token === "mid" || token === "medium_confidence" || token === "средняя") {
    return "средняя уверенность";
  }
  if (token === "high" || token === "high_confidence" || token === "высокая") return "высокая уверенность";
  return text;
}

function isFalseFlag(value: unknown): boolean {
  if (value === false) return true;
  if (typeof value === "string" && value.trim().toLowerCase() === "false") return true;
  return false;
}

function hasFalseFlag(nodes: Found[], field: string): boolean {
  const wanted = field.toLowerCase();
  return nodes.some((node) => leaf(node.segments).toLowerCase() === wanted && isFalseFlag(node.value));
}

function isExplicitEmpty(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function measureDisplay(input: {
  published: string | null;
  candidate: string | null;
  raw: string | null;
  confidence: string | null;
  withheld: boolean;
}): PassportMeasureDisplay {
  if (input.published) {
    return {
      primary: input.published,
      raw: input.raw,
      secondary: input.candidate && input.candidate !== input.published ? input.candidate : null,
      status: "published",
      badge: "опубликовано",
      confidence: input.confidence,
      withheld: false,
    };
  }
  if (input.candidate) {
    return {
      primary: input.candidate,
      raw: input.raw,
      secondary: null,
      status: "candidate",
      badge: "кандидат",
      confidence: input.confidence,
      withheld: input.withheld,
    };
  }
  return {
    primary: null,
    raw: input.raw,
    secondary: null,
    status: "absent",
    badge: null,
    confidence: input.confidence,
    withheld: input.withheld,
  };
}

function gateLabel(value: unknown): string | null {
  if (value === true) return "опубликован";
  if (value === false) return "не опубликован";
  const text = cleanText(value);
  if (!text) return null;
  const token = text.toLowerCase().replace(/[\s-]+/g, "_");
  if (
    token === "passed"
    || token === "pass"
    || token === "published"
    || token === "ok"
  ) return "опубликован";
  if (
    token === "not_published"
    || token === "unpublished"
    || token === "not_passed"
    || token === "failed"
    || token === "rejected"
    || token === "low_confidence"
  ) return "не опубликован";
  return text;
}

function quantityNode(nodes: Found[], kind: "candidate" | "raw" | "confidence" | "gate"): Found | null {
  return shortest(nodes.filter((node) => bpmKind(node.segments) === kind && (
    kind === "confidence" || kind === "gate" || formatQuantity(node.value) != null
  )));
}

function readBpm(nodes: Found[]): {
  fact: PassportFact;
  display: PassportMeasureDisplay;
  sources: Pick<PassportSources, "bpmPublished" | "bpmCandidate" | "bpmRaw" | "bpmConfidence" | "bpmGate">;
} {
  const publishedMatches = nodes.filter((node) => (
    bpmKind(node.segments) === "published" && isScalarQuantity(node.value)
  ));
  const publishedNode = publishedMatches.find((node) => (
    parent(node.segments) === "technical" && leaf(node.segments) === "bpm"
  )) ?? shortest(publishedMatches);
  const published = publishedNode ? formatQuantity(publishedNode.value) : null;
  const candidateNode = quantityNode(nodes, "candidate");
  const rawNode = quantityNode(nodes, "raw");
  const confidenceNode = quantityNode(nodes, "confidence");
  const gateNode = quantityNode(nodes, "gate");
  const candidate = candidateNode ? formatQuantity(candidateNode.value) : null;
  const raw = rawNode ? formatQuantity(rawNode.value) : null;
  const confidence = confidenceNode ? confidenceLabel(confidenceNode.value) : null;
  let gate = gateNode ? gateLabel(gateNode.value) : null;
  const publishedSlotEmpty = publishedNode != null && published == null;
  if (!published && (publishedSlotEmpty || candidate || raw) && gate !== "опубликован") {
    gate = gate ?? "не опубликован";
  }
  if (published && !gateNode) gate = null;

  const lines: string[] = [];
  let headline = "—";
  if (published) {
    headline = `${published} BPM`;
    if (candidate && candidate !== published) lines.push(`кандидат: ${candidate} BPM`);
    if (raw) lines.push(`raw ${raw}`);
  } else if (candidate) {
    headline = `${candidate} BPM · кандидат`;
    if (raw) lines.push(`raw ${raw}`);
    lines.push("опубликовано: —");
  } else if (raw) {
    lines.push(`raw ${raw}`);
    lines.push("опубликовано: —");
  }
  const status = [confidence, published ? null : gate].filter((item): item is string => Boolean(item));
  if (published && gate === "опубликован") status.push(gate);
  if (status.length > 0) lines.push(status.join(" · "));

  const explicitGateWithheld = gateNode != null && gate === "не опубликован";
  const withheld = !published && (
    publishedSlotEmpty
    || explicitGateWithheld
    || hasFalseFlag(nodes, "pulse_accepted")
  );

  return {
    fact: { headline, lines },
    display: measureDisplay({
      published,
      candidate,
      raw,
      confidence,
      withheld,
    }),
    sources: {
      bpmPublished: publishedNode?.path ?? null,
      bpmCandidate: candidateNode?.path ?? null,
      bpmRaw: rawNode?.path ?? null,
      bpmConfidence: confidenceNode?.path ?? null,
      bpmGate: gateNode?.path ?? null,
    },
  };
}

function keyKind(segments: string[]): "published" | "candidate" | "published-mode" | "candidate-mode" | "other" {
  const name = leaf(segments);
  const above = parent(segments);
  if (/candidate_mode/i.test(name) || (/^mode$/i.test(name) && /candidate/i.test(above))) return "candidate-mode";
  if (/published_mode/i.test(name) || (/^mode$/i.test(name) && (/published/i.test(above) || above === "technical"))) {
    return "published-mode";
  }
  if (/candidate/i.test(name) && segmentHas(segments, /key|tonal|mode/i)) return "candidate";
  if (/^candidate_(key|tonality)$/i.test(name)) return "candidate";
  if (/candidate/i.test(above) && /^(key|musical_key|tonality)$/i.test(name)) return "candidate";
  if (above === "technical" && /^(key|musical_key|tonality)$/i.test(name)) return "published";
  if (/^published_(key|tonality)$/i.test(name)) return "published";
  if (/^published$/i.test(name) && segmentHas(segments, /key|tonal/i)) return "published";
  return "other";
}

function joinKeyMode(key: string | null, mode: string | null): string | null {
  if (!key && !mode) return null;
  if (key && mode) {
    if (key.toLowerCase().includes(mode.toLowerCase())) return key;
    return `${key} ${mode}`;
  }
  return key ?? mode;
}

function siblingMode(nodes: Found[], node: Found | null): Found | null {
  if (!node) return null;
  const prefix = node.segments.slice(0, -1).join(".");
  return shortest(nodes.filter((item) => {
    if (item.segments.slice(0, -1).join(".") !== prefix) return false;
    if (!/^mode$/i.test(leaf(item.segments))) return false;
    return cleanText(item.value) != null;
  }));
}

function readKey(nodes: Found[]): {
  fact: PassportFact;
  display: PassportMeasureDisplay;
  sources: Pick<PassportSources, "keyPublished" | "keyPublishedMode" | "keyCandidate" | "keyCandidateMode">;
} {
  const publishedNode = shortest(nodes.filter((node) => keyKind(node.segments) === "published" && cleanText(node.value)));
  const publishedModeNode = shortest(nodes.filter((node) => keyKind(node.segments) === "published-mode" && cleanText(node.value)))
    ?? siblingMode(nodes, publishedNode);
  const candidateNode = shortest(nodes.filter((node) => keyKind(node.segments) === "candidate" && cleanText(node.value)));
  const candidateModeNode = shortest(nodes.filter((node) => keyKind(node.segments) === "candidate-mode" && cleanText(node.value)))
    ?? siblingMode(nodes, candidateNode);
  const published = publishedNode
    ? joinKeyMode(cleanText(publishedNode.value), publishedModeNode ? cleanText(publishedModeNode.value) : null)
    : null;
  const candidate = candidateNode
    ? joinKeyMode(cleanText(candidateNode.value), candidateModeNode ? cleanText(candidateModeNode.value) : null)
    : null;
  const lines: string[] = [];
  let headline = "—";
  if (published) {
    headline = published;
    if (candidate && candidate !== published) lines.push(`кандидат: ${candidate}`);
  } else if (candidate) {
    headline = `${candidate} · кандидат`;
    lines.push("опубликовано: —");
  }
  const withheld = !published && (
    nodes.some((node) => keyKind(node.segments) === "published" && isExplicitEmpty(node.value))
    || hasFalseFlag(nodes, "key_accepted")
  );

  return {
    fact: { headline, lines },
    display: measureDisplay({
      published,
      candidate,
      raw: null,
      confidence: null,
      withheld,
    }),
    sources: {
      keyPublished: publishedNode?.path ?? null,
      keyPublishedMode: publishedModeNode?.path ?? null,
      keyCandidate: candidateNode?.path ?? null,
      keyCandidateMode: candidateModeNode?.path ?? null,
    },
  };
}

function technicalValue(nodes: Found[], keys: readonly string[]): Found | null {
  const technical = nodes.filter((node) => node.segments.includes("technical") && keys.includes(leaf(node.segments)));
  return shortest(technical.length > 0 ? technical : nodes.filter((node) => keys.includes(leaf(node.segments))));
}

function readTechnical(nodes: Found[]): {
  rows: Array<{ label: string; value: string }>;
  sources: Pick<PassportSources, "duration" | "lufs" | "sampleRate" | "channels" | "format">;
} {
  const duration = technicalValue(nodes, ["duration", "duration_s", "duration_sec", "duration_seconds", "duration_ms"]);
  const lufs = technicalValue(nodes, ["lufs", "integrated_lufs", "loudness_lufs"]);
  const sampleRate = technicalValue(nodes, ["sample_rate", "sampleRate", "sampling_rate"]);
  const channels = technicalValue(nodes, ["channels", "channel_count", "channels_count", "n_channels"]);
  const format = technicalValue(nodes, ["format", "audio_format", "container"]);
  const durationText = formatQuantity(duration?.value);
  const durationName = duration ? leaf(duration.segments) : "";
  const durationUnit = durationName === "duration_ms"
    ? " мс"
    : durationText && /duration_(s|sec|seconds)$/.test(durationName)
      ? " с"
      : "";
  return {
    rows: [
      { label: "Длительность", value: durationText ? `${durationText}${durationUnit}` : "—" },
      { label: "LUFS", value: formatQuantity(lufs?.value) ?? "—" },
      { label: "Частота дискретизации", value: formatQuantity(sampleRate?.value) ? `${formatQuantity(sampleRate?.value)} Гц` : "—" },
      { label: "Каналы", value: formatQuantity(channels?.value) ?? "—" },
      { label: "Формат", value: cleanText(format?.value) ?? "—" },
    ],
    sources: {
      duration: duration?.path ?? null,
      lufs: lufs?.path ?? null,
      sampleRate: sampleRate?.path ?? null,
      channels: channels?.path ?? null,
      format: format?.path ?? null,
    },
  };
}

function versionMatch(segments: string[], kind: "taxonomy" | "prompt"): boolean {
  const name = leaf(segments);
  const above = parent(segments);
  if (kind === "taxonomy") {
    return name === "taxonomy_version"
      || name === "taxonomyVersion"
      || (name === "version" && above === "taxonomy")
      || (name === "taxonomy" && above === "versions");
  }
  return name === "prompt_version"
    || name === "promptVersion"
    || (name === "version" && above === "prompt")
    || (name === "prompt" && above === "versions");
}

function findVersion(nodes: Found[], kind: "taxonomy" | "prompt"): { path: string; text: string } | null {
  const matches = nodes.filter((node) => versionMatch(node.segments, kind) && cleanText(node.value));
  const found = shortest(matches);
  const text = found ? cleanText(found.value) : null;
  return found && text ? { path: found.path, text } : null;
}

function columnText(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, 200);
}

export function readMusicAnalyzerPassport(input: {
  normalized: unknown;
  raw?: unknown;
  taxonomyVersion?: string | null;
  promptVersion?: string | null;
}): MusicAnalyzerPassport {
  const nodes = collect(input.normalized);
  const bpm = readBpm(nodes);
  const key = readKey(nodes);
  const genres = takeList(nodes, ["genres", "genre_top", "top_genres", "genre"], ["genre", "genres", "genre_class"], 3);
  const styles = takeList(nodes, ["styles", "style_top", "top_styles", "style"], ["style", "styles"], 3);
  const moods = takeList(nodes, ["moods", "mood_top", "top_moods", "mood"], ["mood", "moods"], 5);
  const instruments = takeList(nodes, ["instruments", "instrument_top", "top_instruments", "instrument"], ["instrument", "instruments"], 10);
  const soundFound = findKeyed(nodes, ["sound_character", "soundCharacter", "sound_characters"]);
  const soundRows = soundFound ? orderRows(rowsFromValue(soundFound.value)) : groupedRows(nodes, ["sound_character", "sound"]);
  const technical = readTechnical(nodes);
  const taxonomyHit = findVersion(nodes, "taxonomy") ?? findVersion(collect(input.raw), "taxonomy");
  const promptHit = findVersion(nodes, "prompt") ?? findVersion(collect(input.raw), "prompt");
  const taxonomy = columnText(input.taxonomyVersion) ?? taxonomyHit?.text ?? null;
  const prompt = columnText(input.promptVersion) ?? promptHit?.text ?? null;
  return {
    bpm: bpm.fact,
    bpmDisplay: bpm.display,
    key: key.fact,
    keyDisplay: key.display,
    genres: genres.rows,
    styles: styles.rows,
    moods: moods.rows,
    instruments: instruments.rows,
    sound: soundRows[0] ?? null,
    technical: technical.rows,
    taxonomy,
    prompt,
    sources: {
      ...EMPTY_SOURCES,
      ...bpm.sources,
      ...key.sources,
      ...technical.sources,
      genres: genres.path,
      styles: styles.path,
      moods: moods.path,
      instruments: instruments.path,
      soundCharacter: soundFound?.path ?? (soundRows[0] ? "grouped-tags" : null),
      taxonomy: columnText(input.taxonomyVersion) ? "column" : taxonomyHit?.path ?? null,
      prompt: columnText(input.promptVersion) ? "column" : promptHit?.path ?? null,
    },
  };
}

/**
 * Structured copy of analyzer fields. Published BPM/key stay separate from
 * candidate and raw. This does not estimate a new tempo, key, or tag.
 */
export type MusicAnalyzerLabelFact = {
  label: string;
  score: number | null;
};

export type MusicAnalyzerStructuredFacts = {
  bpm: {
    published: number | null;
    candidate: number | null;
    raw: number | null;
    confidence: number | null;
  };
  key: {
    published: string | null;
    publishedMode: string | null;
    candidate: string | null;
    candidateMode: string | null;
  };
  genres: MusicAnalyzerLabelFact[];
  styles: MusicAnalyzerLabelFact[];
  moods: MusicAnalyzerLabelFact[];
  instruments: MusicAnalyzerLabelFact[];
  soundCharacter: MusicAnalyzerLabelFact | null;
  loudnessLufs: number | null;
  energy: number | null;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function unitConfidence(value: unknown): number | null {
  const number = finiteNumber(value);
  if (number == null || number < 0 || number > 1) return null;
  return number;
}

function labelFacts(rows: PassportRow[]): MusicAnalyzerLabelFact[] {
  return rows.map((row) => {
    const score = row.score == null ? null : finiteNumber(row.score);
    return { label: row.label, score };
  });
}

export function readMusicAnalyzerStructuredFacts(normalized: unknown): MusicAnalyzerStructuredFacts {
  const nodes = collect(normalized);
  const publishedMatches = nodes.filter((node) => (
    bpmKind(node.segments) === "published" && isScalarQuantity(node.value)
  ));
  const publishedNode = publishedMatches.find((node) => (
    parent(node.segments) === "technical" && leaf(node.segments) === "bpm"
  )) ?? shortest(publishedMatches);
  const candidateNode = quantityNode(nodes, "candidate");
  const rawNode = quantityNode(nodes, "raw");
  const confidenceNode = quantityNode(nodes, "confidence");
  const publishedKeyNode = shortest(nodes.filter((node) => (
    keyKind(node.segments) === "published" && cleanText(node.value)
  )));
  const publishedModeNode = shortest(nodes.filter((node) => (
    keyKind(node.segments) === "published-mode" && cleanText(node.value)
  ))) ?? siblingMode(nodes, publishedKeyNode);
  const candidateKeyNode = shortest(nodes.filter((node) => (
    keyKind(node.segments) === "candidate" && cleanText(node.value)
  )));
  const candidateModeNode = shortest(nodes.filter((node) => (
    keyKind(node.segments) === "candidate-mode" && cleanText(node.value)
  ))) ?? siblingMode(nodes, candidateKeyNode);
  const genres = takeList(nodes, ["genres", "genre_top", "top_genres", "genre"], ["genre", "genres", "genre_class"], 3);
  const styles = takeList(nodes, ["styles", "style_top", "top_styles", "style"], ["style", "styles"], 3);
  const moods = takeList(nodes, ["moods", "mood_top", "top_moods", "mood"], ["mood", "moods"], 5);
  const instruments = takeList(
    nodes,
    ["instruments", "instrument_top", "top_instruments", "instrument"],
    ["instrument", "instruments"],
    10,
  );
  const soundFound = findKeyed(nodes, ["sound_character", "soundCharacter", "sound_characters"]);
  const soundRows = soundFound ? orderRows(rowsFromValue(soundFound.value)) : groupedRows(nodes, ["sound_character", "sound"]);
  const lufs = technicalValue(nodes, ["lufs", "integrated_lufs", "loudness_lufs"]);
  const energy = technicalValue(nodes, ["energy"]);
  const sound = labelFacts(soundRows)[0] ?? null;
  return {
    bpm: {
      published: publishedNode ? finiteNumber(publishedNode.value) : null,
      candidate: candidateNode ? finiteNumber(candidateNode.value) : null,
      raw: rawNode ? finiteNumber(rawNode.value) : null,
      confidence: confidenceNode ? unitConfidence(confidenceNode.value) : null,
    },
    key: {
      published: publishedKeyNode ? cleanText(publishedKeyNode.value) : null,
      publishedMode: publishedModeNode ? cleanText(publishedModeNode.value) : null,
      candidate: candidateKeyNode ? cleanText(candidateKeyNode.value) : null,
      candidateMode: candidateModeNode ? cleanText(candidateModeNode.value) : null,
    },
    genres: labelFacts(genres.rows),
    styles: labelFacts(styles.rows),
    moods: labelFacts(moods.rows),
    instruments: labelFacts(instruments.rows),
    soundCharacter: sound,
    loudnessLufs: lufs ? finiteNumber(lufs.value) : null,
    energy: energy ? finiteNumber(energy.value) : null,
  };
}
