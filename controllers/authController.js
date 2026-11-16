
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTER USER
exports.registerUser = async (req, res) => {
  try {
    const { username, email, password, phone, location } = req.body;

    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        message: "Please fill all fields.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must contain at least 6 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User already exists. Please login.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
  username: username.trim(),
  email: normalizedEmail,
  password: hashedPassword,
  phone,
  location,
  role: "user",
});
     console.log("Saved user ID:", newUser._id);
console.log("Database:", newUser.db.name);
console.log("Collection:", newUser.collection.name);
console.log("Connected host:", User.db.host);
    return res.status(201).json({
      message: "Registration successful. Please login.",
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error.message);

    return res.status(500).json({
      message: "Registration failed.",
    });
  }
};

// LOGIN USER
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email?.trim() || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const isPasswordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!isPasswordMatch) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing in .env");
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      message: "Login failed.",
    });
  }
};
// GET LOGGED-IN USER PROFILE
exports.getProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.userId;

    if (!userId) {
      return res.status(401).json({
        message: "User not authenticated.",
      });
    }

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.status(200).json({
      message: "Profile fetched successfully.",
      user,
    });
  } catch (error) {
    console.error("Get profile error:", error);

    return res.status(500).json({
      message: "Unable to fetch profile.",
    });
  }
};

// UPDATE LOGGED-IN USER PROFILE
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId || req.userId;

    if (!userId) {
      return res.status(401).json({
        message: "User not authenticated.",
      });
    }

    const { username, name, email, phone, location } = req.body;

    if (!username?.trim() && !name?.trim()) {
      return res.status(400).json({
        message: "Username is required.",
      });
    }

    if (!email?.trim()) {
      return res.status(400).json({
        message: "Email is required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already exists.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        username: (username || name).trim(),
        email: normalizedEmail,
        phone: phone?.trim() || "",
        location: location?.trim() || "",
      },
      {
        new: true,
        runValidators: true,
      }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      message: "Profile update failed.",
    });
  }
};

// CHANGE PASSWORD

// CHANGE PASSWORD - USER / ADMIN / OPERATOR

// CHANGE PASSWORD - USER / ADMIN / OPERATOR
exports.changePassword = async (req, res) => {
  try {
    // Auth middleware-il ninnu authenticated user ID
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        message: "User not authenticated.",
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Please provide both passwords.",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "New password must contain at least 6 characters.",
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from current password.",
      });
    }

    // User, Admin, Operator ellavareyum same User model-il ninnu find cheyyunnu
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        message: "Account not found.",
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect. Please check your password.",
      });
    }console.log("CHANGE PASSWORD DEBUG");
console.log("User ID:", userId);
console.log("User Role:", user.role);
console.log("Password Hash Exists:", !!user.password);
console.log("Password Hash Format:", user.password?.substring(0, 7));

    // Hash new password
    user.password = await bcrypt.hash(newPassword, 10);

    await user.save();

    return res.status(200).json({
      message: "Password updated successfully.",
    });

  } catch (error) {
    console.error("Change password error:", error);

    return res.status(500).json({
      message: "Password update failed.",
    });
  }
};

