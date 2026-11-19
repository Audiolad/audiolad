// t1578u M3: hourly seals of the play log (hash chain). The script exits after one run.
// Operator: `pm2 start deploy/evidence-seal.ecosystem.config.cjs`
// only after migration 20270330120000 is applied and the service-role env is set.
module.exports = {
  apps: [{
    name: "audiolad-evidence-seal",
    cwd: "/var/www/audiolad-deploy/current",
    script: "node_modules/.bin/tsx",
    args: "scripts/run-evidence-seal.mts",
    autorestart: false,
    instances: 1,
    exec_mode: "fork",
    cron_restart: "7 * * * *",
    env: { NODE_ENV: "production" },
  }],
};
