const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Group = require("../models/Group");

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

    socket.on("join_group", async (groupId) => {
      const group = await Group.findById(groupId);
      if (!group || !group.isActive || group.deletedAt) return;
      if (!group.members.some((m) => String(m) === String(socket.user._id))) return;
      socket.join(`group_${groupId}`);
    });

    socket.on("leave_group", (groupId) => {
      socket.leave(`group_${groupId}`);
    });

    socket.on("group_message", async (payload) => {
      try {
        const { groupId, content, messageType, location } = payload || {};
        const group = await Group.findById(groupId);
        if (!group || !group.isActive || group.deletedAt) return;
        if (!group.members.some((m) => String(m) === String(socket.user._id))) return;

        const message = await Message.create({
          group: groupId,
          sender: socket.user._id,
          content: content || "",
          messageType: messageType || "text",
          location,
        });

        const populated = await Message.findById(message._id).populate("sender", "username role");

        io.to(`group_${groupId}`).emit("new_group_message", populated);
      } catch (error) {
        socket.emit("message_error", { message: "Unable to send group message." });
      }
    });

    socket.on("location_update", async (payload) => {
      try {
        const { conversationId, messageId, latitude, longitude } = payload || {};
        if (!conversationId || !messageId) return;

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;
        if (!conversation.participants.some((p) => String(p) === String(socket.user._id))) return;

        const message = await Message.findById(messageId);
        if (!message || !message.location?.isLive) return;
        if (new Date() > new Date(message.location.expiresAt)) return;

        message.location.latitude = Number(latitude);
        message.location.longitude = Number(longitude);
        message.location.url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        await message.save();

        io.to(`conversation_${conversationId}`).emit("location_updated", {
          messageId,
          latitude: Number(latitude),
          longitude: Number(longitude),
          url: message.location.url,
        });
      } catch (error) {
        socket.emit("message_error", { message: "Unable to update location." });
      }
    });

    socket.on("group_location_update", async (payload) => {
      try {
        const { groupId, messageId, latitude, longitude } = payload || {};
        const group = await Group.findById(groupId);
        if (!group || !group.isActive || group.deletedAt) return;
        if (!group.members.some((m) => String(m) === String(socket.user._id))) return;

        const message = await Message.findById(messageId);
        if (!message || !message.location?.isLive) return;
        if (new Date() > new Date(message.location.expiresAt)) return;

        message.location.latitude = Number(latitude);
        message.location.longitude = Number(longitude);
        message.location.url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        await message.save();

        io.to(`group_${groupId}`).emit("group_location_updated", {
          messageId,
          latitude: Number(latitude),
          longitude: Number(longitude),
          url: message.location.url,
        });
      } catch (error) {
        socket.emit("message_error", { message: "Unable to update location." });
      }
    });

    socket.on("disconnect", () => {});
  });
}

module.exports = { initMessageSocket };