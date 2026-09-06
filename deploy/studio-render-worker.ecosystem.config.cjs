// Long-lived Studio render queue consumer. An operator must apply the lease
// heartbeat migration and then start/restart this process explicitly:
// `pm2 start deploy/studio-render-worker.ecosystem.config.cjs`
// or `pm2 restart audiolad-studio-render-worker --update-env` after deploy.
// Do not run this alongside the former one-shot cron worker.
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
