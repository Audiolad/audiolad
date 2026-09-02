import assert from "node:assert/strict";

import { auditStudioProject } from "../src/lib/studio/project-integrity-audit";

const base = {
  projectId: "project-1",
  authorId: "author-1",
  authorName: "Author",
  revision: 4,
  activeAssetIds: ["11111111-1111-4111-8111-111111111111"],
  projectData: {
    schemaVersion: 2,
    studioVersion: 1,
    editor: { currentTime: 0 },
    slots: [{ id: "slot-1", name: "Voice", audioTrackId: "track-1", trackKind: "voice" as const }],
    tracks: [{
      id: "track-1",
      assetId: "11111111-1111-4111-8111-111111111111",
      name: "Voice",
      volume: 1,
      muted: false,
      trackKind: "voice" as const,
      voicePreset: "none" as const,
      clips: [{ id: "clip-1", startTime: 0, offset: 0, duration: 1, fadeInDuration: 0, fadeOutDuration: 0 }],
    }],
  },
};

assert.deepEqual(auditStudioProject(base), []);
assert.equal(
  auditStudioProject({
    ...base,
    projectData: { ...base.projectData, slots: [{ ...base.projectData.slots[0], audioTrackId: "missing" }] },
  })[0]?.defect,
  "dangling_slot_track",
);
assert.equal(
  auditStudioProject({ ...base, activeAssetIds: [] })[0]?.defect,
  "missing_active_project_asset",
);

console.log("studio project integrity audit checks passed");
