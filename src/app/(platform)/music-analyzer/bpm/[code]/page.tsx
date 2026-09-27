import { notFound } from "next/navigation";

import BpmWorkspace from "@/components/music-lab/BpmWorkspace";
import { loadMusicLabBundle, taskNeighbours } from "@/lib/music-lab/page-data";

export const dynamic = "force-dynamic";

export default async function MusicAnalyzerBpmPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { bundle } = await loadMusicLabBundle();
  const located = bundle ? taskNeighbours(bundle.bpm, code, "/music-analyzer/bpm") : null;
  if (!bundle || !located) {
    notFound();
  }

  return (
    <BpmWorkspace
      key={located.task.code}
      task={located.task}
      locked={bundle.experiment.locked}
      prevHref={located.prevHref}
      nextHref={located.nextHref}
    />
  );
}
