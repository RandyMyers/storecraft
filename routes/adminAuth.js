const express = require("express");
const { requireAdminApiKey } = require("../middleware/requireAdminApiKey");
const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const { adminAuthRateLimit } = require("../middleware/adminAuthRateLimit");
const adminAuthController = require("../controllers/adminAuthController");

const router = express.Router();

router.post("/login", adminAuthRateLimit, adminAuthController.loginWithPassword);
router.post("/token", adminAuthRateLimit, requireAdminApiKey, adminAuthController.mintToken);
router.post("/refresh", adminAuthRateLimit, requireAdminAuth, adminAuthController.refreshToken);

module.exports = router;
