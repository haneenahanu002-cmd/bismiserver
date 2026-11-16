const express = require("express");
const router = express.Router();

const {
  createBill,
  getMyBills,
  getCompletedJobsForBill,
  getBillByBooking,
  updateBill,
  getAllBillsForAdmin,
  updateAdminBill,
  approveBill,
  rejectBill,
  
getMyApprovedBills,
} = require("../controllers/billController");

const {
  getAdminCompletedJobs,
} = require("../controllers/operatorPaymentController");

const authMiddleware = require("../middleware/authmiddleware");

// Operator routes
router.get("/completed-jobs", authMiddleware, getCompletedJobsForBill);
router.post("/", authMiddleware, createBill);
router.get("/my-bills", authMiddleware, getMyBills);
router.get("/booking/:bookingId", authMiddleware, getBillByBooking);
router.put("/:id", authMiddleware, updateBill);
// Customer route
router.get("/user/my-bills", authMiddleware, getMyApprovedBills);

// Admin bill routes
router.get("/admin/all", authMiddleware, getAllBillsForAdmin);
router.put("/admin/:id", authMiddleware, updateAdminBill);
router.patch("/admin/:id/approve", authMiddleware, approveBill);
router.patch("/admin/:id/reject", authMiddleware, rejectBill);

// Admin completed jobs
router.get(
  "/admin/completed-jobs",
  authMiddleware,
  getAdminCompletedJobs
);

module.exports = router;