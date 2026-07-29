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
- Large multipart uploads need dedicated `client_max_body_size` locations in `/etc/nginx/sites-available/audiolad.ru` (server default is `4m`). Listener private audio: see `deploy/nginx/private-audio-upload.location.conf` (`55m` create, `6m` cover).
- site `proxy_pass http://audiolad_next;` for Next.js locations

Cutover point: rewrite upstream file → `nginx -t` → `systemctl reload nginx` while both listeners are up.

Previous process is stopped only after public readiness + smoke + health-watch succeed.

## Rollback infra (this deploy-flow)

Known backups from 2026-07-24 rollout:

```text
/var/www/audiolad-deploy/scripts.bak-20260724-180253-pre-zdt
/var/www/audiolad-deploy/ecosystem.config.cjs.bak-20260724-180253-pre-zdt
/etc/nginx/sites-available/audiolad.ru.backup-20260724-180253-pre-zdt
/etc/nginx/sites-available/audiolad.ru.backup-20260724-180326-zdt-upstream
```

Restore old deploy scripts without stopping the live app:

```bash
# 1) keep current healthy PM2 process untouched
pm2 status
curl -sS https://audiolad.ru/api/health/build

# 2) restore scripts/ecosystem from backup
rm -rf /var/www/audiolad-deploy/scripts
cp -a /var/www/audiolad-deploy/scripts.bak-20260724-180253-pre-zdt \
  /var/www/audiolad-deploy/scripts
cp -a /var/www/audiolad-deploy/ecosystem.config.cjs.bak-20260724-180253-pre-zdt \
  /var/www/audiolad-deploy/ecosystem.config.cjs

# 3) optional: restore pre-named-upstream nginx site
sudo cp -a /etc/nginx/sites-available/audiolad.ru.backup-20260724-180253-pre-zdt \
  /etc/nginx/sites-available/audiolad.ru
sudo rm -f /etc/nginx/conf.d/audiolad-next-upstream.conf
sudo nginx -t && sudo systemctl reload nginx

# 4) verify
curl -sS https://audiolad.ru/api/health/build
```

Do **not** stop the healthy production PM2 app while restoring scripts.
