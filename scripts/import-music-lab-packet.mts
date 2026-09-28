import { createMusicLabRepository } from "../src/lib/music-lab/supabase-repository";
import { importBundledListeningPacket } from "../src/lib/music-lab/workflow";

const report = await importBundledListeningPacket(createMusicLabRepository());
process.stdout.write(
  `${JSON.stringify({
    ok: true,
    status: report.status,
    items: report.items,
    tasks: report.tasks,
    responsesPreserved: report.responsesPreserved,
  })}\n`,
);
