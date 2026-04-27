/**
 * UAT / single-host gateway:
 * - Serves Vite build from frontend/dist (PORT, default 5000)
 * - Proxies REST + uploaded files to NestJS on 127.0.0.1:BACKEND_PORT (default 3001)
 * - Spawns Nest from backend/dist (child cwd = backend so node_modules resolves)
 *
 * Before PM2: run `npm ci` at repo root, then `npm ci` inside backend + frontend,
 * then `npm run build:uat`. Set VITE_API_BASE_URL when building frontend (same host:PORT).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const repoRoot = __dirname;
const frontendDist = path.join(repoRoot, 'frontend', 'dist');
const backendCwd = path.join(repoRoot, 'backend');

function resolveBackendMainRelative() {
  const a = path.join(backendCwd, 'dist', 'src', 'main.js');
  const b = path.join(backendCwd, 'dist', 'main.js');
  if (fs.existsSync(a)) return path.join('dist', 'src', 'main.js');
  if (fs.existsSync(b)) return path.join('dist', 'main.js');
  throw new Error(
    'Backend build not found. Expected backend/dist/src/main.js or backend/dist/main.js — run `npm run build --prefix backend`.',
  );
}

const PORT = Number(process.env.PORT || 5000);
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 3001);
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

const app = express();

if (!fs.existsSync(path.join(frontendDist, 'index.html'))) {
  console.warn(
    `[uat] frontend/dist/index.html missing — build with: npm run build --prefix frontend`,
  );
}

app.use(express.static(frontendDist));

const API_PREFIXES = [
  '/auth',
  '/users',
  '/suggestions',
  '/attachments',
  '/workflow',
  '/hrms-sync',
  '/hrms',
  '/ai',
  '/health',
  '/kaizen-files',
];

function isApiPath(p) {
  return API_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

const apiProxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  proxyTimeout: 600_000,
  timeout: 600_000,
});

app.use((req, res, next) => {
  if (isApiPath(req.path)) return apiProxy(req, res, next);
  return next();
});

/** SPA fallback — avoid Express 5 `*` path parsing issues */
app.get(/.*/, (req, res, next) => {
  if (isApiPath(req.path)) return next();
  const indexFile = path.join(frontendDist, 'index.html');
  if (!fs.existsSync(indexFile)) {
    return res.status(503).type('text/plain').send('Frontend not built (missing frontend/dist/index.html).');
  }
  return res.sendFile(indexFile);
});

let backendMainRel;
try {
  backendMainRel = resolveBackendMainRelative();
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}

const backendProcess = spawn(process.execPath, [backendMainRel], {
  cwd: backendCwd,
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(BACKEND_PORT),
  },
});

backendProcess.on('close', (code) => {
  console.error(`[uat] Nest backend exited with code ${code}`);
});

backendProcess.on('error', (err) => {
  console.error('[uat] Failed to start Nest backend:', err);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[uat] Frontend static + gateway on http://0.0.0.0:${PORT}`);
  console.log(`[uat] Nest backend proxy target ${BACKEND_URL}`);
});

function shutdown(signal) {
  console.log(`[uat] ${signal} — shutting down`);
  try {
    backendProcess.kill('SIGTERM');
  } catch {
    // ignore
  }
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
