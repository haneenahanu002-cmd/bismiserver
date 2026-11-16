
const mongoose = require("mongoose");
const Bill = require("../models/Bill");
const Booking = require("../models/Booking");

// Helper: Admin role check
const isAdmin = (req) => req.user?.role === "admin";

// Helper: Operator role check
const isOperator = (req) => req.user?.role === "operator";

// ==========================================
// OPERATOR: GET COMPLETED JOBS
// ==========================================
const getCompletedJobsForBill = async (req, res) => {
  try {
    if (!isOperator(req)) {
      return res.status(403).json({
        success: false,
        message: "Only operators can access this page.",
      });
    }

    const jobs = await Booking.find({
      operatorId: req.user._id,
      status: "Completed",
    })
      .populate("userId", "username email phone")
      .populate("operatorId", "username email")
      .sort({ updatedAt: -1 });

    const bills = await Bill.find({
      operatorId: req.user._id,
    });

    const billMap = new Map(
      bills.map((bill) => [bill.bookingId.toString(), bill])
    );

    const result = jobs.map((job) => ({
      ...job.toObject(),
      bill: billMap.get(job._id.toString()) || null,
    }));

    return res.status(200).json({
      success: true,
      jobs: result,
    });
  } catch (error) {
    console.error("Get completed jobs error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch completed jobs.",
    });
  }
};

// ==========================================
// OPERATOR: CREATE AND SUBMIT BILL
// ==========================================
const createBill = async (req, res) => {
  try {
    if (!isOperator(req)) {
      return res.status(403).json({
        success: false,
        message: "Only operators can create bills.",
      });
    }

    const {
      bookingId,
      startingReading,
      closingReading,
      amount,
      shiftingCharge,
      tipper,
      batta,
      siteName,
      billDate,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID.",
      });
    }

    if (
      startingReading === undefined ||
      closingReading === undefined ||
      amount === undefined ||
      !billDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields.",
      });
    }

    const start = Number(startingReading);
    const end = Number(closingReading);
    const baseAmount = Number(amount);
    const shifting = Number(shiftingCharge ?? 0);
    const tipperAmount = Number(tipper ?? 0);
    const battaAmount = Number(batta ?? 0);

    const numbers = [
      start,
      end,
      baseAmount,
      shifting,
      tipperAmount,
      battaAmount,
    ];

    if (numbers.some((value) => !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid non-negative values.",
      });
    }

    if (end < start) {
      return res.status(400).json({
        success: false,
        message: "Closing reading cannot be less than starting reading.",
      });
    }

    const job = await Booking.findOne({
      _id: bookingId,
      operatorId: req.user._id,
      status: "Completed",
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Completed job not found.",
      });
    }

    const existingBill = await Bill.findOne({ bookingId });

    if (existingBill) {
      return res.status(409).json({
        success: false,
        message: "Bill already exists for this job.",
      });
    }

    const totalHours = Number((end - start).toFixed(2));
    const totalAmount = Number(
      (baseAmount + shifting + tipperAmount + battaAmount).toFixed(2)
    );

    const bill = await Bill.create({
      bookingId: job._id,
      userId: job.userId,
      operatorId: req.user._id,

      startingReading: start,
      closingReading: end,
      totalHours,

      amount: baseAmount,
      shiftingCharge: shifting,
      tipper: tipperAmount,
      batta: battaAmount,

      totalAmount,
      adminFinalAmount: null,

      // Important: Every new operator bill goes to Admin for approval.
      approvalStatus: "Pending",

      siteName: siteName || job.location,
      billDate,
    });

    const populatedBill = await Bill.findById(bill._id)
      .populate("bookingId")
      .populate("userId", "username email phone")
      .populate("operatorId", "username email");

    return res.status(201).json({
      success: true,
      message: "Bill submitted to Admin for approval.",
      bill: populatedBill,
    });
  } catch (error) {
    console.error("Create bill error:", error);

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Bill already exists for this job.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create bill.",
    });
  }
};

// ==========================================
// OPERATOR: GET MY BILLS
// ==========================================
const getMyBills = async (req, res) => {
  try {
    if (!isOperator(req)) {
      return res.status(403).json({
        success: false,
        message: "Only operators can access these bills.",
      });
    }

    const bills = await Bill.find({
      operatorId: req.user._id,
    })
      .populate("bookingId")
      .populate("userId", "username email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      bills,
    });
  } catch (error) {
    console.error("Get operator bills error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bills.",
    });
  }
};

// ==========================================
// OPERATOR: UPDATE OWN PENDING BILL
// ==========================================
const updateBill = async (req, res) => {
  try {
    if (!isOperator(req)) {
      return res.status(403).json({
        success: false,
        message: "Only operators can update bills.",
      });
    }

    const bill = await Bill.findOne({
      _id: req.params.id,
      operatorId: req.user._id,
    });

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found.",
      });
    }

    if (bill.approvalStatus !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending bills can be edited by the operator.",
      });
    }

    const {
      startingReading,
      closingReading,
      amount,
      shiftingCharge,
      tipper,
      batta,
      siteName,
      billDate,
    } = req.body;

    if (
      startingReading === undefined ||
      closingReading === undefined ||
      amount === undefined ||
      !billDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Please fill all required fields.",
      });
    }

    const start = Number(startingReading);
    const end = Number(closingReading);
    const baseAmount = Number(amount);
    const shifting = Number(shiftingCharge ?? 0);
    const tipperAmount = Number(tipper ?? 0);
    const battaAmount = Number(batta ?? 0);

    const numbers = [
      start,
      end,
      baseAmount,
      shifting,
      tipperAmount,
      battaAmount,
    ];

    if (numbers.some((value) => !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({
        success: false,
        message: "Enter valid non-negative values.",
      });
    }

    if (end < start) {
      return res.status(400).json({
        success: false,
        message: "Closing reading cannot be less than starting reading.",
      });
    }

    bill.startingReading = start;
    bill.closingReading = end;
    bill.totalHours = Number((end - start).toFixed(2));

    bill.amount = baseAmount;
    bill.shiftingCharge = shifting;
    bill.tipper = tipperAmount;
    bill.batta = battaAmount;

    bill.totalAmount = Number(
      (baseAmount + shifting + tipperAmount + battaAmount).toFixed(2)
    );

    bill.adminFinalAmount = null;
    bill.siteName = siteName || "";
    bill.billDate = billDate;

    await bill.save();

    return res.status(200).json({
      success: true,
      message: "Pending bill updated successfully.",
      bill,
    });
  } catch (error) {
    console.error("Update operator bill error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update bill.",
    });
  }
};

// ==========================================
// OPERATOR: GET BILL BY BOOKING
// ==========================================
const getBillByBooking = async (req, res) => {
  try {
    if (!isOperator(req)) {
      return res.status(403).json({
        success: false,
        message: "Only operators can access this bill.",
      });
    }

    const bill = await Bill.findOne({
      bookingId: req.params.bookingId,
      operatorId: req.user._id,
    })
      .populate("bookingId")
      .populate("userId", "username email phone")
      .populate("operatorId", "username email");

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found.",
      });
    }

    return res.status(200).json({
      success: true,
      bill,
    });
  } catch (error) {
    console.error("Get bill by booking error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bill.",
    });
  }
};

// ==========================================
// ADMIN: GET ALL SUBMITTED BILLS
// ==========================================
const getAllBillsForAdmin = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can access submitted bills.",
      });
    }

    const bills = await Bill.find()
      .populate("bookingId")
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      bills,
    });
  } catch (error) {
    console.error("Admin get bills error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch bills.",
    });
  }
};

// ==========================================
// ADMIN: EDIT FINAL BILL AMOUNT
// ==========================================
const updateAdminBill = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can edit bills.",
      });
    }

    const { finalAmount, adminNote } = req.body;

    const amount = Number(finalAmount);

    if (
      finalAmount === undefined ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid final amount.",
      });
    }

    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found.",
      });
    }

    if (bill.approvalStatus !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "Only pending bills can be edited by Admin.",
      });
    }

    bill.adminFinalAmount = amount;

    if (adminNote !== undefined) {
      bill.adminNote = String(adminNote).trim();
    }

    await bill.save();

    return res.status(200).json({
      success: true,
      message: "Final bill amount updated successfully.",
      bill,
    });
  } catch (error) {
    console.error("Admin update bill error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update final amount.",
    });
  }
};

// ==========================================
// ADMIN: APPROVE BILL
// ==========================================
const approveBill = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can approve bills.",
      });
    }

    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found.",
      });
    }

    if (bill.approvalStatus !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "This bill has already been reviewed.",
      });
    }

    // Use the admin-edited amount if provided.
    // Otherwise, use the operator-submitted total.
    if (bill.adminFinalAmount === null) {
      bill.adminFinalAmount = bill.totalAmount;
    }

    bill.approvalStatus = "Approved";
    bill.rejectionReason = "";
    bill.approvedAt = new Date();

    await bill.save();

    return res.status(200).json({
      success: true,
      message: "Bill approved successfully.",
      bill,
    });
  } catch (error) {
    console.error("Approve bill error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to approve bill.",
    });
  }
};

// ==========================================
// ADMIN: REJECT BILL
// ==========================================
const rejectBill = async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can reject bills.",
      });
    }

    const { rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter a rejection reason.",
      });
    }

    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({
        success: false,
        message: "Bill not found.",
      });
    }

    if (bill.approvalStatus !== "Pending") {
      return res.status(400).json({
        success: false,
        message: "This bill has already been reviewed.",
      });
    }

    bill.approvalStatus = "Rejected";
    bill.rejectionReason = rejectionReason.trim();

    await bill.save();

    return res.status(200).json({
      success: true,
      message: "Bill rejected successfully.",
      bill,
    });
  } catch (error) {
    console.error("Reject bill error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to reject bill.",
    });
  }
};

const getMyApprovedBills = async (req, res) => {
  try {
    if (req.user.role !== "user") {
      return res.status(403).json({
        success: false,
        message: "Only customers can view their bills.",
      });
    }

    const bills = await Bill.find({
      userId: req.user._id,
      approvalStatus: "Approved",
    })
      .populate("bookingId", "machine work date location address duration")
      .populate("operatorId", "username email phone")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Approved bills fetched successfully.",
      bills,
    });
  } catch (error) {
    console.error("Get customer approved bills error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch approved bills.",
      error: error.message,
    });
  }
};

module.exports = {
  getCompletedJobsForBill,
  createBill,
  getMyBills,
  updateBill,
  getBillByBooking,

  getAllBillsForAdmin,
  updateAdminBill,
  approveBill,
  rejectBill,
  getMyApprovedBills,
};
