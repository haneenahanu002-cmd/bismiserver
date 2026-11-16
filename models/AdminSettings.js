
const mongoose = require("mongoose");

const adminSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    businessName: {
      type: String,
      default: "Bismi Earth Movers",
      trim: true,
    },

    businessPhone: {
      type: String,
      default: "",
      trim: true,
    },

    businessAddress: {
      type: String,
      default: "Malappuram, Kerala, India",
      trim: true,
    },

    bio: {
      type: String,
      default: "Managing earth-moving equipment, bookings and operations.",
      trim: true,
    },

    photo: {
      type: String,
      default: "",
    },

    notifications: {
      notifications: { type: Boolean, default: true },
      emailAlerts: { type: Boolean, default: true },
      bookingAlerts: { type: Boolean, default: true },
      paymentAlerts: { type: Boolean, default: true },
      operatorAlerts: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminSettings", adminSettingsSchema);
