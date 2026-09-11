// Long-lived Studio render queue consumer. Self-refresh is the primary
// post-cutover lifecycle: the process captures its boot release identity
// (resolved cwd realpath + `.deploy-commit`), refuses new claims when
// `/var/www/audiolad-deploy/current` no longer matches that boot release,
// then exits 0 so PM2 `autorestart: true` respawns with
// cwd=/var/www/audiolad-deploy/current. First production process on this
// revision needs one OPS_STUDIO_WORKER_RECOVER so the running worker has
// the gate; after that recover is break-glass (stuck process or env
// bootstrap), not the ordinary deploy path.
// Start once with `pm2 start deploy/studio-render-worker.ecosystem.config.cjs`.
// Do not run this alongside the former one-shot cron worker.
//
// Env: PM2 only sets NODE_ENV. The process loads authoritative
// `.env.production` from cwd via Next.js `@next/env` (deploy already links
// `shared/.env.production` into the release). Do not rely on a once-saved
// shell env or `pm2 save` for secrets. Never put secrets in this file.
module.exports = {
  apps: [{
    name: "audiolad-studio-render-worker",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-studio-render-worker.mts",
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
