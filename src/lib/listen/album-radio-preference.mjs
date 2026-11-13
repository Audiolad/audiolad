export const ALBUM_RADIO_STORAGE_KEY = 'audiolad:album-radio-enabled';
const listeners = new Set();
let memory = true;
export function readAlbumRadioEnabled() {
  if (typeof window === 'undefined') return true;
  try {
    const value = window.localStorage.getItem(ALBUM_RADIO_STORAGE_KEY);
    if (value !== null) memory = value !== '0';
  } catch { /* Private browsing: retain the current tab preference. */ }
  return memory;
}
export function writeAlbumRadioEnabled(enabled) {
  memory = enabled;
  try { window.localStorage.setItem(ALBUM_RADIO_STORAGE_KEY, enabled ? '1' : '0'); } catch { /* optional storage */ }
  for (const listener of listeners) listener();
}
export function subscribeAlbumRadioEnabled(listener) {
  listeners.add(listener);
  const onStorage = (event) => { if (event.key === ALBUM_RADIO_STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

/**
 * A logged-in author member gets author_preview access to their own albums. A published,
 * catalog-listed release (albumRadioEligible === true) is the same music every listener
 * hears, so it may seed / fill radio. Unpublished or unlisted author previews never do.
 */
export function isAlbumRadioAccessAllowed(session) {
  return Boolean(session && (!session.isAuthorPreview || session.albumRadioEligible === true));
}

/** Only a natural end of a complete music album starts radio. */
export function canStartAlbumRadio({ naturalEnd, enabled, repeatMode, queue, session, seed }) {
  return Boolean(naturalEnd && enabled && repeatMode === 'off' && !queue && seed && session &&
    session.sourceType !== 'private_audio' && isAlbumRadioAccessAllowed(session) && session.playbackMode !== 'preview' &&
    session.practiceId === seed.source.practiceId && session.tracks.length === seed.trackIds.length &&
    session.tracks.every((track, index) => track.id === seed.trackIds[index]));
}
