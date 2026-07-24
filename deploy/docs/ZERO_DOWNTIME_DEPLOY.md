# Zero-downtime deploy / rollback

## Problem (old flow)

1. Candidate verified on `:3001`
2. Candidate killed
3. `current` switched
4. `ensure_production_port_ready` ran `pm2 stop audiolad` (listener-gap)
5. PM2 reload / start on `:3000`
6. Public readiness / smoke — users saw 502 (`no live upstream`)
7. Failed smoke → rollback repeated the same stop/reload gap

## New flow (Variant A)

Ports:

| Role | Port |
|------|------|
| Blue | `127.0.0.1:3000` |
| Green | `127.0.0.1:3001` |

State file: `/var/www/audiolad-deploy/shared/active-upstream.env`

Nginx:

- `/etc/nginx/conf.d/audiolad-next-upstream.conf` — `upstream audiolad_next { server 127.0.0.1:PORT; }`
- site `proxy_pass http://audiolad_next;` for Next.js locations

Cutover point: rewrite upstream file → `nginx -t` → `systemctl reload nginx` while both listeners are up.

Previous process is stopped only after public readiness + smoke + health-watch succeed.

## Rollback infra (this deploy-flow)

Backups created automatically when the site file is migrated:

```bash
ls -1 /etc/nginx/sites-available/audiolad.ru.backup-*-zdt-upstream
```

Restore previous deploy scripts from git / backup copy under `/var/www/audiolad-deploy/scripts.bak-*`.

Do **not** stop the healthy production PM2 app while restoring scripts.
