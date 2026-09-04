# Author appreciation GetCourse export recovery

Rare fallback for pending GetCourse appreciation intents when the webhook
did not apply. Callback remains primary. Export API is not used as an
operational poller.

## Semantics

- Load a bounded set of local pending GetCourse intents
- Start **one** Export API deals export for the covering `created_at`
  window (`created_at[from]` / `created_at[to]` only; no `status=payed`)
- Poll that export with a bounded readiness count
- Correlate in memory by exact saved `provider_deal_id` or deal number
- Promote only after local verification: amount, configured offer when
  exposed, and provider-confirmed full payment (`payed_money >= amount`
  or `left_cost_money == 0` or canonical paid status). Void / cancelled /
  returned / partial never promote
- Apply only through `apply_author_appreciation_getcourse_callback`
- No-op when there are no pending intents
- Checkout and a successful webhook never start Export recovery

## Files

| Path | Role |
|------|------|
| `deploy/scripts/run-author-appreciation-getcourse-reconcile.sh` | Canonical wrapper (repo) |
| `/usr/local/lib/audiolad/run-author-appreciation-getcourse-reconcile.sh` | Installed wrapper |
| `deploy/systemd/audiolad-author-appreciation-getcourse-reconcile.{service,timer}` | Unit templates |
| `/etc/systemd/system/audiolad-author-appreciation-getcourse-reconcile.{service,timer}` | Installed units |
| `deploy/logrotate/audiolad-author-appreciation-getcourse-reconcile` | Logrotate template |
| `/var/log/audiolad/author-appreciation-getcourse-reconcile.log` | Structured run log |

## Schedule

Every **45 minutes** via systemd timer (`OnUnitActiveSec=45min`). Canonical
deploy installs and enables the timer from the **release** `deploy/` tree
(`DEPLOY_TREE=$RELEASE_DIR/deploy`), then starts one service run so an
already-paid pending intent can recover without a manual Timeweb command.
Pinned deploy-scripts snapshots also include `deploy/systemd` and
`deploy/logrotate` so ensure can still find the units if invoked from the
pin tree.

In-process / file cooldown also skips a second Export API start inside 45
minutes.

## Command

```bash
/usr/local/lib/audiolad/run-author-appreciation-getcourse-reconcile.sh
# → cd "$(readlink -f /var/www/audiolad-deploy/current)"
# → source /var/www/audiolad-deploy/shared/.env.production
# → timeout 90s npm run run:author-appreciation-getcourse-reconcile
```

Uses existing production env. No new secret.

## Locks

| Layer | Mechanism |
|-------|-----------|
| Infra | `flock` on `/run/audiolad-author-appreciation-getcourse-reconcile.lock` |
| Export API | one export per run + 45-minute cooldown file |

Does **not** restart the Next.js PM2 process.
