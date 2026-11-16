
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authmiddleware");

const {
  createUpiOrder,
  verifyUpiPayment,
  requestCashPayment,
  getMyPayments,
  getCashPaymentRequests,
  confirmCashPayment,
  cashfreeWebhook,
   getAllPaymentsForAdmin,
} = require("../controllers/paymentController");

// Cashfree webhook
// Public route - signature verification happens in controller
router.post("/webhook", cashfreeWebhook);

// Customer payment routes
router.post("/upi/create-order/:billId", authMiddleware, createUpiOrder);
router.get("/verify/:orderId", authMiddleware, verifyUpiPayment);

router.post("/cash/request", authMiddleware, requestCashPayment);
router.get("/my-payments", authMiddleware, getMyPayments);

// Admin cash payment routes
router.get(
  "/admin/cash-requests",
  authMiddleware,
  getCashPaymentRequests
);

router.patch(
  "/admin/cash/:id/confirm",
  authMiddleware,
  confirmCashPayment
);

router.get("/admin/all", authMiddleware, getAllPaymentsForAdmin);
module.exports = router;
