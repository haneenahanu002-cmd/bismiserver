
const Booking = require("../models/Booking");
const Bill = require("../models/Bill");
const Payment = require("../models/Payment");
const User = require("../models/User");

const getDateFilter = (from, to) => {
  const filter = {};

  if (from || to) {
    filter.createdAt = {};

    if (from) {
      const start = new Date(`${from}T00:00:00.000`);
      if (!Number.isNaN(start.getTime())) {
        filter.createdAt.$gte = start;
      }
    }

    if (to) {
      const end = new Date(`${to}T23:59:59.999`);
      if (!Number.isNaN(end.getTime())) {
        filter.createdAt.$lte = end;
      }
    }

    if (Object.keys(filter.createdAt).length === 0) {
      delete filter.createdAt;
    }
  }

  return filter;
};

// Keep only one payment record per bill.
// PAID takes priority over PENDING, and PENDING over FAILED.
const getLatestPaymentPerBill = (payments) => {
  const paymentMap = new Map();

  const priority = {
    PAID: 3,
    PENDING: 2,
    FAILED: 1,
  };

  for (const payment of payments) {
    const billId = String(payment.billId);
    const existing = paymentMap.get(billId);

    if (
      !existing ||
      priority[payment.status] > priority[existing.status] ||
      (
        priority[payment.status] === priority[existing.status] &&
        new Date(payment.createdAt) > new Date(existing.createdAt)
      )
    ) {
      paymentMap.set(billId, payment);
    }
  }

  return Array.from(paymentMap.values());
};

const getReports = async (req, res) => {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    const { from, to } = req.query;
    const dateFilter = getDateFilter(from, to);

    // 1. Bookings in selected date range
    const bookings = await Booking.find(dateFilter)
      .populate("userId", "username email")
      .populate("operatorId", "username email")
      .sort({ createdAt: -1 })
      .lean();

    // 2. Payment records in selected date range
    const paymentRecords = await Payment.find(dateFilter)
      .sort({ createdAt: -1 })
      .lean();

    // One payment record per bill for report calculations
    const uniquePayments = getLatestPaymentPerBill(paymentRecords);

    const paidPayments = uniquePayments.filter(
      (payment) => payment.status === "PAID"
    );

    const pendingPayments = uniquePayments.filter(
      (payment) => payment.status === "PENDING"
    );

    const failedPayments = uniquePayments.filter(
      (payment) => payment.status === "FAILED"
    );

    // 3. Approved bills in selected date range
    const approvedBills = await Bill.find({
      ...dateFilter,
      approvalStatus: "Approved",
    }).lean();

    const paidBillIds = new Set(
      paidPayments.map((payment) => String(payment.billId))
    );

    // Pending amount = approved bills not yet paid
    const unpaidBills = approvedBills.filter(
      (bill) => !paidBillIds.has(String(bill._id))
    );

    const pendingBillAmount = unpaidBills.reduce((total, bill) => {
      const finalAmount =
        bill.adminFinalAmount !== null &&
        bill.adminFinalAmount !== undefined
          ? bill.adminFinalAmount
          : bill.totalAmount;

      return total + Number(finalAmount || 0);
    }, 0);

    // 4. Revenue calculations
    const totalRevenue = paidPayments.reduce(
      (total, payment) => total + Number(payment.amount || 0),
      0
    );

    const upiRevenue = paidPayments
      .filter((payment) => payment.paymentMethod === "UPI")
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

    const cashRevenue = paidPayments
      .filter((payment) => payment.paymentMethod === "CASH")
      .reduce((total, payment) => total + Number(payment.amount || 0), 0);

    // 5. Booking status report
    const statusNames = [
      "Pending",
      "Assigned",
      "Accepted",
      "In Progress",
      "Completed",
      "Rejected",
      "Cancelled",
    ];

    const bookingStatus = statusNames.map((status) => ({
      status,
      count: bookings.filter((booking) => booking.status === status).length,
    }));

    const completedBookings = bookings.filter(
      (booking) => booking.status === "Completed"
    ).length;

    // 6. Machine-wise report
    const machineMap = {};

    bookings.forEach((booking) => {
      const machine = booking.machine || "Unknown";

      if (!machineMap[machine]) {
        machineMap[machine] = 0;
      }

      machineMap[machine] += 1;
    });

    const machineReport = Object.entries(machineMap)
      .map(([machine, count]) => ({ machine, count }))
      .sort((a, b) => b.count - a.count);

    // 7. Work-wise report
    const workMap = {};

    bookings.forEach((booking) => {
      const work = booking.work || "Unknown";

      if (!workMap[work]) {
        workMap[work] = 0;
      }

      workMap[work] += 1;
    });

    const workReport = Object.entries(workMap)
      .map(([work, count]) => ({ work, count }))
      .sort((a, b) => b.count - a.count);

    // 8. Customer-wise report
    const customerMap = {};

    bookings.forEach((booking) => {
      const customer = booking.userId;

      if (!customer) return;

      const customerId = String(customer._id);

      if (!customerMap[customerId]) {
        customerMap[customerId] = {
          userId: customerId,
          username: customer.username || "Customer",
          email: customer.email || "",
          bookings: 0,
        };
      }

      customerMap[customerId].bookings += 1;
    });

    const customerReport = Object.values(customerMap).sort(
      (a, b) => b.bookings - a.bookings
    );

    // 9. Operator-wise report
    const operatorMap = {};

    bookings.forEach((booking) => {
      const operator = booking.operatorId;

      if (!operator) return;

      const operatorId = String(operator._id);

      if (!operatorMap[operatorId]) {
        operatorMap[operatorId] = {
          operatorId,
          username: operator.username || "Operator",
          email: operator.email || "",
          assignedJobs: 0,
          completedJobs: 0,
        };
      }

      operatorMap[operatorId].assignedJobs += 1;

      if (booking.status === "Completed") {
        operatorMap[operatorId].completedJobs += 1;
      }
    });

    const operatorReport = Object.values(operatorMap).sort(
      (a, b) => b.assignedJobs - a.assignedJobs
    );

    // 10. Revenue trend grouped by payment date
    const revenueMap = {};

    paidPayments.forEach((payment) => {
      const date = new Date(payment.createdAt).toISOString().slice(0, 10);

      if (!revenueMap[date]) {
        revenueMap[date] = 0;
      }

      revenueMap[date] += Number(payment.amount || 0);
    });

    const revenueTrend = Object.entries(revenueMap)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 11. Customer count in selected booking range
    const totalCustomers = new Set(
      bookings
        .filter((booking) => booking.userId)
        .map((booking) => String(booking.userId._id))
    ).size;

    return res.status(200).json({
      success: true,
      message: "Reports fetched successfully.",

      filters: {
        from: from || null,
        to: to || null,
      },

      summary: {
        totalBookings: bookings.length,
        completedBookings,
        totalCustomers,
        totalOperators: operatorReport.length,

        totalRevenue,
        upiRevenue,
        cashRevenue,

        pendingPaymentAmount: pendingBillAmount,
        pendingPaymentCount: pendingPayments.length,
        failedPaymentCount: failedPayments.length,
        paidPaymentCount: paidPayments.length,
      },

      bookingStatus,
      machineReport,
      workReport,
      customerReport,
      operatorReport,
      revenueTrend,
    });
  } catch (error) {
    console.error("Reports Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate reports.",
      error: error.message,
    });
  }
};

module.exports = { getReports };
