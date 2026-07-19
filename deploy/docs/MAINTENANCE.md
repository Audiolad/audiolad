# Audiolad server maintenance

Safe daily disk hygiene via systemd timer. No PM2/Nginx/Docker restarts.

## Files

| Path | Role |
|------|------|
| `deploy/scripts/audiolad-maintenance.sh` | Canonical script (repo) |
| `/usr/local/sbin/audiolad-maintenance.sh` | Installed copy |
| `deploy/systemd/audiolad-maintenance.{service,timer}` | Unit templates |
| `/etc/systemd/system/audiolad-maintenance.{service,timer}` | Installed units |

## Schedule

Daily **04:30 UTC**, `RandomizedDelaySec=900` (up to +15 min).

## Logs

Output goes to **journald** only (`SyslogIdentifier=audiolad-maintenance`).

```bash
journalctl -u audiolad-maintenance.service -f
journalctl -t audiolad-maintenance --since today
```

Legacy file `/var/log/audiolad-maintenance.log` is no longer written.

## Disable

```bash
systemctl disable --now audiolad-maintenance.timer
```

Re-enable:

```bash
systemctl enable --now audiolad-maintenance.timer
```

## Release pruning

Disabled by default: `RELEASE_PRUNE_ENABLED=0`.

Enable only after `deploy/scripts/audiolad-maintenance-release-prune-test.sh` passes.

Retention: `current`, `previous`, plus `KEEP_EXTRA_RELEASES` (default 1).

Releases without `.deploy-commit` are never deleted.

## Manual run

```bash
# Dry-run (no deletes)
DRY_RUN=1 /usr/local/sbin/audiolad-maintenance.sh

# Live run without release prune
RELEASE_PRUNE_ENABLED=0 /usr/local/sbin/audiolad-maintenance.sh
```

## Install / update

```bash
install -m 755 deploy/scripts/audiolad-maintenance.sh /usr/local/sbin/audiolad-maintenance.sh
install -m 644 deploy/systemd/audiolad-maintenance.service /etc/systemd/system/
install -m 644 deploy/systemd/audiolad-maintenance.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now audiolad-maintenance.timer
```
