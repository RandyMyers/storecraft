const express = require("express");
const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const adminTemplatesController = require("../controllers/adminTemplatesController");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/", adminTemplatesController.listAll);
router.post("/", adminTemplatesController.create);
router.get("/:slug", adminTemplatesController.getBySlug);
router.patch("/:slug", adminTemplatesController.patchBySlug);
router.delete("/:slug", adminTemplatesController.removeBySlug);

module.exports = router;
