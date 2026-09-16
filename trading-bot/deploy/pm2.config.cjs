// PM2 supervisor config for the 24/7 paper process. `pm2 start deploy/pm2.config.cjs`.
// PM2 restarts on crash and rotates stdout; the app also writes structured JSON
// logs via src/log.ts. No exchange keys; paper only.
module.exports = {
  apps: [
    {
      name: 'mrcash',
      script: 'src/index.ts',
      args: 'paper',
      interpreter: 'node',
      cwd: __dirname + '/..',
      env: { NODE_ENV: 'production', MRCASH_DATA_DIR: __dirname + '/../data' },
      max_restarts: 20,
      restart_delay: 5000,
      autorestart: true,
      max_memory_restart: '400M',
    },
  ],
}
