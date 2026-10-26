// Long-lived audiolad.ru search recrawl worker. One process, about every
// five minutes. Not cron_restart and not triggered by public page loads.
//
// Start once, after the migration is applied and with explicit production
// approval:
//   pm2 start deploy/search-recrawl-worker.ecosystem.config.cjs
//   pm2 save
//
// Env: PM2 only sets NODE_ENV. The process loads authoritative
// `.env.production` from cwd via Next.js `@next/env`. Do not put secrets
// in this file and do not rely on a once-saved shell / `pm2 save` for them.
// This app is audiolad.ru only. Do not reuse another site's Webmaster host id.
module.exports = {
  apps: [
    {
      name: "audiolad-search-recrawl-worker",
      cwd: "/var/www/audiolad-deploy/current",
      script: "node_modules/.bin/tsx",
      args: "scripts/run-search-recrawl-worker.mts",
      autorestart: true,
      instances: 1,
      exec_mode: "fork",
      min_uptime: "10s",
      max_restarts: 10,
      kill_timeout: 15000,
      treekill: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
