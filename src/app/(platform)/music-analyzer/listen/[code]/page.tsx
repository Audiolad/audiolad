import { notFound } from "next/navigation";

import ListenWorkspace from "@/components/music-lab/ListenWorkspace";
import { loadMusicLabBundle, taskNeighbours } from "@/lib/music-lab/page-data";

export const dynamic = "force-dynamic";

export default async function MusicAnalyzerListenPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { bundle } = await loadMusicLabBundle();
  const located = bundle ? taskNeighbours(bundle.listen, code, "/music-analyzer/listen") : null;
  if (!bundle || !located) {
    notFound();
  }

  return (
    <ListenWorkspace
      key={located.task.code}
      task={located.task}
      locked={bundle.experiment.locked}
      prevHref={located.prevHref}
      nextHref={located.nextHref}
    />
  );
}
