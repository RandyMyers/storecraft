const express = require("express");
const plansController = require("../controllers/plansController");

const router = express.Router();

router.get("/", plansController.list);
router.get("/:slug", plansController.getBySlug);

module.exports = router;
