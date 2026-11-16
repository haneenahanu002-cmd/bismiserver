const mongoose = require("mongoose");

const operatorPaymentSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true,
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

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    paymentDate: {
      type: Date,
      required: true,
    },

    method: {
      type: String,
      enum: ["Bank Transfer", "UPI", "Cash"],
      required: true,
    },

    transactionId: {
      type: String,
      default: "",
      trim: true,
    },

    status: {
      type: String,
      enum: ["Paid"],
      default: "Paid",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "OperatorPayment",
  operatorPaymentSchema
);