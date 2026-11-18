const User = require("../models/User");
const Booking = require("../models/Booking");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { canChat, isParticipant } = require("../utils/chatPermissions");

const getConversations = async (req, res) => {
  try {
    const userId = req.user._id;

    // Ensure a permanent conversation with an Admin exists for customers/operators.
    if (req.user.role !== "admin") {
      const adminUser = await User.findOne({ role: "admin" });

      if (adminUser) {
        let adminConversation = await Conversation.findOne({
          participants: { $all: [userId, adminUser._id], $size: 2 },
        });

        if (!adminConversation) {
          adminConversation = await Conversation.create({
            participants: [userId, adminUser._id],
            unreadCounts: {
              [String(userId)]: 0,
              [String(adminUser._id)]: 0,
            },
          });
        }
      }
    }

    const conversations = await Conversation.find({
      participants: userId,
    })
      .populate("participants", "username role email")
      .sort({ lastMessageAt: -1, updatedAt: -1 });

    const result = conversations.map((conv) => {
      const other = conv.participants.find(
        (p) => String(p._id) !== String(userId)
      );

      return {
        _id: conv._id,
        participant: other,
        lastMessage: conv.lastMessage,
        lastMessageAt: conv.lastMessageAt,
        unreadCount: conv.unreadCounts?.get(String(userId)) || 0,
        updatedAt: conv.updatedAt,
      };
    });

    if (req.user.role !== "admin") {
      result.sort((a, b) => {
        const aAdmin = a.participant?.role === "admin" ? 0 : 1;
        const bAdmin = b.participant?.role === "admin" ? 0 : 1;
        if (aAdmin !== bAdmin) return aAdmin - bAdmin;
        return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
      });
    }

    return res.status(200).json({ success: true, conversations: result });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch conversations.",
    });
  }
};

const createConversation = async (req, res) => {
  try {
    const currentUser = req.user;
    const { participantId } = req.body;

    if (!participantId) {
      return res.status(400).json({
        success: false,
        message: "Participant ID is required.",
      });
    }

    const otherUser = await User.findById(participantId);
    if (!otherUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const allowed = await canChat(currentUser, otherUser);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to chat with this user.",
      });
    }

    let conversation = await Conversation.findOne({
      participants: { $all: [currentUser._id, otherUser._id], $size: 2 },
    });

    if (!conversation) {
      conversation = await Conversation.create({
        participants: [currentUser._id, otherUser._id],
        unreadCounts: {
          [String(currentUser._id)]: 0,
          [String(otherUser._id)]: 0,
        },
      });
    }

    return res.status(200).json({
      success: true,
      conversation: {
        _id: conversation._id,
        participant: {
          _id: otherUser._id,
          username: otherUser.username,
          role: otherUser.role,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to create conversation.",
    });
  }
};

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isParticipant(conversation, userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const skip = (page - 1) * limit;

    const messages = await Message.find({ conversation: conversationId })
      .populate("sender", "username role")
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      messages,
      page,
      hasMore: messages.length === limit,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch messages.",
    });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;
    const { content } = req.body;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isParticipant(conversation, userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message content is required.",
      });
    }

    const message = await Message.create({
      conversation: conversationId,
      sender: userId,
      content: content.trim(),
    });

    const populated = await Message.findById(message._id).populate(
      "sender",
      "username role"
    );

    conversation.lastMessage = content.trim().slice(0, 120);
    conversation.lastMessageAt = new Date();

    const otherId = conversation.participants.find(
      (p) => String(p) !== String(userId)
    );

    const currentUnread = conversation.unreadCounts?.get(String(otherId)) || 0;
    conversation.unreadCounts.set(String(otherId), currentUnread + 1);
    conversation.unreadCounts.set(String(userId), 0);

    await conversation.save();

    return res.status(201).json({ success: true, message: populated });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to send message.",
    });
  }
};

const markRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userId = req.user._id;

    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !isParticipant(conversation, userId)) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    await Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    conversation.unreadCounts.set(String(userId), 0);
    await conversation.save();

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to mark as read.",
    });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const conversations = await Conversation.find({ participants: userId });
    const total = conversations.reduce((sum, conv) => {
      return sum + (conv.unreadCounts?.get(String(userId)) || 0);
    }, 0);

    return res.status(200).json({ success: true, unreadCount: total });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch unread count.",
    });
  }
};

const getAvailableParticipants = async (req, res) => {
  try {
    const currentUser = req.user;
    let users = [];

    if (currentUser.role === "admin") {
      users = await User.find({
        _id: { $ne: currentUser._id },
      }).select("username role email");
    } else if (currentUser.role === "operator") {
      const admins = await User.find({ role: "admin" }).select(
        "username role email"
      );

      const bookings = await Booking.find({
        operatorId: currentUser._id,
      }).select("userId");

      const customerIds = [
        ...new Set(bookings.map((b) => String(b.userId))),
      ];

      const customers = await User.find({
        _id: { $in: customerIds },
      }).select("username role email");

      users = [...admins, ...customers];
    } else {
      const admins = await User.find({ role: "admin" }).select(
        "username role email"
      );

      const bookings = await Booking.find({
        userId: currentUser._id,
        operatorId: { $ne: null },
      }).select("operatorId");

      const operatorIds = [
        ...new Set(bookings.map((b) => String(b.operatorId))),
      ];

      const operators = await User.find({
        _id: { $in: operatorIds },
      }).select("username role email");

      users = [...admins, ...operators];
    }

    // remove duplicates
    const unique = [];
    const seen = new Set();
    for (const u of users) {
      if (seen.has(String(u._id))) continue;
      seen.add(String(u._id));
      unique.push(u);
    }

    return res.status(200).json({ success: true, users: unique });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch participants.",
    });
  }
};

module.exports = {
  getConversations,
  createConversation,
  getMessages,
  sendMessage,
  markRead,
  getUnreadCount,
  getAvailableParticipants,
};