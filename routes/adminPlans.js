const express = require("express");
const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const adminPlansController = require("../controllers/adminPlansController");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/", adminPlansController.listAll);
router.post("/", adminPlansController.create);
router.get("/:slug", adminPlansController.getBySlug);
router.patch("/:slug", adminPlansController.patchBySlug);
router.delete("/:slug", adminPlansController.removeBySlug);

module.exports = router;
