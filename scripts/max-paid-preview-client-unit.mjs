import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isMaxBlobObjectUrl,
  isMaxPreviewPlaybackMode,
  shouldAdvanceAfterMaxPreviewEnd,
  shouldRevokeMaxAudioObjectUrl,
  shouldShowMaxTrackNavigation,
  skipMaxPlayback,
} from "../src/lib/max/max-audio-playback.ts";

assert.equal(isMaxPreviewPlaybackMode("preview"), true);
assert.equal(isMaxPreviewPlaybackMode("full"), false);
assert.equal(shouldShowMaxTrackNavigation("preview"), false);
assert.equal(shouldShowMaxTrackNavigation("full"), true);
assert.equal(shouldAdvanceAfterMaxPreviewEnd("preview"), false);
assert.equal(shouldAdvanceAfterMaxPreviewEnd("full"), true);
assert.equal(isMaxBlobObjectUrl("blob:https://max.audiolad.ru/abc"), true);
assert.equal(isMaxBlobObjectUrl("https://cdn.example/audio.mp3"), false);
assert.equal(shouldRevokeMaxAudioObjectUrl("blob:https://max.audiolad.ru/abc"), true);
assert.equal(shouldRevokeMaxAudioObjectUrl("https://cdn.example/audio.mp3"), false);
assert.equal(skipMaxPlayback(50, 15, 60), 60);
assert.equal(skipMaxPlayback(10, -15, 60), 0);

const hook = readFileSync(join(process.cwd(), "src/components/max/useMaxAudioPlayback.ts"), "utf8");
const player = readFileSync(join(process.cwd(), "src/components/max/MaxAudioPlayer.tsx"), "utf8");
const home = readFileSync(join(process.cwd(), "src/components/max/MaxAuthenticatedHome.tsx"), "utf8");
const source = `${hook}\n${player}\n${home}`;

assert.match(player, /Предпрослушивание · до 1 минуты/);
assert.match(player, /Предпрослушивание завершено/);
assert.match(player, /isMaxPreviewPlaybackMode\(session\.playbackMode\)/);
assert.match(player, /shouldShowMaxTrackNavigation\(session\.playbackMode\)/);
assert.match(player, /previewDuration/);
assert.match(hook, /shouldAdvanceAfterMaxPreviewEnd\(session\.playbackMode\)/);
assert.match(hook, /setPreviewEnded\(true\)/);
assert.match(hook, /shouldRevokeMaxAudioObjectUrl/);
assert.match(hook, /URL\.revokeObjectURL/);
assert.match(hook, /objectUrlRef/);
assert.match(hook, /result\.objectUrl/);
assert.match(hook, /shouldAcceptMaxAudioResponse/);
assert.match(home, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(home, /URL\.createObjectURL\(blob\)/);
assert.match(home, /objectUrl: true/);
assert.match(home, /Предпрослушивание пока недоступно/);
assert.match(home, /Для прослушивания нужен доступ к продукту/);
assert.match(home, /playbackMode === "preview"/);
assert.match(home, /MAX_PLAYBACK_AUDIO_PATH/);
const fullAudioFetch = home.slice(home.lastIndexOf("MAX_PLAYBACK_AUDIO_PATH"));
assert.doesNotMatch(fullAudioFetch, /createObjectURL/);
assert.match(fullAudioFetch, /payload\?\.url/);

const previewFetch = home.slice(
  home.indexOf('playback.session.playbackMode === "preview"'),
  home.lastIndexOf("MAX_PLAYBACK_AUDIO_PATH"),
);
assert.match(previewFetch, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(previewFetch, /playbackTicket: playback\.playbackTicket/);
assert.doesNotMatch(previewFetch, /initData/);
assert.doesNotMatch(previewFetch, /authorSlug:/);
assert.doesNotMatch(previewFetch, /\?token=/);
assert.doesNotMatch(previewFetch, /method: "GET"/);

assert.doesNotMatch(source, /localStorage|sessionStorage/);
assert.doesNotMatch(source, /\/api\/max\/playback\/preview\?/);
assert.doesNotMatch(source, /\/api\/max\/playback\/preview\//);
assert.doesNotMatch(source, /searchParams|URLSearchParams/);

const readyHome = home.slice(home.indexOf('{detail.status === "ready" ?'));
assert.ok(
  readyHome.indexOf("<MaxAudioPlayer") < readyHome.indexOf("detail.product.description"),
  "description stays below preview player",
);
assert.ok(
  readyHome.indexOf("preview_unavailable") < readyHome.indexOf("detail.product.description"),
);
assert.ok(
  readyHome.indexOf("detail.product.priceLabel") < readyHome.indexOf("<MaxAudioPlayer"),
);

assert.match(hook, /if \(result\.ok && result\.objectUrl && shouldRevokeMaxAudioObjectUrl\(result\.url\)\)/);
assert.match(hook, /revokeObjectUrl\(\)/);
assert.ok(hook.indexOf("revokeObjectUrl()") < hook.lastIndexOf("setSelected") || hook.includes("invalidatePlayback"));
assert.match(hook, /invalidatePlayback\(\)/);

console.log("max-paid-preview-client-unit: ok");
