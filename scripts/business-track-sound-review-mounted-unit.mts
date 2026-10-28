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
type SavedDecision = { id: string; status: string; reason: string; audioIdentity: string };
const saves: SavedDecision[] = [];
const bulks: unknown[] = [];
const previews: string[] = [];
let reviewImpl: (input: SavedDecision) => Promise<{ ok: boolean; message: string }> = async (input) => {
  saves.push(input);
  return { ok: true, message: 'Решение сохранено.' };
};
moduleLoader.cache[actionsPath] = {
  id: actionsPath, filename: actionsPath, loaded: true,
  exports: {
    previewBusinessTrack: async (id: string) => { previews.push(id); return { ok: true, url: `https://audio.invalid/${id}` }; },
    reviewBusinessTrack: async (input: SavedDecision) => reviewImpl(input),
    reviewBusinessTracksBulk: async (input: unknown) => { bulks.push(input); return { ok: true, saved: 2, failed: 0, message: 'Сохранено: 2.' }; },
    businessTrackReviewHistory: async () => [{ id: 1, old_status: 'unchecked', new_status: 'rejected', changed_at: '2026-10-27T12:00:00Z', reason: 'Внутренняя причина', changed_by: 'admin', event: 'manual' }],
  },
} as NodeModule;
const { default: ReviewQueue } = await import('../src/app/(platform)/admin/business-track-review/ReviewQueue');
const router = { bfcacheId: '', back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch: async () => {} };
const rows: SoundReviewRow[] = ['a', 'b', 'c'].map((id) => ({ id, title: `Track ${id}`, artist: 'Artist', artist_id: 'artist', album: 'Album', album_id: 'album',
  duration_seconds: 120, spaces: ['cafe'], status: 'unchecked', reason: null, reviewed_at: null, reviewed_by: null, audio_identity: `["${id}.mp3",null,null]` }));
const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
await act(async () => root.render(createElement(AppRouterContext.Provider, { value: router }, createElement(ReviewQueue, { rows, scope: {
  status: 'unchecked', artist: '', album: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', space: '', total: 175, albumTotal: 40, artistTotal: null,
} }))));
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
assert.equal(elements().filter((el) => el.tagName === 'SELECT' && props(el).name === 'status').length, 3);
assert.equal(elements().filter((el) => el.tagName === 'INPUT' && props(el).type === 'checkbox').length, 5, 'navigation toggle, select-all and one checkbox per row');
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

function field(label: string) {
  return elements().find((el) => el.tagName === 'INPUT' && props(el)['aria-label'] === label)!;
}
function rowStatus(title: string) {
  const select = elements().find((el) => el.tagName === 'SELECT' && props(el)['aria-label'] === `Статус: ${title}`)!;
  return props(select).defaultValue;
}
function playingStatus() {
  return elements().find((el) => el.tagName === 'B' && props(el)['data-sound-status'])?.getAttribute('data-sound-status');
}
const playerReason = field('Причина текущего трека: Track b');
await act(async () => (props(playerReason).onChange as (event: unknown) => void)({ target: { value: 'Шипение' } }));
const beforeFailure = previews.length;
reviewImpl = async () => ({ ok: false, message: 'Аудиофайл заменён. Обновите очередь и прослушайте новую версию.' });
await click('Не допущен');
assert.match(text(container), /Аудиофайл заменён/);
assert.equal(playingStatus(), 'unchecked');
assert.equal(rowStatus('Track b'), 'unchecked');
assert.equal(previews.length, beforeFailure, 'failed save does not load the next track');
assert.equal(elements().some((el) => el.tagName === 'AUDIO'), false);
reviewImpl = async () => { throw new Error('rpc down'); };
await click('Допущен');
assert.match(text(container), /Решение не сохранено\. Повторите попытку\./);
assert.equal(playingStatus(), 'unchecked');
assert.equal(previews.length, beforeFailure, 'thrown save does not advance');
reviewImpl = async (input: SavedDecision) => { saves.push(input); return { ok: true, message: 'Решение сохранено.' }; };
await click('Допущен');
assert.deepEqual(saves.at(-1), { id: 'b', status: 'approved', reason: 'Шипение', audioIdentity: rows[1].audio_identity });
assert.equal(rowStatus('Track b'), 'approved');
audio = elements().find((el) => el.tagName === 'AUDIO')!;
assert.equal(props(audio).src, 'https://audio.invalid/c');
assert.equal(props(audio).autoPlay, true);
assert.equal(playingStatus(), 'unchecked');
assert.match(text(container), /Решение сохранено/);
const stayed = previews.length;
const box = elements().find((el) => el.tagName === 'INPUT' && props(el).type === 'checkbox')!;
await act(async () => (props(box).onChange as (event: unknown) => void)({ target: { checked: false } }));
await click('Не проверен');
assert.deepEqual(saves.at(-1), { id: 'c', status: 'unchecked', reason: '', audioIdentity: rows[2].audio_identity });
assert.equal(previews.length, stayed, 'checkbox off does not load another track');
assert.equal(props(elements().find((el) => el.tagName === 'AUDIO')!).src, 'https://audio.invalid/c');
assert.equal(playingStatus(), 'unchecked');
const reasonInput = field('Причина текущего трека: Track c');
const ignored = new Event('keydown', { bubbles: true });
(ignored as Event & { key: string }).key = '2';
await act(async () => reasonInput.dispatchEvent(ignored));
assert.equal(saves.length, 3, 'shortcut ignored while typing the reason');
const shortcut = new Event('keydown', { bubbles: true });
(shortcut as Event & { key: string }).key = '2';
await act(async () => container.dispatchEvent(shortcut));
assert.deepEqual(saves.at(-1), { id: 'c', status: 'rejected', reason: '', audioIdentity: rows[2].audio_identity });
assert.equal(rowStatus('Track c'), 'rejected');
assert.equal(props(elements().find((el) => el.tagName === 'AUDIO')!).src, 'https://audio.invalid/c', 'no further unchecked track, playback stays');
const previousConfirm = window.confirm;
window.confirm = () => false;
await click('Выбрать все по этому фильтру');
assert.match(text(container), /Выбрано: 175/);
await click('Применить к выбранным');
assert.equal(bulks.length, 0, 'cancelled confirm does not save');
window.confirm = () => true;
await click('Применить к выбранным');
assert.deepEqual(bulks[0], { scope: { kind: 'filter', status: 'unchecked', artist: '', album: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', space: '', excludedIds: [] }, status: 'approved', reason: '' });
assert.match(text(container), /Сохранено: 2/);
await click('Выбрать весь альбом');
assert.match(text(container), /Выбрано: 40/);
const albumBox = elements().find((el) => el.tagName === 'INPUT' && props(el)['aria-label'] === 'Выбрать Track a')!;
await act(async () => (props(albumBox).onChange as (event: unknown) => void)({ target: { checked: false } }));
await click('Применить к выбранным');
assert.deepEqual((bulks.at(-1) as { scope: { kind: string; excludedIds: string[] } }).scope.kind, 'album');
assert.deepEqual((bulks.at(-1) as { scope: { excludedIds: string[] } }).scope.excludedIds, ['a']);
window.confirm = previousConfirm;
await act(async () => root.unmount());
console.log('business-track-sound-review-mounted-unit: PASS (real React: statuses, stream switching, seek/fragment stop, save, history, player save-and-advance)');
