const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

function initMessageSocket(io) {
  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(" ")[1];

      if (!token) return next(new Error("Unauthorized"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (!user) return next(new Error("Unauthorized"));

      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user_${socket.user._id}`);

    socket.on("join_conversation", async (conversationId) => {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return;

      const isParticipant = conversation.participants.some(
        (p) => String(p) === String(socket.user._id)
      );

      if (!isParticipant) return;

      socket.join(`conversation_${conversationId}`);
    });

    socket.on("send_message", async (payload) => {
      try {
        const { conversationId, content } = payload || {};
        if (!conversationId || !content || !content.trim()) return;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const isParticipant = conversation.participants.some(
          (p) => String(p) === String(socket.user._id)
        );

        if (!isParticipant) return;

        const message = await Message.create({
          conversation: conversationId,
          sender: socket.user._id,
          content: content.trim(),
        });

        const populated = await Message.findById(message._id).populate(
          "sender",
          "username role"
        );

        conversation.lastMessage = content.trim().slice(0, 120);
        conversation.lastMessageAt = new Date();

        const otherId = conversation.participants.find(
          (p) => String(p) !== String(socket.user._id)
        );

        const currentUnread =
          conversation.unreadCounts?.get(String(otherId)) || 0;
        conversation.unreadCounts.set(String(otherId), currentUnread + 1);
        conversation.unreadCounts.set(String(socket.user._id), 0);

        await conversation.save();

        io.to(`conversation_${conversationId}`).emit("new_message", populated);
      } catch (error) {
        socket.emit("message_error", { message: "Unable to send message." });
      }
    });

    socket.on("typing", ({ conversationId }) => {
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit("user_typing", {
          conversationId,
          userId: socket.user._id,
        });
      }
    });

    socket.on("stop_typing", ({ conversationId }) => {
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit("user_stop_typing", {
          conversationId,
          userId: socket.user._id,
        });
      }
    });

    socket.on("disconnect", () => {});
  });
}

module.exports = { initMessageSocket };