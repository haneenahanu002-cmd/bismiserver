const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authmiddleware");

const {
  getOperatorPayments,
  createOperatorPayment,
} = require("../controllers/operatorPaymentController");

router.get("/admin/all", authMiddleware, getOperatorPayments);

router.post("/admin", authMiddleware, createOperatorPayment);

module.exports = router;