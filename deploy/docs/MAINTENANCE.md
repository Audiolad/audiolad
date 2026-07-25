# Audiolad server maintenance

Safe daily disk hygiene via systemd timer. No PM2/Nginx/Docker restarts.

## Files

| Path | Role |
|------|------|
| `deploy/scripts/audiolad-maintenance.sh` | Canonical cleanup script (repo) |
| `deploy/scripts/lib/release-retention.sh` | Shared release retention logic (deploy + nightly) |
| `deploy/scripts/audiolad-disk-cleanup-test.sh` | Fixture tests for cleanup policy |
| `/usr/local/lib/audiolad/audiolad-maintenance.sh` | Installed script |
| `/usr/local/lib/audiolad/release-retention.sh` | Installed retention library |
| `/usr/local/sbin/audiolad-maintenance.sh` | Convenience wrapper |
| `deploy/systemd/audiolad-maintenance.{service,timer}` | Unit templates |
| `/etc/systemd/system/audiolad-maintenance.{service,timer}` | Installed units |

## Schedule

Daily **03:30 UTC**, `RandomizedDelaySec=900` (up to +15 min), `Persistent=true`.

## Release retention policy

Always keep unique set:

1. `current` symlink target
2. `previous` symlink target
3. one newest successful extra (has `.deploy-commit`)

Thresholds (configurable):

| Variable | Default | Meaning |
|----------|---------|---------|
| `KEEP_EXTRA_RELEASES` | `1` | Extra successful releases to keep |
| `RELEASE_RETENTION_MIN_AGE_SECONDS` | `1800` | Do not delete successful releases younger than 30 minutes |
| `RELEASE_RETENTION_INCOMPLETE_AGE_SECONDS` | `7200` | Incomplete (no `.deploy-commit`) removable after 2 hours |
| `TMP_CACHE_MAX_AGE_SECONDS` | `86400` | Age for known `/tmp` caches |
| `WORKTREE_ORPHAN_AGE_SECONDS` | `172800` | Orphan `.worktrees/*` candidate age (48h) |

Successful releases outside `current + previous + extra` are deleted even if younger than 24 hours (subject to the 30-minute safety window).

Incomplete releases are deleted after 2 hours when they are not current/previous/PM2 cwd.

Emergency mode (free &lt; 8 GiB or used ≥ 85%) still keeps current/previous/extra and the 30-minute safety window.

## Locks

| Lock | Path |
|------|------|
| Cleanup mutex | `/run/audiolad-disk-cleanup.lock` |
| Deploy lock (must be free) | `/run/audiolad-deploy.lock` |

If the deploy lock is held, cleanup exits 0 with status `skipped-deploy-lock` and deletes nothing.

## Never touched

- `/var/lib/containerd`, Docker volumes, Supabase, `/opt/supabase`
- active/previous releases and their `node_modules`
- Playwright browsers, `/root/.cursor-server`
- `/var/www/audiolad/node_modules`
- registered git worktrees (including task worktrees)
- uploads / storage / backups

## Logs

```bash
journalctl -u audiolad-maintenance.service -f
journalctl -t audiolad-maintenance --since today
```

## Manual run

```bash
# Dry-run (default; no deletes)
/usr/local/sbin/audiolad-maintenance.sh --dry-run

# Apply
sudo /usr/local/sbin/audiolad-maintenance.sh --apply
```

## Tests

```bash
bash deploy/scripts/audiolad-disk-cleanup-test.sh
bash deploy/scripts/audiolad-maintenance-release-prune-test.sh
bash deploy/scripts/release-retention-test.sh
bash -n deploy/scripts/audiolad-maintenance.sh
bash -n deploy/scripts/lib/release-retention.sh
```

## Install / update

```bash
install -d -m 755 /usr/local/lib/audiolad
install -m 755 deploy/scripts/audiolad-maintenance.sh /usr/local/lib/audiolad/audiolad-maintenance.sh
install -m 644 deploy/scripts/lib/release-retention.sh /usr/local/lib/audiolad/release-retention.sh
cat >/usr/local/sbin/audiolad-maintenance.sh <<'EOF'
#!/usr/bin/env bash
exec /usr/local/lib/audiolad/audiolad-maintenance.sh "$@"
EOF
chmod 755 /usr/local/sbin/audiolad-maintenance.sh
install -m 644 deploy/systemd/audiolad-maintenance.service /etc/systemd/system/
install -m 644 deploy/systemd/audiolad-maintenance.timer /etc/systemd/system/
# Drop obsolete override that only toggled RELEASE_PRUNE_ENABLED
rm -f /etc/systemd/system/audiolad-maintenance.service.d/release-prune.conf
systemctl daemon-reload
systemctl enable --now audiolad-maintenance.timer
```
