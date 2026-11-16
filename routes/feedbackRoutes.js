
const express = require("express");
const router = express.Router();

const {
  addFeedback,
  getCompletedBookings,
  getMyFeedback,
  getAllFeedback,
  updateFeedbackStatus,
} = require("../controllers/feedbackController");

const authMiddleware = require("../middleware/authmiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");


// User routes
router.get("/my-bookings", authMiddleware, getCompletedBookings);

router.post("/add", authMiddleware, addFeedback);

router.get("/my-feedback", authMiddleware, getMyFeedback);

// Admin route
router.get("/all", authMiddleware, adminMiddleware, getAllFeedback);
router.patch(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  updateFeedbackStatus
);
module.exports = router;
