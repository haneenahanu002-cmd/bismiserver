
const axios = require("axios");
const crypto = require("crypto");

const Bill = require("../models/Bill");
const Payment = require("../models/Payment");
const User = require("../models/User");

const API_VERSION = "2025-01-01";

const CASHFREE_BASE_URL =
  process.env.CASHFREE_ENV === "PRODUCTION"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";

const getCashfreeHeaders = () => ({
  "Content-Type": "application/json",
  "x-api-version": API_VERSION,
  "x-client-id": process.env.CASHFREE_CLIENT_ID,
  "x-client-secret": process.env.CASHFREE_CLIENT_SECRET,
});

const generateOrderId = () =>
  `bismi_${crypto.randomUUID().replace(/-/g, "")}`;

const getBillAmount = (bill) =>
  Number(bill.adminFinalAmount ?? bill.totalAmount);

// ==========================================
// MARK PAYMENT SUCCESSFUL
// ==========================================
const markPaymentSuccessful = async (payment, cfPaymentId) => {
  const bill = await Bill.findOne({
    _id: payment.billId,
    userId: payment.userId,
    approvalStatus: "Approved",
  });

  if (!bill) {
    throw new Error("Approved customer bill not found.");
  }

  const finalAmount = getBillAmount(bill);

  if (
    Math.round(finalAmount * 100) !==
    Math.round(Number(payment.amount) * 100)
  ) {
    throw new Error("Bill amount mismatch.");
  }

  payment.status = "PAID";
  payment.cfPaymentId = String(cfPaymentId || "");
  await payment.save();

  return bill;
};

// ==========================================
// CUSTOMER: CREATE UPI PAYMENT ORDER
// POST /api/payments/upi/create-order/:billId
// ==========================================

const createUpiOrder = async (req, res) => {
  let payment;

  try {
    // 1. Customer role validation
    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only customers can make payments.",
      });
    }

    // 2. Cashfree credentials validation
    if (
      !process.env.CASHFREE_CLIENT_ID ||
      !process.env.CASHFREE_CLIENT_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Cashfree API credentials are missing.",
      });
    }

    // 3. Find approved bill
    const bill = await Bill.findOne({
      _id: req.params.billId,
      userId: req.user._id,
      approvalStatus: "Approved",
    });

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Approved bill not found.",
      });
    }

    // 4. Get bill amount
    const amount = getBillAmount(bill);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill amount.",
      });
    }

    // 5. Find latest payment record
    payment = await Payment.findOne({
      billId: bill._id,
      userId: req.user._id,
    }).sort({ createdAt: -1 });

    // 6. Already paid check
    if (payment?.status === "PAID") {
      return res.status(409).json({
        success: false,
        message: "This bill has already been paid.",
      });
    }

    // 7. Existing pending payment check
    if (payment?.status === "PENDING") {

      // Cash pending - don't allow UPI
      if (payment.paymentMethod === "CASH") {
        return res.status(409).json({
          success: false,
          message: "A cash payment is already pending for this bill.",
        });
      }

      // Check existing UPI order with Cashfree
      try {
        const existingOrder = await axios.get(
          `${CASHFREE_BASE_URL}/orders/${payment.orderId}`,
          {
            headers: getCashfreeHeaders(),
            timeout: 15000,
          }
        );

        const orderStatus = existingOrder.data.order_status;

        // Existing order is still active
        if (
          orderStatus === "ACTIVE" &&
          existingOrder.data.payment_session_id
        ) {
          return res.status(200).json({
            success: true,
            message: "Existing payment order retrieved.",
            orderId: payment.orderId,
            paymentSessionId:
              existingOrder.data.payment_session_id,
            amount: payment.amount,
            currency: "INR",
          });
        }

        // Cashfree says already paid
        if (orderStatus === "PAID") {
          return res.status(409).json({
            success: false,
            message:
              "Payment may already be completed. Please verify your payment.",
          });
        }

        // Expired or terminated order
        if (
          orderStatus === "EXPIRED" ||
          orderStatus === "TERMINATED"
        ) {
          payment.status = "FAILED";
          await payment.save();
        } else {
          return res.status(409).json({
            success: false,
            message: "Your previous payment is still processing.",
          });
        }

      } catch (cashfreeError) {

        // Only mark failed if Cashfree confirms order doesn't exist
        if (cashfreeError.response?.status === 404) {
          payment.status = "FAILED";
          await payment.save();
        } else {
          console.error(
            "Existing Cashfree order check failed:",
            cashfreeError.response?.data ||
              cashfreeError.message
          );

          return res.status(503).json({
            success: false,
            message:
              "Unable to check previous payment. Please try again.",
          });
        }
      }
    }

    // 8. Get customer details
    const customer = await User.findById(req.user._id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer account not found.",
      });
    }

    const phone = String(customer.phone || "").replace(/\D/g, "");

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Please update your valid 10-digit phone number.",
      });
    }

    if (!customer.email) {
      return res.status(400).json({
        success: false,
        message: "Customer email is required.",
      });
    }

    // 9. Generate new order ID
    const orderId = generateOrderId();

    // 10. Reuse failed payment record or create new record
    if (payment) {
      payment.orderId = orderId;
      payment.amount = amount;
      payment.currency = "INR";
      payment.paymentMethod = "UPI";
      payment.status = "PENDING";
      payment.cfOrderId = "";
      payment.cfPaymentId = "";

      await payment.save();

    } else {
      payment = await Payment.create({
        billId: bill._id,
        userId: req.user._id,
        orderId,
        amount,
        currency: "INR",
        paymentMethod: "UPI",
        status: "PENDING",
      });
    }

    // 11. Cashfree request body
    const requestBody = {
      order_id: orderId,
      order_amount: amount,
      order_currency: "INR",

      customer_details: {
        customer_id: String(req.user._id),
        customer_name: customer.username || "Customer",
        customer_email: customer.email,
        customer_phone: phone,
      },

      order_meta: {
        return_url:
          `${process.env.FRONTEND_URL}/userpayments?order_id=${orderId}`,
      },

      order_note: `Bismi Earth Movers bill ${bill._id}`,
    };

    // 12. Create Cashfree order
    const response = await axios.post(
      `${CASHFREE_BASE_URL}/orders`,
      requestBody,
      {
        headers: getCashfreeHeaders(),
        timeout: 20000,
      }
    );

    if (!response.data.payment_session_id) {
      throw new Error(
        "Cashfree did not return a payment session ID."
      );
    }

    // 13. Save Cashfree order ID
    payment.cfOrderId = String(
      response.data.cf_order_id || ""
    );

    await payment.save();

    // 14. Send response to frontend
    return res.status(201).json({
      success: true,
      message: "Payment order created successfully.",
      orderId,
      paymentSessionId:
        response.data.payment_session_id,
      amount,
      currency: "INR",
    });

  } catch (error) {

    console.error(
      "Cashfree order error:",
      error.response?.data || error.message
    );

    // Mark failed only when this request created an order attempt.
    // Don't mark an older pending order failed for unrelated errors.
    if (payment && payment.status === "PENDING") {
      payment.status = "FAILED";

      await payment.save().catch((err) => {
        console.error(
          "Payment update error:",
          err.message
        );
      });
    }

    return res.status(
      error.response?.status || 500
    ).json({
      success: false,
      message: "Unable to create payment order.",
      error: error.response?.data || error.message,
    });
  }
};


// ==========================================
// CUSTOMER: VERIFY UPI PAYMENT
// GET /api/payments/verify/:orderId
// ==========================================
const verifyUpiPayment = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only customers can verify payments.",
      });
    }

    const payment = await Payment.findOne({
      orderId: req.params.orderId,
      userId: req.user._id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found.",
      });
    }

    if (payment.paymentMethod !== "UPI") {
      return res.status(400).json({
        success: false,
        message: "This is not a UPI payment.",
      });
    }

    if (payment.status === "PAID") {
      return res.status(200).json({
        success: true,
        paymentStatus: "PAID",
      });
    }

    if (payment.status === "FAILED") {
      return res.status(200).json({
        success: true,
        paymentStatus: "FAILED",
      });
    }

    const headers = getCashfreeHeaders();

    const orderResponse = await axios.get(
      `${CASHFREE_BASE_URL}/orders/${payment.orderId}`,
      { headers }
    );

    if (orderResponse.data.order_status !== "PAID") {
      return res.status(200).json({
        success: true,
        paymentStatus: "PENDING",
        message: "Payment is not confirmed yet.",
      });
    }

    const paymentsResponse = await axios.get(
      `${CASHFREE_BASE_URL}/orders/${payment.orderId}/payments`,
      { headers }
    );

    const successfulPayment = paymentsResponse.data.find(
      (item) =>
        item.payment_status === "SUCCESS" &&
        Math.round(Number(item.payment_amount) * 100) ===
          Math.round(Number(payment.amount) * 100)
    );

    if (!successfulPayment) {
      return res.status(200).json({
        success: true,
        paymentStatus: "PENDING",
        message: "Successful payment confirmation is pending.",
      });
    }

    await markPaymentSuccessful(
      payment,
      successfulPayment.cf_payment_id
    );

    return res.status(200).json({
      success: true,
      paymentStatus: "PAID",
      message: "Payment verified successfully.",
    });
  } catch (error) {
    console.error(
      "Verify Cashfree payment error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Payment verification failed. Please try again.",
    });
  }
};

// ==========================================
// CASHFREE WEBHOOK
// POST /api/payments/webhook
// ==========================================
const cashfreeWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-webhook-signature"];
    const timestamp = req.headers["x-webhook-timestamp"];
    const rawBody = req.rawBody;

    if (!signature || !timestamp || !rawBody) {
      return res.status(400).send("Invalid webhook request.");
    }

    if (!process.env.CASHFREE_CLIENT_SECRET) {
      return res.status(500).send("Webhook secret is missing.");
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.CASHFREE_CLIENT_SECRET)
      .update(timestamp + rawBody)
      .digest("base64");

    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      return res.status(401).send("Invalid webhook signature.");
    }

    const event = JSON.parse(rawBody);

    const orderId = event.data?.order?.order_id;
    const cfPaymentId = event.data?.payment?.cf_payment_id;
    const paymentStatus = event.data?.payment?.payment_status;

    if (!orderId || !cfPaymentId) {
      return res.status(200).send("Webhook received.");
    }

    if (paymentStatus !== "SUCCESS") {
      return res.status(200).send("Payment not successful.");
    }

    const payment = await Payment.findOne({ orderId });

    if (!payment || payment.status === "PAID") {
      return res.status(200).send("Already processed or unknown order.");
    }

    if (payment.paymentMethod !== "UPI") {
      return res.status(200).send("Not a UPI payment.");
    }

    const headers = getCashfreeHeaders();

    const orderResponse = await axios.get(
      `${CASHFREE_BASE_URL}/orders/${orderId}`,
      { headers }
    );

    const paymentsResponse = await axios.get(
      `${CASHFREE_BASE_URL}/orders/${orderId}/payments`,
      { headers }
    );

    const verifiedPayment = paymentsResponse.data.find(
      (item) =>
        String(item.cf_payment_id) === String(cfPaymentId) &&
        item.payment_status === "SUCCESS" &&
        Math.round(Number(item.payment_amount) * 100) ===
          Math.round(Number(payment.amount) * 100)
    );

    if (
      orderResponse.data.order_status === "PAID" &&
      verifiedPayment
    ) {
      await markPaymentSuccessful(payment, cfPaymentId);
    }

    return res.status(200).send("Webhook processed.");
  } catch (error) {
    console.error(
      "Cashfree webhook error:",
      error.response?.data || error.message
    );

    return res.status(500).send("Webhook processing failed.");
  }
};

// ==========================================
// CUSTOMER: REQUEST CASH PAYMENT
// POST /api/payments/cash/request
// ==========================================
const requestCashPayment = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only customers can request cash payment.",
      });
    }

    const { billId } = req.body;

    if (!billId) {
      return res.status(400).json({
        success: false,
        message: "Bill ID is required.",
      });
    }

    const bill = await Bill.findOne({
      _id: billId,
      userId: req.user._id,
      approvalStatus: "Approved",
    });

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Approved bill not found.",
      });
    }

    const amount = getBillAmount(bill);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid bill amount.",
      });
    }

    let payment = await Payment.findOne({
      billId: bill._id,
      userId: req.user._id,
    });

    if (payment?.status === "PAID") {
      return res.status(409).json({
        success: false,
        message: "This bill has already been paid.",
      });
    }

    if (payment?.status === "PENDING") {
      if (payment.paymentMethod === "CASH") {
        return res.status(200).json({
          success: true,
          message: "Cash payment request already submitted.",
          payment,
        });
      }

      return res.status(409).json({
        success: false,
        message: "A UPI payment is already pending for this bill.",
      });
    }

    if (payment) {
      // Reuse failed payment record.
      payment.orderId = generateOrderId();
      payment.amount = amount;
      payment.currency = "INR";
      payment.paymentMethod = "CASH";
      payment.status = "PENDING";
      payment.cfOrderId = "";
      payment.cfPaymentId = "";
      await payment.save();
    } else {
      payment = await Payment.create({
        billId: bill._id,
        userId: req.user._id,
        orderId: generateOrderId(),
        amount,
        currency: "INR",
        paymentMethod: "CASH",
        status: "PENDING",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Cash payment request submitted.",
      payment,
    });
  } catch (error) {
    console.error("Cash request error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit cash payment request.",
    });
  }
};

// ==========================================
// CUSTOMER: GET MY PAYMENTS
// GET /api/payments/my-payments
// ==========================================
const getMyPayments = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only customers can view payments.",
      });
    }

    const payments = await Payment.find({
      userId: req.user._id,
    })
      .populate("billId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("Get payments error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch payments.",
    });
  }
};

// ==========================================
// ADMIN: GET CASH PAYMENT REQUESTS
// GET /api/payments/admin/cash-requests
// ==========================================
const getCashPaymentRequests = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only.",
      });
    }

    const payments = await Payment.find({
      paymentMethod: "CASH",
      status: "PENDING",
    })
      .populate("billId")
      .populate("userId", "username email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("Cash requests error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch cash payment requests.",
    });
  }
};

// ==========================================
// ADMIN: CONFIRM CASH PAYMENT
// PATCH /api/payments/admin/cash/:id/confirm
// ==========================================
const confirmCashPayment = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access only.",
      });
    }

    const payment = await Payment.findOne({
      _id: req.params.id,
      paymentMethod: "CASH",
      status: "PENDING",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Pending cash payment request not found.",
      });
    }

    await markPaymentSuccessful(payment, "CASH");

    return res.status(200).json({
      success: true,
      message: "Cash payment confirmed successfully.",
      payment,
    });
  } catch (error) {
    console.error("Confirm cash payment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to confirm cash payment.",
    });
  }
};
// Admin: Get all customer payments


// ==========================================
// ADMIN: GET ALL CUSTOMER PAYMENTS
// GET /api/payments/admin/all
// ==========================================
const getAllPaymentsForAdmin = async (req, res) => {
  try {
    // Admin access check
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    // Fetch all payment records
    const allPayments = await Payment.find()
      .populate("userId", "username email phone")
      .populate({
        path: "billId",
        populate: {
          path: "bookingId",
          select: "machine work date",
        },
      })
      .sort({ createdAt: -1 });

    // Show only one payment per bill
    const paymentMap = new Map();

    for (const payment of allPayments) {
      const billKey = String(
        payment.billId?._id || payment.billId
      );

      const existing = paymentMap.get(billKey);

      // First record is the latest because records are sorted newest first.
      // But always prefer PAID over non-PAID.
      if (
        !existing ||
        (payment.status === "PAID" &&
          existing.status !== "PAID")
      ) {
        paymentMap.set(billKey, payment);
      }
    }

    const payments = Array.from(paymentMap.values());

    return res.status(200).json({
      success: true,
      message: "Payments fetched successfully.",
      totalPayments: payments.length,
      payments,
    });

  } catch (error) {
    console.error("Admin Payments Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch payments.",
    });
  }
};


module.exports = {
  createUpiOrder,
  verifyUpiPayment,
  cashfreeWebhook,
  requestCashPayment,
  getMyPayments,
  getCashPaymentRequests,
  confirmCashPayment,
   cashfreeWebhook,
  getAllPaymentsForAdmin,
};
