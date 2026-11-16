
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authmiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const {
  getAdminSettings,
  updateAdminProfile,
  updateBusinessSettings,
  updateNotifications,
  changeAdminPassword,
} = require("../controllers/settingsController");

router.get("/admin", authMiddleware, adminMiddleware, getAdminSettings);

router.patch(
  "/admin/profile",
  authMiddleware,
  adminMiddleware,
  updateAdminProfile
);

router.patch(
  "/admin/business",
  authMiddleware,
  adminMiddleware,
  updateBusinessSettings
);

router.patch(
  "/admin/notifications",
  authMiddleware,
  adminMiddleware,
  updateNotifications
);

router.patch(
  "/admin/change-password",
  authMiddleware,
  adminMiddleware,
  changeAdminPassword
);

module.exports = router;

