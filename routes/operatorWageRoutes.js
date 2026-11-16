const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authmiddleware");

const {
  getCompletedJobs,
  createOperatorWageBill,
  getAllOperatorWageBills,
  payOperatorWageBill,
    getMyOperatorWageBills,
} = require("../controllers/operatorWageController");

router.get(
  "/admin/completed-jobs",
  authMiddleware,
  getCompletedJobs
);

router.get(
  "/admin/all",
  authMiddleware,
  getAllOperatorWageBills
);

router.post(
  "/admin/create",
  authMiddleware,
  createOperatorWageBill
);

router.patch(
  "/admin/:id/pay",
  authMiddleware,
  payOperatorWageBill
);
// OPERATOR - MY WAGE BILLS
router.get(
  "/operator/my-wages",
  authMiddleware,
  getMyOperatorWageBills
);

module.exports = router;