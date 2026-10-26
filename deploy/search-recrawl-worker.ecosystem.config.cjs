// Long-lived audiolad.ru search recrawl worker. One process, about every
// five minutes. Not cron_restart and not triggered by public page loads.
//
// deploy/scripts/ensure-search-recrawl-worker.sh deletes and starts this
// app from the new release after cutover. cwd stays the stable
// /var/www/audiolad-deploy/current symlink. Before each cycle the process
// compares its boot realpath with that symlink and exits 0 when they
// differ so PM2 respawns onto the new release. It does not touch the
// audiolad web process.
//
// max_restarts is intentionally huge: a crash loop backs off, it does not
// stay stopped. min_uptime still resets the counter after a healthy run.
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
      max_restarts: 1000000,
      exp_backoff_restart_delay: 2000,
      kill_timeout: 120000,
      treekill: true,
      env: { NODE_ENV: "production" },
    },
  ],
};
