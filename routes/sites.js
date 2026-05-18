const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const sitesController = require("../controllers/sitesController");
const domainsController = require("../controllers/domainsController");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.get("/", sitesController.list);
router.post("/", sitesController.create);
router.post("/:siteId/pages", sitesController.addPage);
router.delete("/:siteId/pages/:pageId", sitesController.removePage);
router.get("/:siteId/domains", domainsController.list);
router.post("/:siteId/domains", domainsController.create);
router.delete("/:siteId/domains/:domainId", domainsController.remove);
router.post("/:siteId/domains/:domainId/primary", domainsController.setPrimary);
router.post("/:siteId/domains/:domainId/verify", domainsController.requestVerify);
router.post("/:siteId/domains/:domainId/hostinger/apply-txt", domainsController.applyHostingerTxt);
router.post("/:siteId/domains/:domainId/ssl-check", domainsController.requestSslCheck);
router.get("/:siteId/leads", sitesController.listLeads);
router.get("/:siteId/publish/history", sitesController.listPublishHistory);
router.post("/:siteId/publish/rollback", sitesController.rollbackPublish);
router.post("/:siteId/publish/restore/:revisionId", sitesController.restorePublishRevision);
router.post("/:siteId/publish", sitesController.publish);
router.get("/:siteId", sitesController.getById);
router.patch("/:siteId", sitesController.patch);

module.exports = router;
