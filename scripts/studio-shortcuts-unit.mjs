#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const shell = readFileSync(
  join(ROOT, "src/components/studio/StudioEditorShell.tsx"),
  "utf8",
);
const timeline = readFileSync(
  join(ROOT, "src/components/studio/StudioTimeline.tsx"),
  "utf8",
);

assert.match(shell, /const handleStudioShortcut/);
assert.match(shell, /isNativeInteractiveTarget\(event\.target\)/);
assert.match(shell, /event\.key === " "/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "z"/);
assert.match(shell, /event\.shiftKey[\s\S]*redo\(\)/);
assert.match(shell, /event\.ctrlKey && !event\.metaKey && event\.key\.toLowerCase\(\) === "y"/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "c"/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "v"/);
assert.match(shell, /event\.key\.toLowerCase\(\) === "b"/);
assert.match(shell, /canSplitSelectedClip/);
assert.match(shell, /if \(splitSelectedClip\(\)\) \{\s*event\.preventDefault\(\)/);
assert.match(shell, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
assert.match(shell, /event\.shiftKey[\s\S]*rippleDeleteSelectedClip\(\)/);
assert.doesNotMatch(shell, /event\.key(?:\.toLowerCase\(\))? === "w"/i);
assert.match(shell, /onClick=\{deleteSelectedClip\}/);
assert.match(shell, /onClick=\{rippleDeleteSelectedClip\}/);
assert.match(shell, /onClick=\{splitSelectedClip\}/);
assert.match(shell, /const runEditingAction/);
assert.match(shell, /runEditingAction\(\s*\(\) =>\s*setClipFades/);
assert.match(shell, /runEditingAction\(\s*\(\) =>\s*splitClip/);
assert.match(shell, /const splitSelectedClip = useCallback/);
assert.match(shell, /const rippleDeleteSelectedClip = useCallback/);
assert.match(shell, /currentTime >\s*selectedTrackAndClip\.clip\.startTime/);
assert.match(shell, /currentTime <\s*selectedTrackAndClip\.clip\.startTime/);
assert.match(shell, /runEditingAction\(\(\) => removeTrack\(track\.id\)\)/);
assert.match(shell, /createStudioClipClipboard/);
assert.match(shell, /track\.id === clipboard\.sourceTrackId/);
assert.match(shell, /pasteClips\(targetTrack\.id, clipboard, currentTime\)/);
assert.doesNotMatch(
  shell,
  /if \(!clipboard \|\| !selectedTrackAndClip\) return/,
);
assert.match(shell, /STUDIO_CLIP_OVERLAP_ERROR/);
assert.match(shell, /Отменить последнее действие/);
assert.match(shell, /Повторить отменённое действие/);
assert.match(shell, /onClipGestureBegin/);
assert.match(shell, /onClipGestureCommit/);
assert.match(shell, /onClipGestureCancel/);

assert.match(timeline, /onClipGestureBegin: \(\) => void/);
assert.match(timeline, /onClipGestureCommit: \(\) => void/);
assert.match(timeline, /onClipGestureCancel: \(\) => void/);
assert.match(timeline, /onClipGestureBegin\(\);/);
assert.match(timeline, /onClipGestureCommit\(\);/);
assert.match(timeline, /onClipGestureCancel\(\);/);

console.log("studio-shortcuts-unit: ok");
