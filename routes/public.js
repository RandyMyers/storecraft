const express = require("express");
const publicController = require("../controllers/publicController");
const publicFormController = require("../controllers/publicFormController");

const router = express.Router();

router.get("/by-host/redirect", publicController.redirectMatchByHost);
router.get("/by-host", publicController.getPublishedByHost);
router.get("/by-host/page/:pageSlug", publicController.getPublishedByHost);

router.post("/sites/:subdomain/form", publicFormController.submit);
router.get("/sites/:subdomain/robots.txt", publicController.getRobotsTxt);
router.get("/sites/:subdomain/sitemap.xml", publicController.getSitemapXml);
router.get("/sites/:subdomain/redirect", publicController.redirectMatch);

router.get("/sites/:subdomain", publicController.getPublished);
router.get("/sites/:subdomain/page/:pageSlug", publicController.getPublished);

module.exports = router;
