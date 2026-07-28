import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import miniMetaRoutes from './routes/miniMeta.js';
import ccFromBmRoutes from './routes/ccFromBm.js';
import bmCreatorRoutes from './routes/bmCreator.js';
import paymentsRoutes from './routes/payments.js';
import extractRoutes from './routes/extract.js';

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/extract', extractRoutes);
app.use('/api/mini-meta', miniMetaRoutes);
app.use('/api/cc-from-bm', ccFromBmRoutes);
app.use('/api/bm-creator', bmCreatorRoutes);
app.use('/api/payments', paymentsRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

export default app;
