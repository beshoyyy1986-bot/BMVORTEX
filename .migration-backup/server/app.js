import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import adsRoutes from './routes/ads.js';
import cardsRoutes from './routes/cards.js';
import paypalRoutes from './routes/paypal.js';
import ibanRoutes from './routes/iban.js';
import fundsRoutes from './routes/funds.js';
import partnershipRoutes from './routes/partnership.js';
import proxyRoutes from './routes/proxy.js';
import metaRoutes from './routes/meta.js';
import miniMetaRoutes from './routes/miniMeta.js';
import metaAdsOneWayRoutes from './routes/metaAdsOneWay.js';
import ccFromBmRoutes from './routes/ccFromBm.js';
import bmCreatorRoutes from './routes/bmCreator.js';
import adminRoutes from './routes/adminRoutes.js';
import ccToolsRoutes from './routes/ccTools.js';
import paymentsRoutes from './routes/payments.js';
import { getProxyManager } from './utils/proxyManager.js';

export const proxyManager = getProxyManager();

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/admin', adminRoutes);
app.use('/api/ads', adsRoutes);
app.use('/api/cards', cardsRoutes);
app.use('/api/paypal', paypalRoutes);
app.use('/api/iban', ibanRoutes);
app.use('/api/funds', fundsRoutes);
app.use('/api/ads', partnershipRoutes);
app.use('/api/proxy', proxyRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/mini-meta', miniMetaRoutes);
app.use('/api/meta-one-way', metaAdsOneWayRoutes);
app.use('/api/cc-from-bm', ccFromBmRoutes);
app.use('/api/bm-creator', bmCreatorRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/cc-tools', ccToolsRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

export default app;
