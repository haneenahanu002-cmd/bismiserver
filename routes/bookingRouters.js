const express = require("express");
const router = express.Router();

const {
  createBooking,
  getMyBookings,
  getMyAssignedJobs,
  acceptAssignedJob,
  rejectAssignedJob,
  reassignBooking,
  getMyAcceptedJobs,
  getMyDashboard,
  startAssignedJob,
  endAssignedJob,
  getMyWorkHistory,
} = require("../controllers/bookingController");

const authMiddleware = require("../middleware/authmiddleware");

// Customer routes
router.post("/", authMiddleware, createBooking);
router.get("/my-bookings", authMiddleware, getMyBookings);
router.get("/my-dashboard", authMiddleware, getMyDashboard);

// Operator routes
router.get(
  "/operator/assigned-jobs",
  authMiddleware,
  getMyAssignedJobs
);

router.patch(
  "/operator/assigned-jobs/:id/accept",
  authMiddleware,
  acceptAssignedJob
);

router.patch(
  "/operator/assigned-jobs/:id/reject",
  authMiddleware,
  rejectAssignedJob
);

router.get(
  "/operator/accepted-jobs",
  authMiddleware,
  getMyAcceptedJobs
);
// Start and complete job
router.patch("/operator/:id/start", authMiddleware, startAssignedJob);
router.patch("/operator/:id/complete", authMiddleware, endAssignedJob);

// Work history
router.get("/operator/work-history", authMiddleware, getMyWorkHistory);
module.exports = router;