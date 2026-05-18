const express = require("express");
const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const adminHostingerController = require("../controllers/adminHostingerController");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/hostinger/status", adminHostingerController.status);
router.get("/hostinger/sites", adminHostingerController.listTenantSites);
router.get("/hostinger/domains", adminHostingerController.listCustomDomains);
router.get("/hostinger/portfolio", adminHostingerController.listPortfolio);
router.get("/hostinger/hosting/orders", adminHostingerController.listHostingOrders);
router.get("/hostinger/hosting/websites", adminHostingerController.listHostingWebsites);
router.post("/hostinger/hosting/free-subdomain", adminHostingerController.generateFreeSubdomain);
router.get("/hostinger/dns-zones/:zone", adminHostingerController.getDnsZone);
router.post("/hostinger/dns-zones/wildcard", adminHostingerController.applyWildcardDns);
router.post("/hostinger/domains/:domainId/apply-txt", adminHostingerController.applyDomainTxt);
router.post("/hostinger/sites/:siteId/provision-subdomain", adminHostingerController.provisionSubdomain);
router.post("/hostinger/sites/:siteId/subdomain-status", adminHostingerController.markSubdomainProvisioned);

module.exports = router;
