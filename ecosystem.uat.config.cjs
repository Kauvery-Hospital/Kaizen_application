/**
 * PM2 config for Windows/Linux (run from repo root).
 *
 * Setup once:
 *   npm ci
 *   npm ci --prefix backend && npm ci --prefix frontend
 *   npm run build:uat
 *
 * Start:
 *   pm2 start ecosystem.uat.config.cjs
 *   pm2 save
 *
 * Frontend API base URL is compile-time (Vite). Before `npm run build --prefix frontend`, set e.g.
 *   set VITE_API_BASE_URL=http://YOUR_HOST:5000
 * so browsers call the gateway (same origin as UI) instead of localhost:3001.
 */
module.exports = {
  apps: [
    {
      name: 'kaizen-uat',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 20,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        BACKEND_PORT: 3001,
      },
    },
  ],
};
