# Company Core status fixtures for /admin/ai-company

Raw `buildCompanyStatus()` output from Company Core, not hand-written JSON.
Used by `scripts/ai-company-core-fixtures-unit.tsx`.

- `core28-{current,archive,all}.json` — company-core PR #28 (`cursor/user-acceptance-api-2fb0`)
  @ `16e1a3b2da5d02031a0ed83db48c1d11b623e62b`, `acceptanceView` = current / archive / all.
  `presentation` is the string enum `in_progress | presented | rework | archived`,
  `user_acceptance` is the string `accepted | rejected | none`, decision details are in `acceptance{}`.
  The status task DTO has no `owner` field.
- `coreold-{current,archive,all}.json` — company-core `main` @ `142c3b8a5e9d50f180ef9ee071210721477e32fb`
  (before the acceptance contract; it ignores `?acceptance`, so all three are the same).

Input rows (same for both): one task in progress (Cursor run, no SHA), one presented with
`production_verified`, one rejected (the 21:30 listening-time remark), one reopened, one accepted
(history), one old `done` task. `now` = 2026-10-07T19:00:00Z, `env` = {}.
Only gate names appear (for example `CODEX_ACCESS_TOKEN`); there are no secret values.
