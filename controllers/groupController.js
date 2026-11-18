const Group = require("../models/Group");
const Message = require("../models/Message");
const User = require("../models/User");

const isAdmin = (user) => user.role === "admin";

const isMember = (group, userId) =>
  group.members.some((m) => String(m) === String(userId)) ||
  String(group.createdBy) === String(userId);

const createGroup = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only." });
    }

    const { name, description, memberIds } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Group name is required." });
    }

    const members = Array.isArray(memberIds) ? memberIds : [];
    const validMembers = await User.find({ _id: { $in: members } }).select("_id");

    const group = await Group.create({
      name: name.trim(),
      description: description || "",
      profileImage: req.file ? `/uploads/${req.file.filename}` : "",
      createdBy: req.user._id,
      members: validMembers.map((u) => u._id),
    });

    return res.status(201).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getGroups = async (req, res) => {
  try {
    let query = { isActive: true, deletedAt: null };

    if (!isAdmin(req.user)) {
      query.members = req.user._id;
    }

    const groups = await Group.find(query)
      .populate("members", "username role")
      .populate("createdBy", "username role")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, groups });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate("members", "username role")
      .populate("createdBy", "username role");

    if (!group || !group.isActive || group.deletedAt) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isAdmin(req.user) && !isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const updateGroup = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only." });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group || !group.isActive || group.deletedAt) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (req.body.name) group.name = req.body.name.trim();
    if (req.body.description !== undefined) group.description = req.body.description;
    if (req.file) group.profileImage = `/uploads/${req.file.filename}`;

    await group.save();

    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const addMembers = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only." });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group || !group.isActive || group.deletedAt) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    const { memberIds } = req.body;
    if (!Array.isArray(memberIds)) {
      return res.status(400).json({ success: false, message: "memberIds must be an array." });
    }

    const valid = await User.find({ _id: { $in: memberIds } }).select("_id");
    const existing = new Set(group.members.map(String));
    for (const u of valid) {
      if (!existing.has(String(u._id))) group.members.push(u._id);
    }

    await group.save();
    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const removeMember = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only." });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group || !group.isActive || group.deletedAt) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    group.members = group.members.filter((m) => String(m) !== String(req.params.userId));
    await group.save();

    return res.status(200).json({ success: true, group });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const deleteGroup = async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: "Admin only." });
    }

    const group = await Group.findById(req.params.groupId);
    if (!group) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    // Soft delete / archive
    group.isActive = false;
    group.deletedAt = new Date();
    await group.save();

    return res.status(200).json({ success: true, message: "Group archived." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const getGroupMessages = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group || !group.isActive || group.deletedAt) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isAdmin(req.user) && !isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const skip = (page - 1) * limit;

    const messages = await Message.find({ group: group._id })
      .populate("sender", "username role")
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({ success: true, messages, page, hasMore: messages.length === limit });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const sendGroupMessage = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group || !group.isActive || group.deletedAt) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isAdmin(req.user) && !isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    const { content, messageType, locationLatitude, locationLongitude, locationUrl } = req.body;

    let attachments = [];
    if (req.file) {
      attachments.push({
        url: `/uploads/${req.file.filename}`,
        name: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
    }

    const message = await Message.create({
      group: group._id,
      sender: req.user._id,
      content: content || "",
      messageType: messageType || (req.file ? "document" : "text"),
      attachments,
      location: locationLatitude
        ? {
            latitude: Number(locationLatitude),
            longitude: Number(locationLongitude),
            url: locationUrl || `https://www.google.com/maps?q=${locationLatitude},${locationLongitude}`,
          }
        : undefined,
    });

    const populated = await Message.findById(message._id).populate("sender", "username role");

    return res.status(201).json({ success: true, message: populated });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const markGroupRead = async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group || !group.isActive || group.deletedAt) {
      return res.status(404).json({ success: false, message: "Group not found." });
    }

    if (!isAdmin(req.user) && !isMember(group, req.user._id)) {
      return res.status(403).json({ success: false, message: "Access denied." });
    }

    await Message.updateMany(
      { group: group._id, sender: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createGroup,
  getGroups,
  getGroup,
  updateGroup,
  addMembers,
  removeMember,
  deleteGroup,
  getGroupMessages,
  sendGroupMessage,
  markGroupRead,
};