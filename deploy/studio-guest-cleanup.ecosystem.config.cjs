// Daily expired-guest cleanup. The script exits after one run.
// Operator: `pm2 start deploy/studio-guest-cleanup.ecosystem.config.cjs`
// after the guest-mode migration is applied and the service-role env is set.
module.exports = {
  apps: [{
    name: "audiolad-studio-guest-cleanup",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-studio-guest-cleanup.mts",
    autorestart: false,
    instances: 1,
    exec_mode: "fork",
    cron_restart: "15 3 * * *",
    env: { NODE_ENV: "production" },
  }],
};
