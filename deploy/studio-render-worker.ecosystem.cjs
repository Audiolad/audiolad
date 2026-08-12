// Prepared only: this file is deliberately not referenced by the active PM2
// ecosystem. An operator must apply the Phase 2A migration and explicitly run
// `pm2 start deploy/studio-render-worker.ecosystem.cjs` after provisioning the
// service-role environment.
module.exports = {
  apps: [{
    name: "audiolad-studio-render-worker",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-studio-render-worker.mts",
    autorestart: false,
    instances: 1,
    exec_mode: "fork",
    cron_restart: "*/2 * * * *",
    env: { NODE_ENV: "production" },
  }],
};
