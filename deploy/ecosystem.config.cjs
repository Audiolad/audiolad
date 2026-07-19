module.exports = {
  apps: [
    {
      name: "audiolad",
      cwd: "/var/www/audiolad-deploy/current",
      // Run Next directly so PM2 signal handling releases :3000 on reload.
      // npm start leaves orphan next-server processes and causes EADDRINUSE loops.
      script: "node_modules/next/dist/bin/next",
      args: "start",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        AUDIOLAD_PRODUCTION_SERVER: "1",
      },
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      listen_timeout: 10000,
      kill_timeout: 15000,
      restart_delay: 2000,
      treekill: true,
    },
  ],
};
