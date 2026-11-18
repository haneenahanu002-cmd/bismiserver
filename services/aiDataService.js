const Booking = require("../models/Booking");
const Bill = require("../models/Bill");
const Payment = require("../models/Payment");
const User = require("../models/User");
const Machine = require("../models/Machine");

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function startOfDayIST(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

function startOfMonthIST(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  ist.setUTCDate(1);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

function startOfYearIST(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  ist.setUTCMonth(0, 1);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

function threeMonthsAgoIST(date = new Date()) {
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  ist.setUTCMonth(ist.getUTCMonth() - 3);
  ist.setUTCDate(1);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

function formatINR(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

async function getCustomerContext(user) {
  const now = new Date();
  const threeMonthsAgo = threeMonthsAgoIST(now);

  const bookings = await Booking.find({ userId: user._id }).sort({ createdAt: -1 });
  const bills = await Bill.find({ userId: user._id }).sort({ createdAt: -1 });
  const payments = await Payment.find({ userId: user._id }).sort({ createdAt: -1 });

  const statusCounts = {};
  for (const b of bookings) {
    statusCounts[b.status] = (statusCounts[b.status] || 0) + 1;
  }

  const paidTotal = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const pendingTotal = payments
    .filter((p) => p.status === "PENDING")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const recentBookings = bookings.filter((b) => new Date(b.createdAt) >= threeMonthsAgo);
  const recentSpend = payments
    .filter((p) => p.status === "PAID" && new Date(p.createdAt) >= threeMonthsAgo)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const latestBooking = bookings[0];
  const nextBooking = bookings.find((b) => ["Pending", "Assigned", "Accepted", "In Progress"].includes(b.status));

  const assignedOperators = [];
  for (const b of bookings.slice(0, 5)) {
    if (b.operatorId) {
      const op = await User.findById(b.operatorId).select("username");
      if (op) assignedOperators.push(`${b.machine || "Machine"}: ${op.username}`);
    }
  }

  const lines = [];
  lines.push(`Customer name: ${user.username}`);
  lines.push(`Total bookings: ${bookings.length}`);
  lines.push(`Booking status counts: ${JSON.stringify(statusCounts)}`);
  lines.push(`Latest booking: ${latestBooking ? `${latestBooking.machine} - ${latestBooking.work} - ${latestBooking.status}` : "None"}`);
  lines.push(`Next active booking: ${nextBooking ? `${nextBooking.machine} - ${nextBooking.work} - ${nextBooking.status}` : "None"}`);
  lines.push(`Assigned operators: ${assignedOperators.length ? assignedOperators.join("; ") : "None"}`);
  lines.push(`Total paid amount: ${formatINR(paidTotal)}`);
  lines.push(`Pending payment amount: ${formatINR(pendingTotal)}`);
  lines.push(`Bookings in last 3 months: ${recentBookings.length}`);
  lines.push(`Paid amount in last 3 months: ${formatINR(recentSpend)}`);
  lines.push(`Total bills: ${bills.length}`);
  lines.push(`Approved bills: ${bills.filter((b) => b.approvalStatus === "Approved").length}`);

  return lines.join("\n");
}

async function getOperatorContext(user) {
  const now = new Date();
  const todayStart = startOfDayIST(now);

  const jobs = await Booking.find({ operatorId: user._id }).sort({ createdAt: -1 });

  const statusCounts = {};
  for (const j of jobs) {
    statusCounts[j.status] = (statusCounts[j.status] || 0) + 1;
  }

  const todayJobs = jobs.filter((j) => new Date(j.createdAt) >= todayStart);
  const activeJobs = jobs.filter((j) => ["Assigned", "Accepted", "In Progress"].includes(j.status));

  const lines = [];
  lines.push(`Operator name: ${user.username}`);
  lines.push(`Total assigned jobs: ${jobs.length}`);
  lines.push(`Job status counts: ${JSON.stringify(statusCounts)}`);
  lines.push(`Active jobs: ${activeJobs.length}`);
  lines.push(`Today's jobs: ${todayJobs.length}`);
  lines.push(`Next job: ${activeJobs[0] ? `${activeJobs[0].machine} - ${activeJobs[0].work} - ${activeJobs[0].location}` : "None"}`);
  lines.push(`Recent jobs: ${jobs.slice(0, 5).map((j) => `${j.machine} (${j.status})`).join("; ") || "None"}`);

  return lines.join("\n");
}

async function getAdminContext(user) {
  const now = new Date();
  const todayStart = startOfDayIST(now);
  const monthStart = startOfMonthIST(now);
  const threeMonthsStart = threeMonthsAgoIST(now);
  const yearStart = startOfYearIST(now);

  const [
    totalCustomers,
    totalOperators,
    totalBookings,
    todayBookings,
    monthBookings,
    threeMonthBookings,
    statusCounts,
    machines,
    payments,
    bills,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    User.countDocuments({ role: "operator" }),
    Booking.countDocuments({}),
    Booking.countDocuments({ createdAt: { $gte: todayStart } }),
    Booking.countDocuments({ createdAt: { $gte: monthStart } }),
    Booking.countDocuments({ createdAt: { $gte: threeMonthsStart } }),
    Booking.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Machine.find({}).select("name"),
    Payment.find({}).sort({ createdAt: -1 }),
    Bill.find({}).select("approvalStatus"),
  ]);

  const bookingStatusMap = {};
  for (const s of statusCounts) bookingStatusMap[s._id] = s.count;

  const confirmedRevenueTotal = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const confirmedRevenueToday = payments
    .filter((p) => p.status === "PAID" && new Date(p.createdAt) >= todayStart)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const confirmedRevenueMonth = payments
    .filter((p) => p.status === "PAID" && new Date(p.createdAt) >= monthStart)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const confirmedRevenue3Months = payments
    .filter((p) => p.status === "PAID" && new Date(p.createdAt) >= threeMonthsStart)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const confirmedRevenueYear = payments
    .filter((p) => p.status === "PAID" && new Date(p.createdAt) >= yearStart)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);

  const pendingPayments = payments.filter((p) => p.status === "PENDING");
  const failedPayments = payments.filter((p) => p.status === "FAILED");

  const pendingAmount = pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Machine booking counts
  const machineCounts = await Booking.aggregate([
    { $group: { _id: "$machine", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  // Operator job counts
  const operatorCounts = await Booking.aggregate([
    { $match: { operatorId: { $ne: null } } },
    { $group: { _id: "$operatorId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);

  const operatorNames = [];
  for (const o of operatorCounts) {
    const u = await User.findById(o._id).select("username");
    operatorNames.push(`${u?.username || "Unknown"}: ${o.count}`);
  }

  const lines = [];
  lines.push(`Admin: ${user.username}`);
  lines.push(`Total customers: ${totalCustomers}`);
  lines.push(`Total operators: ${totalOperators}`);
  lines.push(`Total machines: ${machines.length}`);
  lines.push(`Total bookings: ${totalBookings}`);
  lines.push(`Today's bookings: ${todayBookings}`);
  lines.push(`This month's bookings: ${monthBookings}`);
  lines.push(`Last 3 months' bookings: ${threeMonthBookings}`);
  lines.push(`Booking status counts: ${JSON.stringify(bookingStatusMap)}`);
  lines.push(`Confirmed revenue (all time): ${formatINR(confirmedRevenueTotal)}`);
  lines.push(`Confirmed revenue today: ${formatINR(confirmedRevenueToday)}`);
  lines.push(`Confirmed revenue this month: ${formatINR(confirmedRevenueMonth)}`);
  lines.push(`Confirmed revenue last 3 months: ${formatINR(confirmedRevenue3Months)}`);
  lines.push(`Confirmed revenue this year: ${formatINR(confirmedRevenueYear)}`);
  lines.push(`Pending payments count: ${pendingPayments.length}`);
  lines.push(`Pending payments amount: ${formatINR(pendingAmount)}`);
  lines.push(`Failed payments count: ${failedPayments.length}`);
  lines.push(`Total bills: ${bills.length}`);
  lines.push(`Approved bills: ${bills.filter((b) => b.approvalStatus === "Approved").length}`);
  lines.push(`Top machines by bookings: ${machineCounts.map((m) => `${m._id}: ${m.count}`).join("; ") || "None"}`);
  lines.push(`Top operators by jobs: ${operatorNames.join("; ") || "None"}`);

  return lines.join("\n");
}

async function getRoleContext(user) {
  if (user.role === "admin") return getAdminContext(user);
  if (user.role === "operator") return getOperatorContext(user);
  return getCustomerContext(user);
}

module.exports = { getRoleContext };