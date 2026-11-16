
const User = require("../models/User");
const AdminSettings = require("../models/AdminSettings");
const bcrypt = require("bcrypt");

// Check admin
const checkAdmin = (req, res) => {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({
      success: false,
      message: "Admin access required.",
    });
    return false;
  }

  return true;
};

// GET ADMIN SETTINGS
exports.getAdminSettings = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    const admin = await User.findById(req.user._id).select(
      "username email phone location role"
    );

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    let settings = await AdminSettings.findOne({
      userId: admin._id,
    });

    if (!settings) {
      settings = await AdminSettings.create({
        userId: admin._id,
      });
    }

    return res.status(200).json({
      success: true,
      profile: {
        name: admin.username || "",
        email: admin.email || "",
        phone: admin.phone || "",
        address: admin.location || "",
        role: admin.role,
        bio: settings.bio,
        photo: settings.photo,
      },
      business: {
        businessName: settings.businessName,
        phone: settings.businessPhone,
        address: settings.businessAddress,
      },
      notifications: settings.notifications,
    });
  } catch (error) {
    console.error("Get Admin Settings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch admin settings.",
    });
  }
};

// UPDATE ADMIN PROFILE
exports.updateAdminProfile = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    const { name, email, phone, address, bio, photo } = req.body;

    if (!name?.trim() || !email?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: req.user._id },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "This email is already in use.",
      });
    }

    if (photo && photo.length > 4 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Profile photo is too large.",
      });
    }

    const admin = await User.findByIdAndUpdate(
      req.user._id,
      {
        username: name.trim(),
        email: normalizedEmail,
        phone: phone?.trim() || "",
        location: address?.trim() || "",
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("username email phone location role");

    const settings = await AdminSettings.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          bio: bio?.trim() || "",
          photo: photo || "",
        },
        $setOnInsert: {
          userId: req.user._id,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Admin profile updated successfully.",
      profile: {
        name: admin.username,
        email: admin.email,
        phone: admin.phone,
        address: admin.location,
        role: admin.role,
        bio: settings.bio,
        photo: settings.photo,
      },
    });
  } catch (error) {
    console.error("Update Admin Profile Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update admin profile.",
    });
  }
};

// UPDATE BUSINESS SETTINGS
exports.updateBusinessSettings = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    const { businessName, phone, address } = req.body;

    if (!businessName?.trim() || !address?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Business name and address are required.",
      });
    }

    const settings = await AdminSettings.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          businessName: businessName.trim(),
          businessPhone: phone?.trim() || "",
          businessAddress: address.trim(),
        },
        $setOnInsert: {
          userId: req.user._id,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Business settings updated successfully.",
      business: {
        businessName: settings.businessName,
        phone: settings.businessPhone,
        address: settings.businessAddress,
      },
    });
  } catch (error) {
    console.error("Update Business Settings Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update business settings.",
    });
  }
};

// UPDATE NOTIFICATIONS
exports.updateNotifications = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    const {
      notifications,
      emailAlerts,
      bookingAlerts,
      paymentAlerts,
      operatorAlerts,
    } = req.body;

    const values = {
      notifications,
      emailAlerts,
      bookingAlerts,
      paymentAlerts,
      operatorAlerts,
    };

    for (const [key, value] of Object.entries(values)) {
      if (typeof value !== "boolean") {
        return res.status(400).json({
          success: false,
          message: `Invalid notification value: ${key}`,
        });
      }
    }

    const settings = await AdminSettings.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          notifications: values,
        },
        $setOnInsert: {
          userId: req.user._id,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Notification preferences saved.",
      notifications: settings.notifications,
    });
  } catch (error) {
    console.error("Update Notifications Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications.",
    });
  }
};

// CHANGE ADMIN PASSWORD
exports.changeAdminPassword = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) return;

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new passwords are required.",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must contain at least 8 characters.",
      });
    }

    const admin = await User.findById(req.user._id).select("+password");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin account not found.",
      });
    }

    const isMatch = await bcrypt.compare(
      currentPassword,
      admin.password
    );

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect.",
      });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Change Password Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to change password.",
    });
  }
};
