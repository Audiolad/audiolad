// Long-lived music transcode queue consumer. Self-refresh is the primary
// post-cutover lifecycle: the process captures its boot release identity
// (resolved cwd realpath + `.deploy-commit`), refuses new claims when
// `/var/www/audiolad-deploy/current` no longer matches that boot release,
// then exits 0 so PM2 `autorestart: true` respawns with
// cwd=/var/www/audiolad-deploy/current.
// First production process on this revision is started by
// deploy/scripts/ensure-music-transcode-worker.sh after cutover.
//
// Env: PM2 only sets NODE_ENV. The process loads authoritative
// `.env.production` from cwd via Next.js `@next/env` (deploy already links
// `shared/.env.production` into the release). Do not rely on a once-saved
// shell env or `pm2 save` for secrets. Never put secrets in this file.
module.exports = {
  apps: [{
    name: "audiolad-music-transcode-worker",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-music-transcode-worker.mts",
    autorestart: true,
    instances: 1,
    exec_mode: "fork",
    min_uptime: "10s",
    max_restarts: 10,
    kill_timeout: 120000,
    treekill: true,
    env: { NODE_ENV: "production" },
  }],
};
