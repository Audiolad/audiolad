import { RunsWorkspace } from "@/components/music-analyzer-runs/RunsWorkspace";
import { toClientRun } from "@/lib/music-analyzer-runs/contract";
import { MusicAnalyzerStorageError, listMusicAnalyzerRuns } from "@/lib/music-analyzer-runs/repository";

export const dynamic = "force-dynamic";

export default async function MusicAnalyzerRunsPage() {
  let unavailable = false;
  let runs: Awaited<ReturnType<typeof listMusicAnalyzerRuns>> = [];
  try {
    runs = await listMusicAnalyzerRuns();
  } catch (error) {
    if (!(error instanceof MusicAnalyzerStorageError)) throw error;
    unavailable = true;
  }
  if (unavailable) {
    return (
      <div className="rounded-[22px] border border-[#e4d7f4] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#25135c]">Автоанализ</h2>
        <p className="mt-2 text-sm leading-6 text-[#796ba0]">Хранилище прогонов сейчас недоступно.</p>
      </div>
    );
  }
  return <RunsWorkspace runs={runs.map((run) => toClientRun(run))} />;
}
