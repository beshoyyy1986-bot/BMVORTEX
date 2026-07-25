/**
 * Vortex BM — legacy Express routes
 * Mounted at /api in the api-server app.
 */
import express from 'express';
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

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/admin', adminRoutes);
router.use('/ads', adsRoutes);
router.use('/cards', cardsRoutes);
router.use('/paypal', paypalRoutes);
router.use('/iban', ibanRoutes);
router.use('/funds', fundsRoutes);
router.use('/ads', partnershipRoutes);
router.use('/proxy', proxyRoutes);
router.use('/meta', metaRoutes);
router.use('/mini-meta', miniMetaRoutes);
router.use('/meta-one-way', metaAdsOneWayRoutes);
router.use('/cc-from-bm', ccFromBmRoutes);
router.use('/bm-creator', bmCreatorRoutes);
router.use('/payments', paymentsRoutes);
router.use('/cc-tools', ccToolsRoutes);

export default router;
