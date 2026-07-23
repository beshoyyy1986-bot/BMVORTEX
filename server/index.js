// Polyfill WebSocket for Node.js < 22 (required by Supabase JS v2)
import { WebSocket } from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import express from 'express';
import app, { proxyManager } from './app.js';

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
