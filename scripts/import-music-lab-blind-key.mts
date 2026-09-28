import { readFileSync } from "node:fs";

import { importBlindAssignments } from "../src/lib/music-lab/import-packet";
import {
  defaultListeningPacketDir,
  parseBlindKeyJson,
  readListeningPacketDir,
} from "../src/lib/music-lab/packet";
import { createMusicLabRepository } from "../src/lib/music-lab/supabase-repository";

const flag = process.argv.indexOf("--blind-key");
const filePath = flag >= 0 ? process.argv[flag + 1] : "";

if (!filePath) {
  process.stderr.write(
    "Usage: npx tsx scripts/import-music-lab-blind-key.mts --blind-key /path/to/similarity_ear_key.json\n",
  );
  process.exit(1);
}

const packet = readListeningPacketDir(defaultListeningPacketDir());
const blindBySeed = parseBlindKeyJson(readFileSync(filePath, "utf8"), packet.similaritySeedIds);
const report = await importBlindAssignments(createMusicLabRepository(), blindBySeed);
process.stdout.write(`${JSON.stringify({ ok: true, blindAssignments: report.blindAssignments })}\n`);
