import { notFound } from "next/navigation";

import SimilarityWorkspace from "@/components/music-lab/SimilarityWorkspace";
import { loadMusicLabBundle, taskNeighbours } from "@/lib/music-lab/page-data";

export const dynamic = "force-dynamic";

export default async function MusicAnalyzerSimilarityPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const { bundle } = await loadMusicLabBundle();
  const located = bundle
    ? taskNeighbours(bundle.similarity, code, "/music-analyzer/similarity")
    : null;
  if (!bundle || !located) {
    notFound();
  }

  return (
    <SimilarityWorkspace
      key={located.task.code}
      task={located.task}
      locked={bundle.experiment.locked}
      prevHref={located.prevHref}
      nextHref={located.nextHref}
    />
  );
}
