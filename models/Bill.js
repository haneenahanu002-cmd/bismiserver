
const mongoose = require("mongoose");

const billSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    startingReading: {
      type: Number,
      required: true,
      min: 0,
    },

    closingReading: {
      type: Number,
      required: true,
      min: 0,
    },

    totalHours: {
      type: Number,
      required: true,
      min: 0,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    shiftingCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    tipper: {
      type: Number,
      default: 0,
      min: 0,
    },

    batta: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Amount submitted by operator
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Amount finalized by admin
    adminFinalAmount: {
      type: Number,
      default: null,
      min: 0,
    },

    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },

    adminNote: {
      type: String,
      default: "",
      trim: true,
    },

    rejectionReason: {
      type: String,
      default: "",
      trim: true,
    },

    approvedAt: {
      type: Date,
      default: null,
    },

    siteName: {
      type: String,
      default: "",
      trim: true,
    },

    billDate: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bill", billSchema);
