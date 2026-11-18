const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: false,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: false,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      default: "",
      trim: true,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "document", "location"],
      default: "text",
    },
    attachments: [
      {
        url: String,
        name: String,
        mimetype: String,
        size: Number,
      },
    ],
    location: {
      latitude: Number,
      longitude: Number,
      url: String,
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Message", messageSchema);