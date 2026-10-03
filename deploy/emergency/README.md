# Emergency contour

Scripts for a Russian-hosted Git mirror and a deploy path that does not need
GitHub Actions at execution time. The production command stays:

```text
sudo -n /usr/local/sbin/audiolad-deploy <40-char-sha>
```

Nothing here installs itself on the production server.

| Path | Role |
|---|---|
| `repos.list` | Repositories to mirror. Add a line to include another Audiolad repo. |
| `mirror/sync-from-github.sh` | Replica while `primary=github`. |
| `mirror/promote-to-primary.sh` | Confirm token `PROMOTE_MIRROR_TO_PRIMARY`. |
| `mirror/resync-to-github.sh` | Fast-forward back. Confirm token `RESTORE_GITHUB_PRIMARY`. |
| `git-source.sh` | Fixed server commands `status`, `activate-mirror`, `restore-github`. |
| `ci/emergency-deploy.sh` | Preflight and optional canonical execute. |
| `ci/emergency-rollback.sh` | Audit plus canonical rollback wrapper. |
| `rollback-wrapper.sh` | Calls the current release `rollback.sh` with no caller text. |
| `build/emergency-build-ready.sh` | Offline readiness of one SHA. |
| `sudoers/audiolad-emergency` | Draft. Not installed. |
| `systemd/` | Timer for the future Gitea host, not the app VPS. |

Operator text, the dependency audit, and the single Human Gate:

```text
docs/operations/emergency-contour/
```
