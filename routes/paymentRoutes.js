
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
  razorpayWebhook,
   getAllPaymentsForAdmin,
} = require("../controllers/paymentController");

// Razorpay webhook
// Public route - signature verification happens in controller
router.post("/webhook", razorpayWebhook);

// Customer payment routes
router.post("/upi/create-order/:billId", authMiddleware, createUpiOrder);
router.get("/verify/:orderId", authMiddleware, verifyUpiPayment);
router.post("/verify", authMiddleware, verifyUpiPayment);

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
