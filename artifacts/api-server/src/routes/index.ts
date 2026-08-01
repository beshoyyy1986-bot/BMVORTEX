import { Router, type IRouter } from "express";
import healthRouter from "./health";
import inviteRouter from "./invite";
import permissionsRouter from "./permissions";
import tempEmailRouter from "./temp-email";

// Legacy routes from the Vortex app (JS modules)
// @ts-ignore
import adsRoutes from "./legacy/ads.js";
// @ts-ignore
import cardsRoutes from "./legacy/cards.js";
// @ts-ignore
import paypalRoutes from "./legacy/paypal.js";
// @ts-ignore
import ibanRoutes from "./legacy/iban.js";
// @ts-ignore
import fundsRoutes from "./legacy/funds.js";
// @ts-ignore
import partnershipRoutes from "./legacy/partnership.js";
// @ts-ignore
import proxyRoutes from "./legacy/proxy.js";
// @ts-ignore
import metaRoutes from "./legacy/meta.js";
// @ts-ignore
import miniMetaRoutes from "./legacy/miniMeta.js";
// @ts-ignore
import metaAdsOneWayRoutes from "./legacy/metaAdsOneWay.js";
// @ts-ignore
import ccFromBmRoutes from "./legacy/ccFromBm.js";
// @ts-ignore
import bmCreatorRoutes from "./legacy/bmCreator.js";
// @ts-ignore
import adminRoutes from "./legacy/adminRoutes.js";
// @ts-ignore
import ccToolsRoutes from "./legacy/ccTools.js";
// @ts-ignore
import paymentsRoutes from "./legacy/payments.js";
// @ts-ignore
import metaCardAdderRoutes from "./legacy/metaCardAdder.js";
// @ts-ignore
import extractRoutes from "./legacy/extract.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/meta", inviteRouter);
router.use("/meta", permissionsRouter);
router.use("/meta", tempEmailRouter);

// Vortex API routes
router.use("/admin", adminRoutes);
router.use("/ads", adsRoutes);
router.use("/cards", cardsRoutes);
router.use("/paypal", paypalRoutes);
router.use("/iban", ibanRoutes);
router.use("/funds", fundsRoutes);
router.use("/ads", partnershipRoutes);
router.use("/proxy", proxyRoutes);
router.use("/meta", metaRoutes);
router.use("/mini-meta", miniMetaRoutes);
router.use("/meta-one-way", metaAdsOneWayRoutes);
router.use("/cc-from-bm", ccFromBmRoutes);
router.use("/bm-creator", bmCreatorRoutes);
router.use("/payments", paymentsRoutes);
router.use("/cc-tools", ccToolsRoutes);
router.use("/meta-card-adder", metaCardAdderRoutes);
router.use("/extract", extractRoutes);

export default router;
