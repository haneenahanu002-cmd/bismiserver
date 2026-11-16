
const User = require("../models/User");
const Booking = require("../models/Booking");
const Payment = require("../models/Payment");

// GET ADMIN DASHBOARD DATA
const getAdminDashboard = async (req, res) => {
  try {
    // 1. COUNT USERS
    const totalUsers = await User.countDocuments({
      role: "user",
    });

    // 2. COUNT OPERATORS
    const totalOperators = await User.countDocuments({
      role: "operator",
    });

    // 3. COUNT MACHINES
    // Default MongoDB collection name for Machine model: machines
    const totalMachines =
      await Booking.db.collection("machines").countDocuments()
        .catch(() => 0);

    // 4. COUNT BOOKINGS
    const totalBookings = await Booking.countDocuments();

    // 5. RECENT BOOKINGS
    const recentBookings = await Booking.find()
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // 6. PAYMENT SUMMARY
    const paymentSummary = await Payment.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    const payments = {
      pending: 0,
      paid: 0,
      failed: 0,
      pendingAmount: 0,
      paidAmount: 0,
    };

    paymentSummary.forEach((item) => {
      const status = String(item._id || "").toUpperCase();

      if (status === "PENDING") {
        payments.pending = item.count;
        payments.pendingAmount = item.totalAmount || 0;
      }

      if (status === "PAID") {
        payments.paid = item.count;
        payments.paidAmount = item.totalAmount || 0;
      }

      if (status === "FAILED") {
        payments.failed = item.count;
      }
    });

    // 7. BOOKING STATUS SUMMARY
    const bookingSummary = await Booking.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const bookingStatuses = {};

    bookingSummary.forEach((item) => {
      bookingStatuses[item._id] = item.count;
    });

    // 8. FORMAT RECENT BOOKINGS
    const formattedBookings = recentBookings.map((booking) => ({
      id: booking._id,
      bookingCode: `BM${booking._id.toString().slice(-6).toUpperCase()}`,
      customer: booking.userId?.username || "Unknown Customer",
      customerEmail: booking.userId?.email || "",
      service: booking.work || "-",
      machine: booking.machine || "-",
      date: booking.date || "-",
      status: booking.status || "Pending",
      createdAt: booking.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Dashboard data fetched successfully.",
      stats: {
        totalUsers,
        totalOperators,
        totalMachines,
        totalBookings,
      },
      payments,
      bookingStatuses,
      recentBookings: formattedBookings,
    });
  } catch (error) {
    console.error("Admin Dashboard Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard data.",
      error: error.message,
    });
  }
};

module.exports = {
  getAdminDashboard,
};

