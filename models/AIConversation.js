const mongoose = require("mongoose");

const aiMessageSchema = new mongoose.Schema(
  {
    senderType: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const aiConversationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    messages: [aiMessageSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("AIConversation", aiConversationSchema);