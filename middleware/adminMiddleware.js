
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Access denied. Please login first.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

console.log("Decoded token data:", decoded);

const user = await User.findById(decoded.id);

console.log("Admin user found:", !!user);
console.log("Database role:", user?.role);

if (!user || user.role !== "admin") {
  return res.status(403).json({
    message: "Access denied. Admin only.",
  });
}

    req.user = user;
    next();
  } catch (error) {
    console.error("Admin middleware error:", error.message);

    return res.status(401).json({
      message: "Invalid or expired token.",
    });
  }
};

module.exports = adminMiddleware;
