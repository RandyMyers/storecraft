const express = require("express");
const { requireAdminAuth } = require("../middleware/requireAdminAuth");
const adminBillingController = require("../controllers/adminBillingController");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/billing/overview", adminBillingController.getBillingOverview);
router.get("/billing/subscriptions", adminBillingController.listSubscriptions);
router.get("/payment-requests", adminBillingController.listPaymentRequests);
router.post("/payment-requests/:id/decide", adminBillingController.decidePaymentRequest);

module.exports = router;
