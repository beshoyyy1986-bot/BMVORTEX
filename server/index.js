// Polyfill WebSocket for Node.js < 22 (required by Supabase JS v2)
import { WebSocket } from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import express from 'express';
import app, { proxyManager } from './app.js';

// ── Load .env.local so the server has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY ──
const __envDir = dirname(fileURLToPath(import.meta.url));
try {
  const envPath = join(__envDir, '..', '.env.local');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
    console.log('[VORTEX] Loaded .env.local');
  }
} catch (e) {
  console.warn('[VORTEX] Could not load .env.local:', e.message);
}

export { proxyManager };

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || (isProd ? 5000 : 3002);

if (isProd) {
  const distPath = join(__dirname, '..', 'dist');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(join(distPath, 'index.html'));
    });
  }
}

app.listen(PORT, () => {
  console.log(`
========================================
  VORTEX API Server Running
  Port: ${PORT}
  Time: ${new Date().toLocaleString()}
========================================
  `);
});

export default app;
