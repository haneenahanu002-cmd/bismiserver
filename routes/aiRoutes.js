const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authmiddleware");
const { rateLimit } = require("../middleware/rateLimiter");
const aiController = require("../controllers/aiController");

router.post("/chat", authMiddleware, rateLimit({ windowMs: 60000, max: 20 }), aiController.chat);
router.get("/history", authMiddleware, aiController.getHistory);
router.delete("/history", authMiddleware, aiController.clearHistory);

module.exports = router;