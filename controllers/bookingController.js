const Booking = require("../models/Booking");
const mongoose = require("mongoose");
const User = require("../models/User");

// Create booking
const createBooking = async (req, res) => {
  try {
    const {
      machine,
      work,
      date,
      startTime,
      duration,
      location,
      address,
      notes,
    } = req.body;

    if (
      !machine ||
      !work ||
      !date ||
      !startTime ||
      !duration ||
      !location ||
      !address
    ) {
      return res.status(400).json({
        message: "Please fill all required booking fields.",
      });
    }

    const booking = await Booking.create({
      userId: req.user._id,
      machine,
      work,
      date,
      startTime,
      duration: Number(duration),
      location,
      address,
      notes: notes || "",
      status: "Pending",
      operatorId: null,
    });

    return res.status(201).json({
      message: "Booking request submitted successfully.",
      booking,
    });
  } catch (error) {
    console.error("Create booking error:", error);

    return res.status(500).json({
      message: "Failed to create booking.",
    });
  }
};

// Get logged-in user's bookings
const getMyBookings = async (req, res) => {
  try {
    const bookings = await Booking.find({
      userId: req.user._id,
    })
      .populate("operatorId", "username email phone")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Bookings fetched successfully.",
      bookings,
    });
  } catch (error) {
    console.error("Get bookings error:", error);

    return res.status(500).json({
      message: "Failed to fetch bookings.",
    });
  }
};


// Get only Assigned jobs for logged-in operator
const getMyAssignedJobs = async (req, res) => {
  try {
    if (req.user.role !== "operator") {
      return res.status(403).json({
        message: "Only operators can view assigned jobs.",
      });
    }

    const bookings = await Booking.find({
      operatorId: req.user._id,
      status: "Assigned",
    })
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Assigned jobs fetched successfully.",
      bookings,
    });
  } catch (error) {
    console.error("Get assigned jobs error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch assigned jobs.",
      error: error.message,
    });
  }
};


// Operator accepts an assigned job
const acceptAssignedJob = async (req, res) => {
  try {
    if (req.user.role !== "operator") {
      return res.status(403).json({
        message: "Only operators can accept assigned jobs.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid booking ID.",
      });
    }

    const booking = await Booking.findOne({
      _id: id,
      operatorId: req.user._id,
      status: "Assigned",
    });

    if (!booking) {
      return res.status(404).json({
        message: "Assigned job not found or already accepted.",
      });
    }

    const previousDecision = booking.operatorDecision || "Pending";

    booking.status = "Accepted";
    booking.operatorDecision = "Accepted";
    booking.assignmentHistory = booking.assignmentHistory || [];
    booking.assignmentHistory.push({
      operatorId: req.user._id,
      action: "Accepted",
      previousStatus: previousDecision,
      newStatus: "Accepted",
      reason: "",
      changedBy: req.user._id,
      timestamp: new Date(),
    });

    await booking.save();

    const updatedBooking = await Booking.findById(booking._id)
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone");

    return res.status(200).json({
      message: "Job accepted successfully.",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Accept assigned job error:", error);

    return res.status(500).json({
      message: "Failed to accept assigned job.",
    });
  }
};

// Operator rejects an assigned job
const rejectAssignedJob = async (req, res) => {
  try {
    if (req.user.role !== "operator") {
      return res.status(403).json({
        message: "Only operators can reject assigned jobs.",
      });
    }

    const { id } = req.params;
    const { reason } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid booking ID.",
      });
    }

    const booking = await Booking.findOne({
      _id: id,
      operatorId: req.user._id,
      status: { $in: ["Assigned", "Accepted"] },
    });

    if (!booking) {
      return res.status(404).json({
        message: "Job not found or no longer eligible for rejection.",
      });
    }

    if (booking.status === "In Progress" || booking.status === "Completed") {
      return res.status(400).json({
        message: "Cannot reject a job that has already started or completed.",
      });
    }

    const previousDecision = booking.operatorDecision || "Pending";

    booking.status = "Assigned";
    booking.operatorDecision = "Rejected";
    booking.rejectionReason = (reason || "").trim();
    booking.assignmentHistory = booking.assignmentHistory || [];
    booking.assignmentHistory.push({
      operatorId: req.user._id,
      action: "Rejected",
      previousStatus: previousDecision,
      newStatus: "Rejected",
      reason: (reason || "").trim(),
      changedBy: req.user._id,
      timestamp: new Date(),
    });

    await booking.save();

    const updatedBooking = await Booking.findById(booking._id)
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone");

    return res.status(200).json({
      message: "Job rejected successfully.",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Reject assigned job error:", error);

    return res.status(500).json({
      message: "Failed to reject assigned job.",
    });
  }
};

// Get Accepted, In Progress and Completed jobs for operator
const getMyAcceptedJobs = async (req, res) => {
  try {
    if (req.user.role !== "operator") {
      return res.status(403).json({
        message: "Only operators can view these jobs.",
      });
    }

    const bookings = await Booking.find({
      operatorId: req.user._id,
      status: {
        $in: ["Accepted", "In Progress", "Completed"],
      },
    })
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone")
      .sort({ updatedAt: -1 });

    return res.status(200).json({
      message: "Accepted jobs fetched successfully.",
      bookings,
    });
  } catch (error) {
    console.error("Get accepted jobs error:", error);

    return res.status(500).json({
      message: "Failed to fetch accepted jobs.",
    });
  }
};

// Admin approves or rejects a booking
const decideBooking = async (req, res) => {
  try {
    const { decision, operatorId, machine, rejectionReason } = req.body;
    const { id } = req.params;

    const booking = await Booking.findById(id);

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found.",
      });
    }

    if (booking.status !== "Pending") {
      return res.status(400).json({
        message: "Only pending bookings can be approved or rejected.",
      });
    }

    if (decision === "approve") {
      if (!operatorId || !mongoose.Types.ObjectId.isValid(operatorId)) {
        return res.status(400).json({
          message: "Please select a valid operator.",
        });
      }

      const operator = await User.findById(operatorId);

      if (!operator || operator.role !== "operator") {
        return res.status(400).json({
          message: "Selected account is not a valid operator.",
        });
      }

      if (!machine || !machine.trim()) {
        return res.status(400).json({
          message: "Please select a machine.",
        });
      }

      booking.operatorId = operator._id;
      booking.machine = machine.trim();
      booking.status = "Assigned";
      booking.rejectionReason = "";
    } else if (decision === "reject") {
      if (!rejectionReason || !rejectionReason.trim()) {
        return res.status(400).json({
          message: "Please enter a rejection reason.",
        });
      }

      booking.status = "Rejected";
      booking.operatorId = null;
      booking.rejectionReason = rejectionReason.trim();
    } else {
      return res.status(400).json({
        message: "Invalid decision.",
      });
    }

    await booking.save();

    const updatedBooking = await Booking.findById(booking._id)
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone");

    return res.status(200).json({
      message:
        decision === "approve"
          ? "Booking approved and operator assigned successfully."
          : "Booking rejected successfully.",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Booking decision error:", error);

    return res.status(500).json({
      message: "Failed to update booking.",
    });
  }
};

// Get logged-in user's dashboard data
const getMyDashboard = async (req, res) => {
  try {
    const userId = req.user._id;

    const activeStatuses = ["Pending", "Assigned", "In Progress"];

    const [
      totalBookings,
      activeBookings,
      completedBookings,
      recentBookings,
    ] = await Promise.all([
      Booking.countDocuments({ userId }),

      Booking.countDocuments({
        userId,
        status: { $in: activeStatuses },
      }),

      Booking.countDocuments({
        userId,
        status: "Completed",
      }),

      Booking.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("machine work location date status createdAt"),
    ]);

    return res.status(200).json({
      message: "Dashboard data fetched successfully.",
      stats: {
        totalBookings,
        activeBookings,
        completedBookings,
        pendingPayment: 0,
      },
      recentBookings,
    });
  } catch (error) {
    console.error("Get user dashboard error:", error);

    return res.status(500).json({
      message: "Failed to fetch dashboard data.",
    });
  }
};
// Start an accepted job
const startAssignedJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "operator") {
      return res.status(403).json({
        success: false,
        message: "Only operators can start jobs",
      });
    }

    const job = await Booking.findOne({
      _id: id,
      operatorId: req.user._id,
      status: "Accepted",
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "Accepted job not found",
      });
    }

    job.status = "In Progress";
    await job.save();

    res.status(200).json({
      success: true,
      message: "Job started successfully",
      job,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// Complete an in-progress job
const endAssignedJob = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.role !== "operator") {
      return res.status(403).json({
        success: false,
        message: "Only operators can complete jobs",
      });
    }

    const job = await Booking.findOne({
      _id: id,
      operatorId: req.user._id,
      status: "In Progress",
    });

    if (!job) {
      return res.status(404).json({
        success: false,
        message: "In-progress job not found",
      });
    }

    job.status = "Completed";
    await job.save();

    res.status(200).json({
      success: true,
      message: "Job completed successfully",
      job,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


// Get completed jobs for Work History
const getMyWorkHistory = async (req, res) => {
  try {
    if (req.user.role !== "operator") {
      return res.status(403).json({
        success: false,
        message: "Only operators can view work history",
      });
    }

    const jobs = await Booking.find({
      operatorId: req.user._id,
      status: "Completed",
    })
      .populate("userId", "username email phone")
      .populate("operatorId", "username email")
      .sort({ updatedAt: -1 });

    res.status(200).json({
      success: true,
      jobs,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Admin reassigns a booking to another operator
const reassignBooking = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({
        message: "Only admins can reassign bookings.",
      });
    }

    const { id } = req.params;
    const { operatorId, machine } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(operatorId)) {
      return res.status(400).json({
        message: "Invalid booking or operator ID.",
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        message: "Booking not found.",
      });
    }

    if (["Completed", "Cancelled"].includes(booking.status)) {
      return res.status(400).json({
        message: "Cannot reassign a completed or cancelled booking.",
      });
    }

    const operator = await User.findById(operatorId);
    if (!operator || operator.role !== "operator") {
      return res.status(400).json({
        message: "Selected account is not a valid operator.",
      });
    }

    const previousOperatorId = booking.operatorId;

    booking.operatorId = operator._id;
    if (machine && machine.trim()) booking.machine = machine.trim();
    booking.status = "Assigned";
    booking.operatorDecision = "Pending";
    booking.rejectionReason = "";

    booking.assignmentHistory = booking.assignmentHistory || [];
    booking.assignmentHistory.push({
      operatorId: operator._id,
      action: "Reassigned",
      previousStatus: "Rejected",
      newStatus: "Assigned",
      reason: "Admin reassignment",
      changedBy: req.user._id,
      timestamp: new Date(),
    });

    await booking.save();

    const updatedBooking = await Booking.findById(booking._id)
      .populate("userId", "username email phone")
      .populate("operatorId", "username email phone");

    return res.status(200).json({
      message: "Booking reassigned successfully.",
      booking: updatedBooking,
    });
  } catch (error) {
    console.error("Reassign booking error:", error);
    return res.status(500).json({
      message: "Failed to reassign booking.",
    });
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  getMyAssignedJobs,
  acceptAssignedJob,
  rejectAssignedJob,
  getMyAcceptedJobs,
  decideBooking,
  reassignBooking,
  getMyDashboard,
  startAssignedJob,
  endAssignedJob,
  getMyWorkHistory,
};