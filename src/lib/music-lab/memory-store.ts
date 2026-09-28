import type {
  MusicLabBlindAssignment,
  MusicLabExperiment,
  MusicLabItem,
  MusicLabRepository,
  MusicLabResponse,
  MusicLabTask,
} from "@/lib/music-lab/types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createMemoryMusicLabRepository(): MusicLabRepository {
  const experiments = new Map<string, MusicLabExperiment>();
  const items: MusicLabItem[] = [];
  const tasks: MusicLabTask[] = [];
  const responses: MusicLabResponse[] = [];
  const blinds: MusicLabBlindAssignment[] = [];

  return {
    async getExperimentByCode(code) {
      const found = [...experiments.values()].find((experiment) => experiment.code === code);
      return found ? clone(found) : null;
    },
    async saveExperiment(experiment) {
      experiments.set(experiment.id, clone(experiment));
    },
    async listItems(experimentId) {
      return items
        .filter((item) => item.experimentId === experimentId)
        .map((item) => clone(item))
        .sort((left, right) => left.sortOrder - right.sortOrder);
    },
    async saveItem(item) {
      const index = items.findIndex((entry) => entry.id === item.id);
      if (index >= 0) {
        items[index] = clone(item);
        return;
      }
      items.push(clone(item));
    },
    async listTasks(experimentId) {
      return tasks
        .filter((task) => task.experimentId === experimentId)
        .map((task) => clone(task))
        .sort((left, right) => left.sortOrder - right.sortOrder || left.publicCode.localeCompare(right.publicCode));
    },
    async saveTask(task) {
      const index = tasks.findIndex((entry) => entry.id === task.id);
      if (index >= 0) {
        tasks[index] = clone(task);
        return;
      }
      tasks.push(clone(task));
    },
    async listResponses(experimentId, respondentUserId) {
      return responses
        .filter((response) => response.experimentId === experimentId)
        .filter((response) =>
          respondentUserId ? response.respondentUserId === respondentUserId : true,
        )
        .map((response) => clone(response));
    },
    async saveResponse(response) {
      const experiment = experiments.get(response.experimentId);
      if (experiment?.status === "completed") {
        throw new Error("music_lab_responses_locked");
      }
      const index = responses.findIndex(
        (entry) =>
          entry.taskId === response.taskId &&
          entry.respondentUserId === response.respondentUserId,
      );
      if (index >= 0) {
        responses[index] = clone({
          ...response,
          id: responses[index].id,
          createdAt: responses[index].createdAt,
        });
        return;
      }
      responses.push(clone(response));
    },
    async listBlindAssignments(experimentId) {
      return blinds
        .filter((entry) => entry.experimentId === experimentId)
        .map((entry) => clone(entry));
    },
    async saveBlindAssignment(assignment) {
      const index = blinds.findIndex(
        (entry) => entry.taskId === assignment.taskId && entry.slotCode === assignment.slotCode,
      );
      if (index >= 0) {
        blinds[index] = clone({ ...assignment, id: blinds[index].id });
        return;
      }
      blinds.push(clone(assignment));
    },
  };
}
