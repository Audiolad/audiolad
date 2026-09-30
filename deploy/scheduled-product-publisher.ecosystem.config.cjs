// Long-lived publisher for approved products with scheduled_publish_at.
// Env secrets are loaded by the process from the release .env.production
// symlink; this file intentionally contains no credentials.
module.exports = {
  apps: [{
    name: "audiolad-scheduled-product-publisher",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-scheduled-product-publisher.mts",
    autorestart: true,
    instances: 1,
    exec_mode: "fork",
    min_uptime: "10s",
    max_restarts: 10,
    kill_timeout: 10000,
    treekill: true,
    env: { NODE_ENV: "production" },
  }],
};
