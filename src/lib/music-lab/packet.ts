import { readFileSync } from "node:fs";
import path from "node:path";

import { csvObjects } from "@/lib/music-lab/csv";

export const BLIND_SYSTEM_CODES = ["clap_native", "openl3"] as const;

export type BlindSystemCode = (typeof BLIND_SYSTEM_CODES)[number];

export type ListeningTrack = {
  trackId: string;
  filename: string;
};

export type SimilarityPacketRow = {
  seedId: string;
  slot: "A" | "B";
  rank: number;
  neighbourId: string;
  neighbourFilename: string;
};

export type BlindKeyMap = Record<string, { A: BlindSystemCode; B: BlindSystemCode }>;

export type ListeningPacket = {
  version: string;
  listenTracks: ListeningTrack[];
  similarityRows: SimilarityPacketRow[];
  similaritySeedIds: string[];
  bpmTracks: ListeningTrack[];
  filenamesByTrackId: Map<string, string>;
};

function isBlindSystem(value: string): value is BlindSystemCode {
  return (BLIND_SYSTEM_CODES as readonly string[]).includes(value);
}

function requireFilename(trackId: string, filename: string): ListeningTrack {
  const trimmedId = trackId.trim();
  const trimmedName = filename.trim();
  if (!trimmedId || !trimmedName) {
    throw new Error("music_lab_packet_invalid");
  }
  return { trackId: trimmedId, filename: trimmedName };
}

export function parseListeningPacketFiles(files: {
  trackSetJson: string;
  listenCsv: string;
  similarityCsv: string;
  bpmCsv: string;
}): ListeningPacket {
  const trackSet = JSON.parse(files.trackSetJson) as {
    listening_version?: string;
    similarity_seed_ids?: string[];
  };
  const listenRows = csvObjects(files.listenCsv);
  const similarityRowsRaw = csvObjects(files.similarityCsv);
  const bpmRows = csvObjects(files.bpmCsv);

  const listenTracks = listenRows.map((row) =>
    requireFilename(row.track_id ?? "", row.filename ?? ""),
  );
  const bpmTracks = bpmRows.map((row) =>
    requireFilename(row.track_id ?? "", row.filename ?? ""),
  );

  const filenamesByTrackId = new Map<string, string>();
  for (const track of listenTracks) {
    filenamesByTrackId.set(track.trackId, track.filename);
  }
  for (const track of bpmTracks) {
    filenamesByTrackId.set(track.trackId, track.filename);
  }

  const similarityRows: SimilarityPacketRow[] = similarityRowsRaw.map((row) => {
    const slot = row.system?.trim();
    const rank = Number(row.rank);
    if (slot !== "A" && slot !== "B") {
      throw new Error("music_lab_packet_invalid");
    }
    if (!Number.isInteger(rank) || rank < 1 || rank > 5) {
      throw new Error("music_lab_packet_invalid");
    }
    const neighbour = requireFilename(row.neighbour_id ?? "", row.neighbour_filename ?? "");
    filenamesByTrackId.set(neighbour.trackId, neighbour.filename);
    const seed = requireFilename(row.seed_id ?? "", row.seed_filename ?? "");
    filenamesByTrackId.set(seed.trackId, seed.filename);
    return {
      seedId: seed.trackId,
      slot,
      rank,
      neighbourId: neighbour.trackId,
      neighbourFilename: neighbour.filename,
    };
  });

  const similaritySeedIds = Array.isArray(trackSet.similarity_seed_ids)
    ? trackSet.similarity_seed_ids.map((id) => id.trim()).filter(Boolean)
    : [];

  if (listenTracks.length === 0 || bpmTracks.length === 0 || similaritySeedIds.length === 0) {
    throw new Error("music_lab_packet_invalid");
  }

  return {
    version: trackSet.listening_version?.trim() || "0.5",
    listenTracks,
    similarityRows,
    similaritySeedIds,
    bpmTracks,
    filenamesByTrackId,
  };
}

export function parseBlindKeyJson(
  blindKeyJson: string,
  similaritySeedIds: readonly string[],
): BlindKeyMap {
  const blind = JSON.parse(blindKeyJson) as {
    panels_by_seed?: Record<string, { A?: string; B?: string }>;
  };
  const panels = blind.panels_by_seed ?? {};
  const expected = new Set(similaritySeedIds);
  if (expected.size !== similaritySeedIds.length) {
    throw new Error("music_lab_packet_invalid");
  }
  const provided = Object.keys(panels);
  if (provided.length !== expected.size || provided.some((seedId) => !expected.has(seedId))) {
    throw new Error("music_lab_packet_invalid");
  }

  const blindBySeed: BlindKeyMap = {};
  for (const seedId of similaritySeedIds) {
    const panel = panels[seedId];
    const systemA = panel?.A ?? "";
    const systemB = panel?.B ?? "";
    if (!isBlindSystem(systemA) || !isBlindSystem(systemB) || systemA === systemB) {
      throw new Error("music_lab_packet_invalid");
    }
    blindBySeed[seedId] = { A: systemA, B: systemB };
  }
  return blindBySeed;
}

export function readListeningPacketDir(directory: string): ListeningPacket {
  const read = (name: string) => readFileSync(path.join(directory, name), "utf8");
  return parseListeningPacketFiles({
    trackSetJson: read("track_set.json"),
    listenCsv: read("human_listen_sheet.csv"),
    similarityCsv: read("similarity_ear_sheet.csv"),
    bpmCsv: read("bpm_key_gt_sheet.csv"),
  });
}

export function defaultListeningPacketDir(): string {
  return path.join(process.cwd(), "data/music-lab/listening-v05");
}
