const mongoose = require("mongoose");

const Booking = require("../models/Booking");
const Bill = require("../models/Bill");
const OperatorWageBill = require("../models/OperatorWageBill");

const isAdmin = (req) => req.user?.role === "admin";

// ======================================
// GET COMPLETED JOBS FOR ADMIN
// ======================================
exports.getCompletedJobs = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    const jobs = await Booking.find({ status: "Completed" })
      .populate("userId", "username email phone location")
      .populate("operatorId", "username email phone")
      .sort({ updatedAt: -1 });

    const bookingIds = jobs.map((job) => job._id);

    const customerBills = await Bill.find({
      bookingId: { $in: bookingIds },
    });

    const wageBills = await OperatorWageBill.find({
      bookingId: { $in: bookingIds },
    });

    const result = jobs.map((job) => {
      const customerBill = customerBills.find(
        (bill) => String(bill.bookingId) === String(job._id)
      );

      const wageBill = wageBills.find(
        (bill) => String(bill.bookingId) === String(job._id)
      );

      return {
        ...job.toObject(),
        customerBill: customerBill || null,
        operatorWageBill: wageBill || null,
      };
    });

    return res.status(200).json({
      jobs: result,
    });
  } catch (error) {
    console.error("Get completed jobs error:", error);

    return res.status(500).json({
      message: "Unable to fetch completed jobs",
    });
  }
};

// ======================================
// CREATE OPERATOR WAGE BILL
// ======================================
exports.createOperatorWageBill = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    const { bookingId, ratePerHour } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        message: "Invalid booking ID",
      });
    }

    const rate = Number(ratePerHour);

    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(400).json({
        message: "Enter a valid hourly wage",
      });
    }

    const job = await Booking.findOne({
      _id: bookingId,
      status: "Completed",
    });

    if (!job) {
      return res.status(404).json({
        message: "Completed job not found",
      });
    }

    if (!job.operatorId) {
      return res.status(400).json({
        message: "No operator assigned to this job",
      });
    }

    // Customer bill is the source of working hours.
    const customerBill = await Bill.findOne({ bookingId });

    if (!customerBill) {
      return res.status(400).json({
        message: "Create the customer bill before creating the operator wage bill",
      });
    }

    const hours =
      Number(
        customerBill.totalHours ??
          (
            Number(customerBill.closingReading || 0) -
            Number(customerBill.startingReading || 0)
          )
      );

    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({
        message: "Valid working hours are not available in the customer bill",
      });
    }

    const existing = await OperatorWageBill.findOne({ bookingId });

    if (existing) {
      return res.status(409).json({
        message: "Operator wage bill already exists for this job",
      });
    }

    const totalAmount = Number((hours * rate).toFixed(2));

    const wageBill = await OperatorWageBill.create({
      bookingId,
      customerBillId: customerBill._id,
      operatorId: job.operatorId,
      adminId: req.user._id,
      workingHours: hours,
      ratePerHour: rate,
      totalAmount,
      paymentStatus: "Pending",
    });

    const populated = await OperatorWageBill.findById(wageBill._id)
      .populate("operatorId", "username email phone")
      .populate("bookingId");

    return res.status(201).json({
      message: "Operator wage bill created successfully",
      wageBill: populated,
    });
  } catch (error) {
    console.error("Create operator wage bill error:", error);

    return res.status(500).json({
      message: "Unable to create operator wage bill",
    });
  }
};

// ======================================
// GET ALL OPERATOR WAGE BILLS
// ======================================
exports.getAllOperatorWageBills = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    const wageBills = await OperatorWageBill.find()
      .populate("operatorId", "username email phone")
      .populate("bookingId")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      wageBills,
    });
  } catch (error) {
    console.error("Get operator wage bills error:", error);

    return res.status(500).json({
      message: "Unable to fetch operator wage bills",
    });
  }
};

// ======================================
// PROCESS OPERATOR PAYMENT
// ======================================
exports.payOperatorWageBill = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        message: "Admin access required",
      });
    }

    const { id } = req.params;
    const { paymentDate, paymentMethod, transactionId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid wage bill ID",
      });
    }

    const wageBill = await OperatorWageBill.findById(id);

    if (!wageBill) {
      return res.status(404).json({
        message: "Operator wage bill not found",
      });
    }

    if (wageBill.paymentStatus === "Paid") {
      return res.status(400).json({
        message: "This operator wage bill is already paid",
      });
    }

    if (!["Bank Transfer", "UPI", "Cash"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method",
      });
    }

    const parsedDate = paymentDate ? new Date(paymentDate) : new Date();

    if (Number.isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        message: "Invalid payment date",
      });
    }

    wageBill.paymentStatus = "Paid";
    wageBill.paymentDate = parsedDate;
    wageBill.paymentMethod = paymentMethod;
    wageBill.transactionId = transactionId || "";

    await wageBill.save();

    return res.status(200).json({
      message: "Operator payment completed successfully",
      wageBill,
    });
  } catch (error) {
    console.error("Pay operator wage bill error:", error);

    return res.status(500).json({
      message: "Unable to process operator payment",
    });
  }
};
// ======================================
// GET LOGGED-IN OPERATOR'S WAGE BILLS
// ======================================
exports.getMyOperatorWageBills = async (req, res) => {
  try {
    if (req.user?.role !== "operator") {
      return res.status(403).json({
        message: "Operator access required",
      });
    }

    const wageBills = await OperatorWageBill.find({
      operatorId: req.user._id,
    })
      .populate({
        path: "bookingId",
        populate: {
          path: "userId",
          select: "username email phone",
        },
      })
      .sort({ createdAt: -1 });

    const totalEarnings = wageBills.reduce(
      (total, bill) => total + bill.totalAmount,
      0
    );

    const paidAmount = wageBills
      .filter((bill) => bill.paymentStatus === "Paid")
      .reduce((total, bill) => total + bill.totalAmount, 0);

    const pendingAmount = wageBills
      .filter((bill) => bill.paymentStatus === "Pending")
      .reduce((total, bill) => total + bill.totalAmount, 0);

    return res.status(200).json({
      wageBills,
      summary: {
        totalEarnings,
        paidAmount,
        pendingAmount,
        totalJobs: wageBills.length,
      },
    });
  } catch (error) {
    console.error("Get my operator wage bills error:", error);

    return res.status(500).json({
      message: "Unable to fetch your wage bills",
    });
  }
};