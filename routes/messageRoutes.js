const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authmiddleware");
const messageController = require("../controllers/messageController");

router.get("/conversations", authMiddleware, messageController.getConversations);
router.get("/participants", authMiddleware, messageController.getAvailableParticipants);
router.post("/conversations", authMiddleware, messageController.createConversation);
router.get("/:conversationId", authMiddleware, messageController.getMessages);
router.post("/:conversationId", authMiddleware, messageController.sendMessage);
router.patch("/:conversationId/read", authMiddleware, messageController.markRead);
router.get("/unread-count", authMiddleware, messageController.getUnreadCount);

module.exports = router;