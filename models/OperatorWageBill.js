const mongoose = require("mongoose");

const operatorWageBillSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
    },

    customerBillId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      required: true,
    },

    operatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    workingHours: {
      type: Number,
      required: true,
      min: 0,
    },

    ratePerHour: {
      type: Number,
      required: true,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid"],
      default: "Pending",
    },

    paymentDate: {
      type: Date,
      default: null,
    },

    paymentMethod: {
      type: String,
      enum: ["Bank Transfer", "UPI", "Cash"],
      default: null,
    },

    transactionId: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "OperatorWageBill",
  operatorWageBillSchema
);