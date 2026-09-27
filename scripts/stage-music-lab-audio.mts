import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { MUSIC_LAB_BUCKET, MUSIC_LAB_EXPERIMENT_CODE } from "../src/lib/music-lab/constants";
import { importListeningPacket } from "../src/lib/music-lab/import-packet";
import { createMemoryMusicLabRepository } from "../src/lib/music-lab/memory-store";
import { readListeningPacketDir, defaultListeningPacketDir } from "../src/lib/music-lab/packet";
import { createServiceRoleClient } from "../src/lib/supabase/service-role";

const dirFlag = process.argv.indexOf("--dir");
const audioDir = dirFlag >= 0 ? process.argv[dirFlag + 1] : "";

if (!audioDir) {
  process.stderr.write(
    "Usage: npx tsx scripts/stage-music-lab-audio.mts --dir /path/to/test_tracks\n",
  );
  process.exit(1);
}

const packet = readListeningPacketDir(defaultListeningPacketDir());
const repository = createMemoryMusicLabRepository();
await importListeningPacket(repository, packet);
const experiment = await repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);
if (!experiment) {
  throw new Error("music_lab_experiment_missing");
}
const items = await repository.listItems(experiment.id);
const byFilename = new Map(items.map((item) => [item.sourceFilename, item]));
const files = readdirSync(audioDir).filter((name) => /\.(mp3|wav)$/i.test(name));
const service = createServiceRoleClient();
let uploaded = 0;

for (const filename of files) {
  const item = byFilename.get(filename);
  if (!item || item.storageBucket !== MUSIC_LAB_BUCKET) {
    continue;
  }
  const bytes = readFileSync(path.join(audioDir, filename));
  const { error } = await service.storage.from(MUSIC_LAB_BUCKET).upload(item.storagePath, bytes, {
    contentType: item.mimeType,
    upsert: true,
  });
  if (error) {
    throw new Error("music_lab_audio_upload_failed");
  }
  uploaded += 1;
}

process.stdout.write(`${JSON.stringify({ ok: true, uploaded })}\n`);
