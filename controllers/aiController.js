const AIConversation = require("../models/AIConversation");
const { generateReply } = require("../services/aiService");
const { getRoleContext } = require("../services/aiDataService");

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

You are an informational assistant, not an administrator.

Security rules:
- Use only the authorized user context provided.
- Never reveal another user's private data.
- Customers can access only their own records.
- Operators can access only their own assigned jobs.
- Admins can access business-wide authorized summaries.
- Never claim to have performed an action.
- If asked for unauthorized data, refuse politely and explain the limitation.`;

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
    const context = await getRoleContext(user);

    const fullPrompt = `${SYSTEM_PROMPT}\n\nAuthorized user context (use only this data):\n${context}\n\nUser message:\n${message.trim()}`;

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