const express = require("express");
const { requireAuth } = require("../middleware/requireAuth");
const accountController = require("../controllers/accountController");
const billingController = require("../controllers/billingController");

const router = express.Router();

router.use(requireAuth);

router.get("/plan", billingController.getPlan);
router.post("/payment-requests", billingController.createPaymentRequest);
router.get("/payment-requests", billingController.listMyPaymentRequests);

router.get("/export", accountController.exportData);
router.delete("/", accountController.deleteAccount);

module.exports = router;
