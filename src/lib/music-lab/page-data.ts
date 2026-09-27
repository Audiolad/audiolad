import { buildMusicLabClientBundle, type MusicLabClientBundle } from "@/lib/music-lab/client-view";
import { MUSIC_LAB_EXPERIMENT_CODE } from "@/lib/music-lab/constants";
import { requireMusicLabPageAccess, type MusicLabActor } from "@/lib/music-lab/guard";
import type { MusicLabResultsView } from "@/lib/music-lab/results-types";
import { readMusicLabResults } from "@/lib/music-lab/workflow";
import { createMusicLabRepository } from "@/lib/music-lab/supabase-repository";

export async function loadMusicLabBundle(): Promise<{
  actor: MusicLabActor;
  bundle: MusicLabClientBundle | null;
}> {
  const actor = await requireMusicLabPageAccess();
  const repository = createMusicLabRepository();
  const experiment = await repository.getExperimentByCode(MUSIC_LAB_EXPERIMENT_CODE);

  if (!experiment) {
    return { actor, bundle: null };
  }

  const [items, tasks, responses] = await Promise.all([
    repository.listItems(experiment.id),
    repository.listTasks(experiment.id),
    repository.listResponses(experiment.id, actor.userId),
  ]);

  return {
    actor,
    bundle: buildMusicLabClientBundle({ experiment, items, tasks, responses }),
  };
}

export function taskNeighbours<T extends { code: string }>(
  tasks: readonly T[],
  code: string,
  basePath: string,
): { task: T; prevHref: string | null; nextHref: string | null } | null {
  const index = tasks.findIndex((task) => task.code === code);
  if (index < 0) {
    return null;
  }
  return {
    task: tasks[index],
    prevHref: index > 0 ? `${basePath}/${tasks[index - 1].code}` : null,
    nextHref: index < tasks.length - 1 ? `${basePath}/${tasks[index + 1].code}` : null,
  };
}

export async function loadMusicLabResultsPage(): Promise<MusicLabResultsView> {
  const actor = await requireMusicLabPageAccess();
  return readMusicLabResults({
    repository: createMusicLabRepository(),
    userId: actor.userId,
  });
}
