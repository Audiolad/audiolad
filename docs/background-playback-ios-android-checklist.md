# Background / lock-screen next-track (iOS, Android, desktop)

This is the **expected-behavior** matrix after the shared auto-advance path
(`ended` → fire-and-forget progress → prefetch signed URL → `play()` on the
persistent `<audio>` → then React session / URL sync).

Cells are **expected PASS** after this fix, or **FACT** of the current
architecture. They are **not** live-device PASS — no iPhone / Android / PWA
run was executed for this revision.

Related older iPhone-only smoke lists:
`docs/playlists-play-all-iphone-checklist.md`,
`docs/playlists-play-all-iphone-retest-checklist.md`.

## Architecture facts (verified in code)

| Fact | Where | Implication |
|------|--------|-------------|
| One player | `GlobalAudioPlayerProvider` + `useSequentialPlayer` | Do not invent a second `Audio()` / Web Audio graph. |
| In-session tracks | `LoadSessionInput.tracks: ListenTrack[]` from `audio_items` via `loadListenTracks` in `src/lib/listen/load-session-payload.ts` | Album/release, audiobook, and course with **2+** `audio_items` advance with **in-session prefetch**. |
| No chapter / lesson tables | `docs/DATABASE.md`: “Section / Lesson / Chapter tables не создаются.” Publication class `course` / `audiobook` is a label on `practices`. | “Chapters” and “lessons” **are** `tracks[]` in one session when the product has multiple `audio_items`. Treat like album. |
| Playlist queue | `PlaylistQueue` of `product` or `audio_item` (`src/lib/playlists/player-queue-types.ts`, `build-playlist-queue.ts`) | Public playlist and catalog playlist Play use **queue prefetch** when the current session’s last track ends. |
| 1-track product | Single `audio_item` (typical practice, audio_post, 1-track release) | In-session 1→2 is **N/A (FACT)**. If that product sits in a playlist, the **queue** path advances to the next entry. |
| Playlist `audio_item` entries | Queue builder emits one entry per selected track | That session is narrowed to `tracks: [that track]`. Next track in the playlist is **queue**, not in-session. |
| Shared path, no UA branch | `handleEnded`, `switchToTrack({ fromEndedOrNext })`, `playQueueAdvanceOnSharedAudio` | Same code for iPhone Safari/PWA, Chrome Android/PWA, and desktop. No `userAgent` / `isIos` / `isAndroid` gate. |
| `ended` always attached | `audio.addEventListener("ended", handleEnded)` | Not removed; **not** gated on `document.visibilityState`. |
| Residual JS freeze | OS may freeze a background tab | Prefetch exists so **if** `ended` runs, `play()` can be issued without awaiting network. Residual risk, not a second code path. |

## Shared transition (all platforms)

1. `ended` or Media Session `nexttrack` / in-app Next.
2. `void saveProgress(...)` — do not await before advancing.
3. If `tracks[i+1]` exists: apply prefetched signed URL (or fetch) to the **same** persistent `<audio>` and `play()`.
4. If this was the last session track and a playlist queue has a next entry: apply prefetched queue URL and `play()` **first**; wait for `playing` (or `play()` accepted); **then** `loadSession({ preservePlayback: true })` / queue index / `router.replace`.
5. `stay_on_source` playlists still skip replace. `follow_listen_route` may replace only after play.
6. Do not bump `playbackInstanceId` on that queue-advance path.

Media Session `play` / `pause` / `nexttrack` / `previoustrack` are the existing handlers. **Next uses this same fast path** on every platform.

## Device shells

| Shell | Auto-advance 1→2→3 | Lock / screen-off | Notes |
|-------|--------------------|-------------------|--------|
| **iPhone Safari in-browser** | expected PASS | lock screen: expected PASS | Same path. Residual: iOS may freeze JS; prefetch is the mitigation. |
| **iPhone PWA standalone** | expected PASS | lock screen: expected PASS | Same persistent `<audio>` + Media Session. |
| **Android Chrome** | expected PASS | screen off / lock screen: expected PASS | Must not regress; no iOS-only branch. Laptop-equivalent sequential play already worked; this path keeps it. |
| **Android PWA standalone** | expected PASS | screen off / lock screen: expected PASS | Same handlers as Chrome Android. |
| **Desktop (laptop screen-off)** | expected PASS | screen-off sequential play: expected PASS (keep current behavior) | Same `ended` → prefetch → `play()`. |

## Per content type × device class

`autoplay next` = expected yes/no and why. Same mechanism unless marked N/A.

### Playlist of several products (or playlist `audio_item` rows)

| | iPhone | Android | Desktop |
|--|--------|---------|---------|
| Autoplay next entry | expected yes — **queue prefetch** + play on same `<audio>` | expected yes — same | expected yes — same |
| `ended` still fires | expected yes — listener not visibility-gated | expected yes | expected yes |
| JS freeze | residual risk (prefetch if `ended` runs) | residual risk | residual risk (usually lower) |
| `play()` block | logged (`NotAllowedError` / `AbortError` / other, prefetch hit/miss, ids, `advanceKind=queue`) | same log | same log |
| Media Session next | same `handleNextTrack` → last-track `onTracksExhausted` → play-first | same | same |

### Album / release (`tracks.length > 1` in one session)

| | iPhone | Android | Desktop |
|--|--------|---------|---------|
| Autoplay next track | expected yes — **in-session prefetch** | expected yes — same | expected yes — same |
| `ended` still fires | expected yes | expected yes | expected yes |
| JS freeze | residual risk | residual risk | residual risk |
| `play()` block | logged (`advanceKind=session`, prefetch hit/miss) | same | same |
| Media Session next | `handleNextTrack` → `switchToTrack({ fromEndedOrNext })` | same | same |

1-track release: in-session next is **N/A (FACT)**.

### Audiobook “chapters”

| | iPhone | Android | Desktop |
|--|--------|---------|---------|
| Autoplay next chapter | **expected yes if** the audiobook has 2+ `audio_items` — they are `session.tracks[]` (same as album). **N/A (FACT)** if the product has one `audio_item`. | same | same |
| Queue vs session | Not a separate chapter player. If the audiobook is one playlist entry, finishing its last track uses the **queue** path. | same | same |
| `ended` / Media Session / logs | same shared path as album (in-session) or playlist (queue) | same | same |

### Audio course “lessons”

| | iPhone | Android | Desktop |
|--|--------|---------|---------|
| Autoplay next lesson | **expected yes if** the course has 2+ `audio_items` in one session (`tracks[]`). **N/A (FACT)** if one `audio_item`. | same | same |
| Queue vs session | No lesson table. A playlist of courses uses **queue prefetch** between products; lessons inside one course use **in-session prefetch**. | same | same |
| `ended` / Media Session / logs | same shared path | same | same |

## Debug (already in player)

On `audio.play()` **rejection only** (no success spam), `logPlayerDebug` / `debugSnapshot` records:

- error `name` (`NotAllowedError`, `AbortError`, other)
- `prefetch` = `hit` \| `miss` (and `usedPrefetch`)
- `currentAudioItemId` / `nextAudioItemId`
- `advanceKind` = `session` \| `queue`

Enable with `?debug=player` (existing player debug).

## How to mark a future live-device PASS

Do not flip a cell to live PASS unless that shell + content type was actually played (lock screen / screen off, 1→2→3 without tapping Play again). Until then keep **expected PASS** / **FACT**.
