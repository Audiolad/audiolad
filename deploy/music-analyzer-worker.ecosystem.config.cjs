// Long-lived Music Analyzer queue consumer on the audiolad.ru Timeweb VPS.
// Python itself lives outside this Next release, under
// /var/lib/audiolad/music-analyzer (pinned checkout + .venv-v03-clap + CLAP checkpoint).
// Self-refresh: the process captures its boot release identity and exits 0
// when /var/www/audiolad-deploy/current no longer matches, so PM2 respawns
// cwd=/var/www/audiolad-deploy/current.
// First production process on this revision is started by
// deploy/scripts/ensure-music-analyzer-worker.sh after cutover.
//
// Env: PM2 only sets NODE_ENV. The process loads .env.production from cwd.
// Do not put secrets, Candidate A flags, or instrument-strategy overrides here.
module.exports = {
  apps: [{
    name: "audiolad-music-analyzer-worker",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-music-analyzer-worker.mts",
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
