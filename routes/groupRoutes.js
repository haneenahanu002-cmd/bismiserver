const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authmiddleware");
const groupController = require("../controllers/groupController");
const { upload } = require("../middleware/uploadMiddleware");

router.get("/", authMiddleware, groupController.getGroups);
router.post("/", authMiddleware, upload.single("profileImage"), groupController.createGroup);
router.get("/:groupId", authMiddleware, groupController.getGroup);
router.patch("/:groupId", authMiddleware, upload.single("profileImage"), groupController.updateGroup);
router.post("/:groupId/members", authMiddleware, groupController.addMembers);
router.delete("/:groupId/members/:userId", authMiddleware, groupController.removeMember);
router.delete("/:groupId", authMiddleware, groupController.deleteGroup);
router.get("/:groupId/messages", authMiddleware, groupController.getGroupMessages);
router.post("/:groupId/messages", authMiddleware, upload.single("file"), groupController.sendGroupMessage);
router.patch("/:groupId/read", authMiddleware, groupController.markGroupRead);

module.exports = router;