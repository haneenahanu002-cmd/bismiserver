const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const OperatorPayment = require("../models/OperatorPayment");

const isAdmin = (req) => req.user?.role === "admin";

// ==========================================
// ADMIN: GET ALL COMPLETED JOBS
// ==========================================
exports.getAdminCompletedJobs = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can access completed jobs.",
      });
    }

    const jobs = await Booking.find({
      status: "Completed",
    })
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone")
      .sort({ updatedAt: -1 });

    const payments = await OperatorPayment.find({
      bookingId: { $in: jobs.map((job) => job._id) },
    });

    const paymentMap = new Map(
      payments.map((payment) => [
        payment.bookingId.toString(),
        payment,
      ])
    );

    const result = jobs.map((job) => ({
      ...job.toObject(),
      operatorPayment:
        paymentMap.get(job._id.toString()) || null,
    }));

    return res.status(200).json({
      success: true,
      jobs: result,
    });
  } catch (error) {
    console.error("Admin completed jobs error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch completed jobs.",
    });
  }
};

// ==========================================
// ADMIN: GET OPERATOR PAYMENT HISTORY
// ==========================================
exports.getOperatorPayments = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can access operator payments.",
      });
    }

    const payments = await OperatorPayment.find()
      .populate("bookingId")
      .populate("operatorId", "username email phone")
      .populate("adminId", "username")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      payments,
    });
  } catch (error) {
    console.error("Get operator payments error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch operator payments.",
    });
  }
};

// ==========================================
// ADMIN: CREATE OPERATOR WAGE PAYMENT
// ==========================================
exports.createOperatorPayment = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can create operator payments.",
      });
    }

    const {
      bookingId,
      amount,
      paymentDate,
      method,
      transactionId,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    const paymentAmount = Number(amount);

    if (
      !Number.isFinite(paymentAmount) ||
      paymentAmount <= 0 ||
      !paymentDate ||
      !method
    ) {
      return res.status(400).json({
        success: false,
        message: "Please enter valid payment details.",
      });
    }

    if (
      !["Bank Transfer", "UPI", "Cash"].includes(method)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method.",
      });
    }

    const job = await Booking.findOne({
      _id: bookingId,
      status: "Completed",
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Completed job not found.",
      });
    }

    if (!job.operatorId) {
      return res.status(400).json({
        success: false,
        message: "No operator is assigned to this job.",
      });
    }

    const existingPayment = await OperatorPayment.findOne({
      bookingId,
    });

    if (existingPayment) {
      return res.status(409).json({
        success: false,
        message: "Operator payment already exists for this job.",
      });
    }

    const payment = await OperatorPayment.create({
      bookingId: job._id,
      operatorId: job.operatorId,
      adminId: req.user._id,
      amount: paymentAmount,
      paymentDate,
      method,
      transactionId: transactionId || "",
      status: "Paid",
    });

    const populatedPayment = await OperatorPayment.findById(
      payment._id
    )
      .populate("bookingId")
      .populate("operatorId", "username email phone");

    return res.status(201).json({
      success: true,
      message: "Operator payment saved successfully.",
      payment: populatedPayment,
    });
  } catch (error) {
    console.error("Create operator payment error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Payment already exists for this job.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to save operator payment.",
    });
  }
};