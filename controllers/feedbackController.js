
const Feedback = require("../models/feedbackModel");
const Booking = require( "../models/Booking");

// Submit Feedback
exports.addFeedback = async (req, res) => {
  try {
    const { bookingId, rating, message } = req.body;

    if (!bookingId || !rating || !message?.trim()) {
      return res.status(400).json({
        message: "Please provide booking, rating and feedback.",
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5.",
      });
    }

    // Check booking belongs to logged-in user
    const booking = await Booking.findOne({
      _id: bookingId,
      userId: req.user._id,
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found.",
      });
    }

    // Only completed bookings can receive feedback
    if (booking.status !== "Completed") {
      return res.status(400).json({
        message: "Feedback can only be submitted for completed bookings.",
      });
    }

    // Prevent duplicate feedback
    const existingFeedback = await Feedback.findOne({
      bookingId,
    });

    if (existingFeedback) {
      return res.status(400).json({
        message: "Feedback already submitted for this booking.",
      });
    }

    const feedback = await Feedback.create({
      userId: req.user._id,
      bookingId,
      rating,
      message: message.trim(),
    });

    return res.status(201).json({
      message: "Feedback submitted successfully!",
      feedback,
    });
  } catch (error) {
    console.error("Add Feedback Error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Feedback already submitted for this booking.",
      });
    }

    return res.status(500).json({
      message: "Failed to submit feedback.",
    });
  }
};


// Get completed bookings for feedback
exports.getCompletedBookings = async (req, res) => {  try {
    const bookings = await Booking.find({
      userId: req.user._id,
      status: "Completed",
    }).sort({ createdAt: -1 });

    const feedbacks = await Feedback.find({
      userId: req.user._id,
    }).select("bookingId");

    const submittedIds = feedbacks.map((item) =>
      item.bookingId.toString()
    );

    const availableBookings = bookings.filter(
      (item) => !submittedIds.includes(item._id.toString())
    );

    return res.status(200).json({
      message: "Completed bookings fetched successfully.",
      bookings: availableBookings,
    });
  } catch (error) {
    console.error("Completed Bookings Error:", error);

    return res.status(500).json({
      message: "Failed to fetch bookings.",
    });
  }
};


// Get logged-in user's feedback history
exports.getMyFeedback = async (req, res) => {
  try {
    const feedbacks = await Feedback.find({
      userId: req.user._id,
    })
      .populate("bookingId", "machine work date")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Feedback history fetched successfully.",
      feedbacks,
    });
  } catch (error) {
    console.error("My Feedback Error:", error);

    return res.status(500).json({
      message: "Failed to fetch feedback history.",
    });
  }
};


// Admin: Get all feedback

// Admin: Get all feedback
exports.getAllFeedback = async (req, res) => {
  try {
    const feedbacks = await Feedback.find()
      .populate("userId", "username email phone")
      .populate({
        path: "bookingId",
        select: "machine work date operatorId",
        populate: {
          path: "operatorId",
          select: "username email",
        },
      })
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "All feedback fetched successfully.",
      totalFeedback: feedbacks.length,
      feedbacks,
    });
  } catch (error) {
    console.error("All Feedback Error:", error);

    return res.status(500).json({
      message: "Failed to fetch all feedback.",
    });
  }
};
exports.updateFeedbackStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["New", "Reviewed"].includes(status)) {
      return res.status(400).json({
        message: "Invalid feedback status.",
      });
    }

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true }
    );

    if (!feedback) {
      return res.status(404).json({
        message: "Feedback not found.",
      });
    }

    return res.status(200).json({
      message: "Feedback status updated successfully.",
      feedback,
    });
  } catch (error) {
    console.error("Update Feedback Status Error:", error);

    return res.status(500).json({
      message: "Failed to update feedback status.",
    });
  }
};