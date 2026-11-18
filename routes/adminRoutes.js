
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const adminMiddleware = require("../middleware/adminMiddleware");
const Booking = require("../models/Booking");
const { getAllUsers } = require("../controllers/adminController");
const { reassignBooking } = require("../controllers/bookingController");
const authMiddleware = require("../middleware/authmiddleware");
// Admin dashboard
router.get("/dashboard", adminMiddleware, (req, res) => {
  res.status(200).json({
    message: "Admin dashboard access successful!",
    admin: {
      id: req.user._id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
    },
  });
});
// Existing admin routes-ന്റെ കൂടെ add ചെയ്യുക
router.get("/users", authMiddleware, getAllUsers);

// Get all operators
router.get("/operators", adminMiddleware, async (req, res) => {
  try {
    const operators = await User.find({ role: "operator" })
      .select("-password")
      .sort({ createdAt: -1 });

    res.status(200).json(operators);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Create operator
router.post("/operators", adminMiddleware, async (req, res) => {
  try {
    const { username, email, phone, location, password } = req.body;

    if (!username || !email || !phone || !password) {
      return res.status(400).json({
        message: "Username, email, phone and password are required.",
      });
    }

    if (password.length < 12) {
      return res.status(400).json({
        message: "Password must be at least 12 characters long.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const operator = await User.create({
      username: username.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      location: location || "",
      password: hashedPassword,
      role: "operator",
    });

    res.status(201).json({
      message: "Operator created successfully.",
      operator: {
        id: operator._id,
        username: operator.username,
        email: operator.email,
        phone: operator.phone,
        location: operator.location,
        role: operator.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update operator
router.put("/operators/:id", adminMiddleware, async (req, res) => {
  try {
    const { username, email, phone, location, password } = req.body;

    const operator = await User.findOne({
      _id: req.params.id,
      role: "operator",
    });

    if (!operator) {
      return res.status(404).json({
        message: "Operator not found.",
      });
    }

    if (email) {
      const normalizedEmail = email.trim().toLowerCase();

      const duplicate = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: operator._id },
      });

      if (duplicate) {
        return res.status(409).json({
          message: "Email already registered.",
        });
      }

      operator.email = normalizedEmail;
    }

    if (username !== undefined) operator.username = username.trim();
    if (phone !== undefined) operator.phone = phone.trim();
    if (location !== undefined) operator.location = location;

    // Update password only when a new password is provided
    if (password && password.trim()) {
      if (password.length < 12) {
        return res.status(400).json({
          message: "Password must be at least 12 characters long.",
        });
      }

      operator.password = await bcrypt.hash(password, 10);
    }

    await operator.save();

    res.status(200).json({
      message: "Operator updated successfully.",
      operator: {
        id: operator._id,
        username: operator.username,
        email: operator.email,
        phone: operator.phone,
        location: operator.location,
        role: operator.role,
      },
    });
  } catch (error) {
    console.error("Update operator error:", error);

    res.status(500).json({
      message: "Failed to update operator.",
    });
  }
});
// Delete operator
router.delete("/operators/:id", adminMiddleware, async (req, res) => {
  try {
    const operator = await User.findOneAndDelete({
      _id: req.params.id,
      role: "operator",
    });

    if (!operator) {
      return res.status(404).json({
        message: "Operator not found.",
      });
    }

    res.status(200).json({
      message: "Operator deleted successfully.",
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
// Get all bookings for Admin
router.get("/bookings", adminMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find()
      .populate("userId", "username email phone location")
      .populate("operatorId", "username phone")
      .sort({ createdAt: -1 });

    res.status(200).json(bookings);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch bookings.",
      error: error.message,
    });
  }
});

// Reassign booking to another operator
router.patch("/bookings/:id/reassign", adminMiddleware, reassignBooking);

// Approve or Reject booking and assign operator
router.patch(
  "/bookings/:id/decision",
  adminMiddleware,
  async (req, res) => {
    try {
      const { decision, operatorId, machine, rejectionReason } = req.body;

      const booking = await Booking.findById(req.params.id);

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

      // Reject booking
      if (decision === "reject") {
        if (!rejectionReason || !rejectionReason.trim()) {
          return res.status(400).json({
            message: "Please provide a rejection reason.",
          });
        }

        booking.status = "Rejected";
        booking.operatorId = null;
        booking.rejectionReason = rejectionReason.trim();

        await booking.save();

        return res.status(200).json({
          message: "Booking rejected successfully.",
          booking,
        });
      }

      // Approve booking
      if (decision === "approve") {
        if (!operatorId) {
          return res.status(400).json({
            message: "Please select an operator.",
          });
        }

        const operator = await User.findOne({
          _id: operatorId,
          role: "operator",
        });

        if (!operator) {
          return res.status(404).json({
            message: "Selected operator not found.",
          });
        }

        if (machine && machine.trim()) {
          booking.machine = machine.trim();
        }

        booking.operatorId = operator._id;
        booking.status = "Assigned";
        booking.rejectionReason = "";

        await booking.save();

        const updatedBooking = await Booking.findById(booking._id)
          .populate("userId", "username email phone location")
          .populate("operatorId", "username email phone location");

        return res.status(200).json({
          message: "Booking approved and operator assigned successfully.",
          booking: updatedBooking,
        });
      }

      return res.status(400).json({
        message: "Invalid decision. Use approve or reject.",
      });
    } catch (error) {
      res.status(500).json({
        message: "Failed to update booking.",
        error: error.message,
      });
    }
  }
);


module.exports = router;
