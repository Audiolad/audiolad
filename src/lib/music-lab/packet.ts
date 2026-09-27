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

export type ListeningPacket = {
  version: string;
  listenTracks: ListeningTrack[];
  similarityRows: SimilarityPacketRow[];
  similaritySeedIds: string[];
  bpmTracks: ListeningTrack[];
  blindBySeed: Record<string, { A: BlindSystemCode; B: BlindSystemCode }>;
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
  blindKeyJson: string;
}): ListeningPacket {
  const trackSet = JSON.parse(files.trackSetJson) as {
    listening_version?: string;
    similarity_seed_ids?: string[];
  };
  const listenRows = csvObjects(files.listenCsv);
  const similarityRowsRaw = csvObjects(files.similarityCsv);
  const bpmRows = csvObjects(files.bpmCsv);
  const blind = JSON.parse(files.blindKeyJson) as {
    panels_by_seed?: Record<string, { A?: string; B?: string }>;
  };

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

  const blindBySeed: ListeningPacket["blindBySeed"] = {};
  const panels = blind.panels_by_seed ?? {};
  for (const seedId of similaritySeedIds) {
    const panel = panels[seedId];
    const systemA = panel?.A ?? "";
    const systemB = panel?.B ?? "";
    if (!isBlindSystem(systemA) || !isBlindSystem(systemB) || systemA === systemB) {
      throw new Error("music_lab_packet_invalid");
    }
    blindBySeed[seedId] = { A: systemA, B: systemB };
  }

  if (listenTracks.length === 0 || bpmTracks.length === 0 || similaritySeedIds.length === 0) {
    throw new Error("music_lab_packet_invalid");
  }

  return {
    version: trackSet.listening_version?.trim() || "0.5",
    listenTracks,
    similarityRows,
    similaritySeedIds,
    bpmTracks,
    blindBySeed,
    filenamesByTrackId,
  };
}

export function readListeningPacketDir(directory: string): ListeningPacket {
  const read = (name: string) => readFileSync(path.join(directory, name), "utf8");
  return parseListeningPacketFiles({
    trackSetJson: read("track_set.json"),
    listenCsv: read("human_listen_sheet.csv"),
    similarityCsv: read("similarity_ear_sheet.csv"),
    bpmCsv: read("bpm_key_gt_sheet.csv"),
    blindKeyJson: read("similarity_ear_key.json"),
  });
}

export function defaultListeningPacketDir(): string {
  return path.join(process.cwd(), "data/music-lab/listening-v05");
}
