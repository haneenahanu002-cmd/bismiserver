const User = require("../models/User");

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ role: "user" })
      .select("-password")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Users fetched successfully",
      users,
    });
  } catch (error) {
    console.error("Get all users error:", error);

    return res.status(500).json({
      message: "Failed to fetch users",
    });
  }
};

module.exports = {
  getAllUsers,
};