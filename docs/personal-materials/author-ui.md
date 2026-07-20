# Personal Materials — Author UI

React interface for author-managed personal diagnostics in the author dashboard.

## Routes

| Route | Purpose |
| ----- | ------- |
| `/author-dashboard/diagnostics` | List diagnostics for selected author workspace |
| `/author-dashboard/diagnostics/new` | Create draft form |
| `/author-dashboard/diagnostics/[id]` | Draft editor or active/revoked management |

Navigation item **Диагностики** is added to `AuthorDashboardNav` between **Продукты** and **Страница автора**.

All pages use existing `AuthorShell` inside `ListenerAppShell mode="author"`.

## Author workspace behavior

- Workspace is selected via `?author={slug}` (same as other author dashboard sections).
- List and editor reload data when workspace changes.
- If editor material belongs to another workspace, user is redirected to the list.
- No manual `author_id` input in forms — `authorId` comes from selected workspace.

## Screen states

### List

- Loading skeleton
- Empty state with CTA
- Error with retry (keeps prior data out of scope for first load)
- Card list with client name, type, title, date, status, audio flag, created date, claimed flag

### Create

- Draft-first: **Создать черновик** → POST → redirect to `[id]`
- No auto-created empty draft
- Double-submit blocked

### Editor (draft)

1. **Data** — PATCH save with dirty indicator
2. **Audio** — MP3 upload/replace/delete (draft only)
3. **Activation** — confirmation modal → one-time link panel

### Editor (active / claimed / revoked)

- Read-only data fields
- No fake/recovered access URL after reload
- **Создать новую ссылку** (rotate) → one-time panel
- **Отозвать доступ** (revoke)
- **Удалить** (soft delete) → redirect to list

## One-time link behavior

- `accessUrl` from activate/rotate is stored in React state only for current session.
- Not written to `localStorage` / `sessionStorage`.
- Not logged or sent to analytics.
- Copy uses Clipboard API with fallback.
- Open uses `window.open(..., "noopener,noreferrer")`.

## Upload

- Client validates `.mp3` extension and MIME before upload.
- Server remains source of truth for size/duration.
- Drag-and-drop and file picker supported.
- Replace and delete supported for drafts.

## Mobile behavior

- Cards instead of wide tables on list.
- `min-w-0`, `break-words`, `break-all` for long names/URLs.
- Vertical action button stacks on small screens.
- AuthorShell header uses truncation to avoid overflow.

## Client module layout

```
src/lib/personal-materials/client/
  api.ts
  types.ts
  errors.ts
  status-labels.ts
  validation.ts
  clipboard.ts
  one-time-access.ts
```

## Status labels

| UI state | Label |
| -------- | ----- |
| draft | Черновик |
| active | Активна |
| active + claimed | Сохранена клиентом |
| revoked | Доступ отозван |
| deleted | Удалена |

## Tests

```bash
node scripts/stage-p3-personal-materials-author-ui-unit.mjs
```

Also run existing P1/P2 tests when validating full personal materials stack.

## Not in this phase

- Guest page `/d/[token]` with player
- Claim flow and `/my-materials`
- Progress, PDF upload, author notes UI
- Email delivery of links
- Production migration/deploy
