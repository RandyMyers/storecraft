const express = require("express");
const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const { adminIntegrationSecretsRateLimit } = require("../middleware/adminIntegrationSecretsRateLimit");
const { adminSecretMutationRateLimit } = require("../middleware/adminSecretMutationRateLimit");
const adminSecretsController = require("../controllers/adminSecretsController");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/secrets", adminIntegrationSecretsRateLimit, adminSecretsController.listSecrets);
router.post("/secrets", adminSecretMutationRateLimit, adminSecretsController.createSecret);
router.patch("/secrets/:id", adminSecretMutationRateLimit, adminSecretsController.updateSecret);
router.post("/secrets/:id/rotate", adminSecretMutationRateLimit, adminSecretsController.rotateSecret);
router.post("/secrets/:id/test", adminSecretMutationRateLimit, adminSecretsController.testSecret);
router.post("/secrets/:id/disable", adminSecretMutationRateLimit, adminSecretsController.disableSecret);
router.post("/secrets/:id/enable", adminSecretMutationRateLimit, adminSecretsController.enableSecret);

module.exports = router;
