const express = require("express");
const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const adminOpsController = require("../controllers/adminOpsController");
const adminOverviewController = require("../controllers/adminOverviewController");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/overview/stats", adminOverviewController.stats);

router.get("/lookup/site", adminOpsController.lookupSite);
router.get("/lookup/domain", adminOpsController.lookupDomain);
router.get("/audit", adminOpsController.listAudit);

router.post("/domains/:domainId/verify", adminOpsController.verifyDomain);
router.post("/sites/:siteId/disable", adminOpsController.disableSite);
router.post("/sites/:siteId/enable", adminOpsController.enableSite);

module.exports = router;
