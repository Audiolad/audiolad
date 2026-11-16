// t1485u: automatic Shazam check queue consumer for closed Business album passports.
// Self-refresh: exits 0 when /var/www/audiolad-deploy/current points at a new release,
// PM2 respawns it with cwd=/var/www/audiolad-deploy/current.
// Python/shazamio live outside the release: /var/lib/audiolad/business-shazam/.venv
// (deploy/scripts/setup-business-shazam-venv.sh). Without the venv the worker idles.
// Env: PM2 only sets NODE_ENV; secrets come from .env.production in cwd. Never put secrets here.
module.exports = {
  apps: [{
    name: "audiolad-business-shazam-worker",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-business-shazam-worker.mts",
    autorestart: true,
    instances: 1,
    exec_mode: "fork",
    min_uptime: "10s",
    max_restarts: 10,
    kill_timeout: 30000,
    treekill: true,
    max_memory_restart: "300M",
    env: { NODE_ENV: "production" },
  }],
};
