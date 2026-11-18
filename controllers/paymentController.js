
const axios = require("axios");
const crypto = require("crypto");

const Bill = require("../models/Bill");
const Payment = require("../models/Payment");
const User = require("../models/User");

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

    // 2. Razorpay credentials validation
    if (
      !process.env.RAZORPAY_KEY_ID ||
      !process.env.RAZORPAY_KEY_SECRET
    ) {
      return res.status(500).json({
        success: false,
        message: "Razorpay API credentials are missing.",
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

      // Check existing UPI order with Razorpay
      if (payment.cfOrderId) {
        try {
          const auth = Buffer.from(
            `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
          ).toString("base64");

          const existingPayments = await axios.get(
            `https://api.razorpay.com/v1/orders/${payment.cfOrderId}/payments`,
            {
              headers: {
                Authorization: `Basic ${auth}`,
              },
              timeout: 15000,
            }
          );

          const capturedPayment = Array.isArray(
            existingPayments.data?.items
          )
            ? existingPayments.data.items.find(
                (item) => item.status === "captured"
              )
            : null;

          if (capturedPayment) {
            await markPaymentSuccessful(
              payment,
              capturedPayment.id
            );

            return res.status(409).json({
              success: false,
              message:
                "Payment may already be completed. Please verify your payment.",
            });
          }

          // Reuse existing Razorpay order
          return res.status(200).json({
            success: true,
            message: "Razorpay order created successfully.",
            orderId: String(payment._id),
            razorpayOrderId: payment.cfOrderId,
            keyId: process.env.RAZORPAY_KEY_ID,
            amount: Number(payment.amount || 0),
            currency: "INR",
          });
        } catch (razorpayError) {
          console.error(
            "Existing Razorpay order check failed:",
            razorpayError.response?.data ||
              razorpayError.message
          );
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

    // 11. Razorpay request body
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
    ).toString("base64");

    const requestBody = {
      amount: Math.round(amount * 100),
      currency: "INR",
      receipt: orderId,
      notes: {
        billId: String(bill._id),
        userId: String(req.user._id),
      },
    };

    // 12. Create Razorpay order
    const response = await axios.post(
      "https://api.razorpay.com/v1/orders",
      requestBody,
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      }
    );

    if (!response.data.id) {
      throw new Error(
        "Razorpay did not return an order ID."
      );
    }

    // 13. Save Razorpay order ID
    payment.cfOrderId = String(response.data.id || "");

    await payment.save();

    // 14. Send response to frontend
    return res.status(201).json({
      success: true,
      message: "Razorpay order created successfully.",
      orderId: String(payment._id),
      razorpayOrderId: response.data.id,
      keyId: process.env.RAZORPAY_KEY_ID,
      amount,
      currency: "INR",
    });

  } catch (error) {

    console.error(
      "Razorpay order error:",
      error.response?.data || error.message
    );

    // Mark failed only when a Razorpay order was actually created.
    // Do not mark an older pending payment failed for unrelated errors.
    if (
      payment &&
      payment.status === "PENDING" &&
      payment.cfOrderId
    ) {
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

    const {
      orderId: bodyOrderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body || {};

    const orderId = bodyOrderId || req.params?.orderId;

    let payment = null;

    if (razorpayOrderId) {
      payment = await Payment.findOne({
        cfOrderId: razorpayOrderId,
        userId: req.user._id,
      });
    } else if (orderId && /^[a-fA-F0-9]{24}$/.test(orderId)) {
      payment = await Payment.findOne({
        _id: orderId,
        userId: req.user._id,
      });
    } else if (orderId) {
      payment = await Payment.findOne({
        orderId,
        userId: req.user._id,
      });
    }

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

    // Verify Razorpay signature when provided by checkout callback.
    if (
      razorpayPaymentId &&
      razorpaySignature &&
      payment.cfOrderId
    ) {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(`${payment.cfOrderId}|${razorpayPaymentId}`)
        .digest("hex");

      if (expectedSignature !== razorpaySignature) {
        payment.status = "FAILED";
        await payment.save();

        return res.status(200).json({
          success: true,
          paymentStatus: "FAILED",
          message: "Payment signature verification failed.",
        });
      }

      await markPaymentSuccessful(payment, razorpayPaymentId);

      return res.status(200).json({
        success: true,
        paymentStatus: "PAID",
        message: "Payment verified successfully.",
      });
    }

    // Fallback: check Razorpay order payments.
    if (payment.cfOrderId) {
      try {
        const auth = Buffer.from(
          `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
        ).toString("base64");

        const paymentsResponse = await axios.get(
          `https://api.razorpay.com/v1/orders/${payment.cfOrderId}/payments`,
          {
            headers: {
              Authorization: `Basic ${auth}`,
            },
            timeout: 15000,
          }
        );

        const capturedPayment = Array.isArray(
          paymentsResponse.data?.items
        )
          ? paymentsResponse.data.items.find(
              (item) => item.status === "captured"
            )
          : null;

        if (capturedPayment) {
          await markPaymentSuccessful(
            payment,
            capturedPayment.id
          );

          return res.status(200).json({
            success: true,
            paymentStatus: "PAID",
            message: "Payment verified successfully.",
          });
        }
      } catch (razorpayError) {
        console.error(
          "Verify Razorpay payment error:",
          razorpayError.response?.data ||
            razorpayError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      paymentStatus: "PENDING",
      message: "Payment is not confirmed yet.",
    });
  } catch (error) {
    console.error(
      "Verify Razorpay payment error:",
      error.response?.data || error.message
    );

    return res.status(500).json({
      success: false,
      message: "Payment verification failed. Please try again.",
    });
  }
};

// ==========================================
// RAZORPAY WEBHOOK
// POST /api/payments/webhook
// ==========================================
const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody;

    if (signature && process.env.RAZORPAY_KEY_SECRET && rawBody) {
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(rawBody)
        .digest("hex");

      if (signature !== expectedSignature) {
        return res.status(401).send("Invalid webhook signature.");
      }
    }

    const event = rawBody ? JSON.parse(rawBody) : req.body;
    const entity = event?.payload?.payment?.entity;

    if (event?.event === "payment.captured" && entity?.order_id) {
      const payment = await Payment.findOne({
        cfOrderId: entity.order_id,
      });

      if (payment && payment.status !== "PAID") {
        await markPaymentSuccessful(payment, entity.id);
      }
    }

    return res.status(200).send("Webhook processed.");
  } catch (error) {
    console.error(
      "Razorpay webhook error:",
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
  razorpayWebhook,
  requestCashPayment,
  getMyPayments,
  getCashPaymentRequests,
  confirmCashPayment,
  getAllPaymentsForAdmin,
};
