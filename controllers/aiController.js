const Booking = require("../models/Booking");
const Bill = require("../models/Bill");
const Payment = require("../models/Payment");
const AIConversation = require("../models/AIConversation");
const { generateReply } = require("../services/aiService");

const SYSTEM_PROMPT = `You are Bismi AI, the official AI assistant for Bismi Earth Movers.

Your purpose is to help customers, operators, and administrators understand and use the Bismi Earth Movers application.

You can explain services, machines, booking procedures, work updates, bills, payments, and application features.

You must:
- Reply in the user's preferred language.
- Support Malayalam, Manglish, and English.
- Keep answers simple and friendly.
- Never invent booking information, payment status, or machine availability.
- Use verified backend information when answering personal account questions.
- Never disclose another user's private data.
- Never request passwords, OTPs, or secret credentials.
- Never claim to have completed an action that you cannot perform.
- Direct users to the appropriate application page when an action requires manual completion.

You are an informational assistant, not an administrator.`;

const buildContext = async (user) => {
  const lines = [`User role: ${user.role}`];

  if (user.role === "user") {
    const bookings = await Booking.find({ userId: user._id })
      .select("machine work status operatorId date")
      .limit(10);
    const bills = await Bill.find({ userId: user._id })
      .select("totalAmount adminFinalAmount approvalStatus")
      .limit(10);
    const payments = await Payment.find({ userId: user._id })
      .select("amount status paymentMethod")
      .limit(10);

    lines.push(`Customer booking count: ${bookings.length}`);
    lines.push(`Customer bill count: ${bills.length}`);
    lines.push(`Customer payment count: ${payments.length}`);
  } else if (user.role === "operator") {
    const jobs = await Booking.find({ operatorId: user._id })
      .select("machine work status userId date")
      .limit(10);
    lines.push(`Assigned job count: ${jobs.length}`);
  }

  return lines.join("\n");
};

const chat = async (req, res) => {
  try {
    const { message, conversationId } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required.",
      });
    }

    if (message.trim().length > 2000) {
      return res.status(400).json({
        success: false,
        message: "Message is too long.",
      });
    }

    const user = req.user;
    const context = await buildContext(user);

    const fullPrompt = `${SYSTEM_PROMPT}\n\nContext:\n${context}\n\nUser message:\n${message.trim()}`;

    const reply = await generateReply(fullPrompt, message.trim());

    let conversation = await AIConversation.findOne({ user: user._id });
    if (!conversation) {
      conversation = new AIConversation({ user: user._id, messages: [] });
    }

    conversation.messages.push(
      { senderType: "user", content: message.trim() },
      { senderType: "assistant", content: reply }
    );

    await conversation.save();

    return res.status(200).json({
      success: true,
      reply,
      conversationId: conversation._id,
    });
  } catch (error) {
    console.error("AI chat error:", {
      status: error.status,
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({
      success: false,
      message: "Bismi AI is temporarily unavailable. Please try again.",
    });
  }
};

const getHistory = async (req, res) => {
  try {
    const conversation = await AIConversation.findOne({ user: req.user._id });
    return res.status(200).json({
      success: true,
      messages: conversation?.messages || [],
      conversationId: conversation?._id || null,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to fetch AI history.",
    });
  }
};

const clearHistory = async (req, res) => {
  try {
    await AIConversation.deleteOne({ user: req.user._id });
    return res.status(200).json({ success: true, message: "AI history cleared." });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Unable to clear AI history.",
    });
  }
};

module.exports = { chat, getHistory, clearHistory };