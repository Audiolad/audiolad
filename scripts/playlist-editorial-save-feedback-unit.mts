/**
 * Editorial playlist editor save / composition feedback (UX only).
 * Run: npx tsx scripts/playlist-editorial-save-feedback-unit.mts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  EDITORIAL_PLAYLIST_COMPOSITION_SAVED_MESSAGE,
  EDITORIAL_PLAYLIST_SAVE_ERROR_MESSAGE,
  EDITORIAL_PLAYLIST_SAVE_READY_LABEL,
  EDITORIAL_PLAYLIST_SAVE_SAVING_LABEL,
  EDITORIAL_PLAYLIST_SAVE_SUCCESS_LABEL,
  applyEditorialPlaylistSaveAttempt,
  confirmEditorialCompositionAfter,
  createEditorialPlaylistSaveUi,
  editorialCompositionConfirmationMessage,
  editorialPlaylistSaveButtonView,
  isEditorialPlaylistFormDirty,
  reduceEditorialPlaylistSaveUi,
  snapshotEditorialPlaylistForm,
} from "../src/lib/playlists/editorial-playlist-save-feedback";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const loaded = snapshotEditorialPlaylistForm({
  title: "Утро",
  description: "Тихое утро",
  slug: "morning",
  topicKeys: ["son", "relax"],
});

assert.equal(
  isEditorialPlaylistFormDirty(loaded, loaded, false),
  false,
  "identical loaded snapshot is not dirty",
);
assert.equal(
  isEditorialPlaylistFormDirty(
    { ...loaded, description: "  Тихое утро  " },
    loaded,
    false,
  ),
  false,
  "description trim on load does not create a false dirty state",
);
assert.equal(
  isEditorialPlaylistFormDirty({ ...loaded, title: "Вечер" }, loaded, false),
  true,
  "title change is dirty",
);
assert.equal(
  isEditorialPlaylistFormDirty(
    { ...loaded, description: "Другое описание" },
    loaded,
    false,
  ),
  true,
  "description change is dirty",
);
assert.equal(
  isEditorialPlaylistFormDirty(
    { ...loaded, topicKeys: ["son"] },
    loaded,
    false,
  ),
  true,
  "topics change is dirty",
);
assert.equal(
  isEditorialPlaylistFormDirty({ ...loaded, slug: "evening" }, loaded, false),
  true,
  "slug change is dirty when unlocked",
);
assert.equal(
  isEditorialPlaylistFormDirty({ ...loaded, slug: "evening" }, loaded, true),
  false,
  "locked slug change is ignored",
);

const afterSave = snapshotEditorialPlaylistForm({
  ...loaded,
  title: "Вечер",
});
assert.equal(
  isEditorialPlaylistFormDirty(afterSave, afterSave, false),
  false,
  "dirty resets when current matches the saved snapshot",
);

let ui = createEditorialPlaylistSaveUi();
assert.deepEqual(editorialPlaylistSaveButtonView(ui.phase, false), {
  label: EDITORIAL_PLAYLIST_SAVE_READY_LABEL,
  disabled: false,
  canSubmit: true,
});
assert.deepEqual(editorialPlaylistSaveButtonView(ui.phase, true), {
  label: EDITORIAL_PLAYLIST_SAVE_READY_LABEL,
  disabled: false,
  canSubmit: true,
});

ui = reduceEditorialPlaylistSaveUi(ui, { type: "submit" });
assert.equal(ui.phase, "saving");
assert.deepEqual(editorialPlaylistSaveButtonView(ui.phase, true), {
  label: EDITORIAL_PLAYLIST_SAVE_SAVING_LABEL,
  disabled: true,
  canSubmit: false,
});

const ignoredSecondSubmit = reduceEditorialPlaylistSaveUi(ui, { type: "submit" });
assert.equal(ignoredSecondSubmit.phase, "saving", "second submit stays saving");

ui = reduceEditorialPlaylistSaveUi(ui, { type: "success" });
assert.equal(ui.phase, "success");
assert.deepEqual(editorialPlaylistSaveButtonView(ui.phase, false), {
  label: EDITORIAL_PLAYLIST_SAVE_SUCCESS_LABEL,
  disabled: true,
  canSubmit: false,
});
assert.deepEqual(
  editorialPlaylistSaveButtonView(ui.phase, true),
  {
    label: EDITORIAL_PLAYLIST_SAVE_READY_LABEL,
    disabled: false,
    canSubmit: true,
  },
  "next field change after success returns to Сохранить",
);

const failed = await applyEditorialPlaylistSaveAttempt(
  createEditorialPlaylistSaveUi(),
  async () => ({ ok: false, message: "boom" }),
);
assert.equal(failed.phase, "error");
assert.equal(failed.error, "boom");
assert.notEqual(
  editorialPlaylistSaveButtonView(failed.phase, true).label,
  EDITORIAL_PLAYLIST_SAVE_SUCCESS_LABEL,
  "failed save does not show Сохранено",
);
assert.deepEqual(editorialPlaylistSaveButtonView(failed.phase, true), {
  label: EDITORIAL_PLAYLIST_SAVE_READY_LABEL,
  disabled: false,
  canSubmit: true,
});
assert.equal(
  reduceEditorialPlaylistSaveUi(createEditorialPlaylistSaveUi(), {
    type: "error",
    message: "x",
  }).phase,
  "idle",
  "error is only accepted from saving",
);
assert.match(EDITORIAL_PLAYLIST_SAVE_ERROR_MESSAGE, /Не удалось сохранить изменения/);

const defaultFailed = await applyEditorialPlaylistSaveAttempt(
  createEditorialPlaylistSaveUi(),
  async () => ({ ok: false }),
);
assert.equal(defaultFailed.error, EDITORIAL_PLAYLIST_SAVE_ERROR_MESSAGE);

let persistCalls = 0;
const inFlight = { phase: "saving" as const, error: null };
const blocked = await applyEditorialPlaylistSaveAttempt(inFlight, async () => {
  persistCalls += 1;
  return { ok: true };
});
assert.equal(persistCalls, 0, "saving state does not resubmit");
assert.equal(blocked.phase, "saving");

const succeeded = await applyEditorialPlaylistSaveAttempt(
  createEditorialPlaylistSaveUi(),
  async () => ({ ok: true }),
);
assert.equal(succeeded.phase, "success");
assert.equal(
  editorialPlaylistSaveButtonView(succeeded.phase, false).label,
  EDITORIAL_PLAYLIST_SAVE_SUCCESS_LABEL,
);

assert.equal(editorialCompositionConfirmationMessage("idle"), null);
assert.equal(editorialCompositionConfirmationMessage("pending"), null);
assert.equal(editorialCompositionConfirmationMessage("error"), null);
assert.equal(
  editorialCompositionConfirmationMessage("success"),
  EDITORIAL_PLAYLIST_COMPOSITION_SAVED_MESSAGE,
);

let releaseMutation!: (ok: boolean) => void;
const pendingMutation = new Promise<boolean>((resolve) => {
  releaseMutation = resolve;
});
let confirmationSettled: string | null | undefined;
const confirmation = confirmEditorialCompositionAfter(() => pendingMutation);
void confirmation.then((value) => {
  confirmationSettled = value;
});
await Promise.resolve();
assert.equal(
  confirmationSettled,
  undefined,
  "confirmation is not shown before resolve",
);
assert.equal(
  editorialCompositionConfirmationMessage("pending"),
  null,
  "no confirmation while the mutation is still pending",
);
releaseMutation(true);
assert.equal(
  await confirmation,
  EDITORIAL_PLAYLIST_COMPOSITION_SAVED_MESSAGE,
);
assert.equal(confirmationSettled, EDITORIAL_PLAYLIST_COMPOSITION_SAVED_MESSAGE);

const failedComposition = await confirmEditorialCompositionAfter(async () => false);
assert.equal(
  failedComposition,
  null,
  "composition error does not show a success confirmation",
);

const editor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
assert.match(editor, /editorial-playlist-save-feedback/);
assert.match(editor, /saveButton\.label/);
assert.match(editor, /EDITORIAL_PLAYLIST_SAVE_ERROR_MESSAGE/);
assert.match(editor, /confirmCompositionSaved/);
assert.match(editor, /saveInFlightRef/);
assert.match(editor, /hasMetadataChanges/);
assert.match(editor, /hasTopicChanges/);
assert.match(editor, /method: "PATCH"/);
assert.match(editor, /method: "PUT"/);
assert.match(editor, /JSON\.stringify\(\{ topicKeys \}\)/);
assert.doesNotMatch(editor, /router\.(push|replace)/);
assert.doesNotMatch(editor, /window\.location|location\.reload/);
assert.match(editor, /role="status"/);
assert.match(editor, /setTimeout\(\(\) => setToast\(null\), 2200\)/);

const moveBlock = editor.slice(
  editor.indexOf("async function moveItem"),
  editor.indexOf("async function reorderItems"),
);
assert.ok(
  moveBlock.indexOf("await persistMove") <
    moveBlock.indexOf("confirmCompositionSaved()"),
  "move confirmation waits for persistMove",
);
assert.ok(
  moveBlock.indexOf("confirmCompositionSaved()") <
    moveBlock.indexOf("catch {"),
  "move confirmation stays on the success path",
);

const reorderBlock = editor.slice(
  editor.indexOf("async function reorderItems"),
  editor.indexOf("async function removeItem"),
);
assert.ok(
  reorderBlock.indexOf("await persistMove") <
    reorderBlock.indexOf("confirmCompositionSaved()"),
  "reorder confirmation waits for persistMove",
);

const removeBlock = editor.slice(
  editor.indexOf("async function removeItem"),
  editor.indexOf("← К открытым плейлистам"),
);
assert.ok(
  removeBlock.indexOf("if (!response.ok)") <
    removeBlock.indexOf("confirmCompositionSaved()"),
  "delete confirmation waits for a successful response",
);

const saveBlock = editor.slice(
  editor.indexOf("async function saveMetadata"),
  editor.indexOf("async function togglePublish"),
);
assert.ok(
  saveBlock.indexOf('type: "submit"') < saveBlock.indexOf("await fetch"),
  "save enters saving before the request",
);
assert.ok(
  saveBlock.indexOf("if (!response.ok)") <
    saveBlock.indexOf('type: "success"'),
  "success is not applied before response.ok checks",
);
assert.match(saveBlock, /failSave/);
assert.doesNotMatch(
  saveBlock.slice(0, saveBlock.indexOf('type: "success"')),
  /EDITORIAL_PLAYLIST_SAVE_SUCCESS_LABEL/,
);

const picker = read("src/components/playlists/EditorialPracticePickerSheet.tsx");
assert.ok(
  picker.indexOf("if (!response.ok)") < picker.indexOf("onAdded?.()"),
  "picker still calls onAdded only after a successful response",
);
assert.ok(
  picker.indexOf("if (!response.ok)") < picker.indexOf("onReplaced?.()"),
  "picker still calls onReplaced only after a successful response",
);

assert.equal(
  existsSync(join(repoRoot, "src/lib/playlists/editorial-playlist-save-feedback.ts")),
  true,
);

console.log("playlist-editorial-save-feedback-unit: ok");
