
const express = require("express");
const router = express.Router();

const {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  changePassword,
} = require("../controllers/authController");

const authMiddleware = require("../middleware/authmiddleware");

// Register
router.post("/register", registerUser);

// Login
router.post("/login", loginUser);

// Get logged-in user profile
router.get("/profile", authMiddleware, getProfile);

// Update profile
router.put("/profile", authMiddleware, updateProfile);

// Change password
router.put("/change-password", authMiddleware, changePassword);

module.exports = router;
