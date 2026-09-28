import ResultsPanel from "@/components/music-lab/ResultsPanel";
import { loadMusicLabResultsPage } from "@/lib/music-lab/page-data";

export const dynamic = "force-dynamic";

export default async function MusicAnalyzerResultsPage() {
  const view = await loadMusicLabResultsPage();
  return <ResultsPanel view={view} />;
}
