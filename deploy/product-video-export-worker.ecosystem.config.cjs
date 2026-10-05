// Long-lived author product MP4 render queue consumer.
// Secrets are loaded from the release .env.production by the worker.
module.exports = {
  apps: [{
    name: "audiolad-product-video-export-worker",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-product-video-export-worker.mts",
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
