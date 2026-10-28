// Real React component with the repository test DOM and local action doubles.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { SoundReviewRow } from '../src/lib/business/track-sound-review';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const moduleLoader = createRequire(import.meta.url);
const actionsPath = moduleLoader.resolve('../src/app/(platform)/admin/business-track-review/actions.ts');
const saves: unknown[] = [];
moduleLoader.cache[actionsPath] = {
  id: actionsPath, filename: actionsPath, loaded: true,
  exports: {
    previewBusinessTrack: async (id: string) => ({ ok: true, url: `https://audio.invalid/${id}` }),
    reviewBusinessTrack: async (input: unknown) => { saves.push(input); return { ok: true, message: 'Решение сохранено.' }; },
    businessTrackReviewHistory: async () => [{ id: 1, old_status: 'unchecked', new_status: 'rejected', changed_at: '2026-10-27T12:00:00Z', reason: 'Внутренняя причина', changed_by: 'admin', event: 'manual' }],
  },
} as NodeModule;
const { default: ReviewQueue } = await import('../src/app/(platform)/admin/business-track-review/ReviewQueue');
const router = { bfcacheId: '', back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
const rows: SoundReviewRow[] = ['a', 'b'].map((id) => ({ id, title: `Track ${id}`, artist: 'Artist', artist_id: 'artist', album: 'Album', album_id: 'album',
  duration_seconds: 120, spaces: ['cafe'], status: 'unchecked', reason: null, reviewed_at: null, reviewed_by: null, audio_identity: '["file.mp3",null,null]' }));
const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
await act(async () => root.render(createElement(AppRouterContext.Provider, { value: router }, createElement(ReviewQueue, { rows }))));
function elements(node: Node = container): Element[] {
  return Array.from(node.childNodes).flatMap((child) => child.nodeType === 1 ? [child as Element, ...elements(child)] : []);
}
function text(node: Node): string {
  return node.nodeType === 3 ? node.nodeValue ?? '' : Array.from(node.childNodes).map(text).join('');
}
function props(element: Element) {
  const key = Object.keys(element).find((name) => name.startsWith('__reactProps'))!;
  return (element as unknown as Record<string, Record<string, unknown>>)[key];
}
function button(label: string) { return elements().find((el) => el.tagName === 'BUTTON' && text(el) === label)!; }
async function click(label: string) { await act(async () => (props(button(label)).onClick as () => void)()); }
assert.equal(elements().filter((el) => el.tagName === 'SELECT' && props(el).name === 'status').length, 2);
assert.equal(elements().filter((el) => el.tagName === 'INPUT' && props(el).type === 'checkbox').length, 1, 'only navigation toggle, no status checkboxes');
await click('Прослушать');
let audio = elements().find((el) => el.tagName === 'AUDIO')!;
assert.equal(props(audio).src, 'https://audio.invalid/a');
assert.equal(props(audio).controlsList, 'nodownload');
let paused = false;
const media = { currentTime: 8, pause: () => { paused = true; } };
(props(audio).onSeeked as (e: unknown) => void)({ currentTarget: media });
media.currentTime = 37;
(props(audio).onTimeUpdate as (e: unknown) => void)({ currentTarget: media });
assert.equal(paused, false);
media.currentTime = 38;
(props(audio).onTimeUpdate as (e: unknown) => void)({ currentTarget: media });
assert.equal(paused, true, '30s fragment respects seeking');
await click('Следующий непроверенный');
audio = elements().find((el) => el.tagName === 'AUDIO')!;
assert.equal(props(audio).src, 'https://audio.invalid/b');
const form = elements().find((el) => el.tagName === 'FORM')!;
const data = new FormData(); data.set('status', 'rejected'); data.set('reason', 'Шум');
await act(async () => (props(form).action as (data: FormData) => void)(data));
assert.deepEqual(saves, [{ id: 'a', status: 'rejected', reason: 'Шум', audioIdentity: rows[0].audio_identity }]);
assert.match(text(container), /Решение сохранено/);
await click('История');
assert.match(text(container), /Внутренняя причина/);
await act(async () => root.unmount());
console.log('business-track-sound-review-mounted-unit: PASS (real React: statuses, stream switching, seek/fragment stop, save, history)');
