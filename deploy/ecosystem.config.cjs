module.exports = {
  apps: [
    {
      name: "audiolad",
      cwd: "/var/www/audiolad-deploy/current",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
