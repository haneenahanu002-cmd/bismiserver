const mongoose = require("mongoose");

const machineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    model: {
      type: String,
      required: true,
      trim: true,
    },

    registration: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ["Available", "In Use", "Maintenance"],
      default: "Available",
    },

    image: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Normalize registration before saving
machineSchema.pre("save", function () {
  if (this.registration) {
    this.registration = this.registration.trim().toUpperCase();
  }
});

module.exports = mongoose.model("Machine", machineSchema);